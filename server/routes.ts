import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { insertTrackSchema, updateUsernameSchema } from "@shared/schema";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { audioStorage, mediaStorage } from "./objectStorage";

const MUSIC_DIR = path.join(process.cwd(), "music");

// Ensure music directory exists
if (!fs.existsSync(MUSIC_DIR)) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

// Helper to extract video ID from YouTube URL
function extractVideoId(url: string): string | null {
  const regex = /(?:v=|\/|youtu\.be\/)([0-9A-Za-z_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Stream URL cache (URLs are valid for ~6 hours, we cache for 2 hours)
const streamUrlCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours in ms

// Get streaming URL from YouTube using yt-dlp (with caching)
async function getStreamUrl(videoId: string): Promise<string | null> {
  // Check cache first
  const cached = streamUrlCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Streaming] Using cached URL for ${videoId}`);
    return cached.url;
  }

  const cookiesPath = path.join(process.cwd(), "youtube_cookies.txt");
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  const args = [
    "-m", "yt_dlp",
    "--js-runtimes", "node",
    "--remote-components", "ejs:github",
    "-f", "bestaudio",
    "--skip-download",
    "--print", "url",
  ];
  
  if (fs.existsSync(cookiesPath)) {
    args.push("--cookies", cookiesPath);
  }
  
  args.push(youtubeUrl);
  
  return new Promise((resolve) => {
    const ytdlp = spawn("python3", args);
    let streamUrl = "";
    let errorOutput = "";
    
    ytdlp.stdout.on("data", (data) => {
      streamUrl += data.toString();
    });
    
    ytdlp.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
    
    ytdlp.on("close", (code) => {
      if (code === 0 && streamUrl.trim()) {
        const url = streamUrl.trim();
        console.log(`[Streaming] Got stream URL for ${videoId}`);
        // Cache the URL
        streamUrlCache.set(videoId, { url, timestamp: Date.now() });
        resolve(url);
      } else {
        console.error(`[Streaming] Failed to get stream URL for ${videoId}:`, errorOutput);
        resolve(null);
      }
    });
    
    ytdlp.on("error", (err) => {
      console.error(`[Streaming] Spawn error for ${videoId}:`, err);
      resolve(null);
    });
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health check endpoint (before auth to ensure it always works)
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Diagnostic endpoint to check yt-dlp availability and cookies
  app.get("/api/diagnostic", async (_req, res) => {
    const cookiesPath = path.join(process.cwd(), "youtube_cookies.txt");
    const results: Record<string, any> = {
      timestamp: new Date().toISOString(),
      node_env: process.env.NODE_ENV || "development",
      cwd: process.cwd(),
      music_dir: MUSIC_DIR,
      music_dir_exists: fs.existsSync(MUSIC_DIR),
      cookies_file_exists: fs.existsSync(cookiesPath),
      cookies_file_path: cookiesPath,
      object_storage_configured: audioStorage.isConfigured(),
      audio_storage_dir: process.env.AUDIO_STORAGE_DIR || "(not set)",
    };

    // Check yt-dlp
    try {
      const ytdlp = spawn("python3", ["-m", "yt_dlp", "--version"]);
      let version = "";
      ytdlp.stdout.on("data", (data) => { version += data.toString(); });
      await new Promise<void>((resolve) => {
        ytdlp.on("close", (code) => {
          results.ytdlp_available = code === 0;
          results.ytdlp_version = version.trim() || "unknown";
          resolve();
        });
        ytdlp.on("error", () => {
          results.ytdlp_available = false;
          results.ytdlp_error = "spawn failed";
          resolve();
        });
      });
    } catch (err: any) {
      results.ytdlp_available = false;
      results.ytdlp_error = err.message;
    }

    // Check ffmpeg
    try {
      const ffmpeg = spawn("ffmpeg", ["-version"]);
      let ffver = "";
      ffmpeg.stdout.on("data", (data) => { ffver += data.toString().split('\n')[0]; });
      await new Promise<void>((resolve) => {
        ffmpeg.on("close", (code) => {
          results.ffmpeg_available = code === 0;
          results.ffmpeg_version = ffver.trim() || "unknown";
          resolve();
        });
        ffmpeg.on("error", () => {
          results.ffmpeg_available = false;
          resolve();
        });
      });
    } catch (err: any) {
      results.ffmpeg_available = false;
    }

    // Add bot detection warning for production without cookies
    if (results.node_env === "production" && !results.cookies_file_exists) {
      results.warning = "Production without cookies - downloads may fail due to YouTube bot detection. Add youtube_cookies.txt file.";
    }

    // Test object storage read/write using @google-cloud/storage
    if (audioStorage.isConfigured()) {
      try {
        const { Storage } = await import("@google-cloud/storage");
        const testClient = new Storage({
          credentials: {
            audience: "replit",
            subject_token_type: "access_token",
            token_url: "http://127.0.0.1:1106/token",
            type: "external_account",
            credential_source: {
              url: "http://127.0.0.1:1106/credential",
              format: {
                type: "json",
                subject_token_field_name: "access_token",
              },
            },
            universe_domain: "googleapis.com",
          },
          projectId: "",
        });
        
        const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
        results.private_object_dir = privateDir;
        
        if (privateDir) {
          const pathParts = privateDir.split("/").filter(p => p);
          const bucketName = pathParts[0];
          const testObjectName = `${pathParts.slice(1).join("/")}/_test_${Date.now()}.txt`;
          const testData = "test-" + Date.now();
          
          const bucket = testClient.bucket(bucketName);
          const file = bucket.file(testObjectName);
          
          // Try to write
          await file.save(testData, { contentType: "text/plain" });
          results.object_storage_write = "success";
          
          // Try to read
          const [content] = await file.download();
          results.object_storage_read = content.toString() === testData ? "success" : "content mismatch";
          
          // Clean up
          await file.delete();
        }
      } catch (err: any) {
        results.object_storage_test_error = err.message || String(err);
      }
    }

    res.json(results);
  });

  // POST /api/migrate-to-storage - Migrate local files to Object Storage
  app.post("/api/migrate-to-storage", async (_req, res) => {
    if (!audioStorage.isConfigured()) {
      return res.status(400).json({ 
        error: "Object Storage not configured. Set AUDIO_STORAGE_DIR environment variable." 
      });
    }

    try {
      const tracks = await storage.getAllTracks();
      const readyTracks = tracks.filter(t => t.status === "ready");
      
      let migrated = 0;
      let skipped = 0;
      let failed = 0;
      const results: any[] = [];

      for (const track of readyTracks) {
        // Check if already in Object Storage
        const existsInStorage = await audioStorage.exists(track.videoId);
        if (existsInStorage) {
          skipped++;
          results.push({ videoId: track.videoId, title: track.title, status: "skipped", reason: "already in storage" });
          continue;
        }

        // Check if local file exists
        if (!fs.existsSync(track.filePath)) {
          failed++;
          results.push({ videoId: track.videoId, title: track.title, status: "failed", reason: "local file not found" });
          continue;
        }

        // Upload to Object Storage
        const objectPath = await audioStorage.uploadAudioFile(track.filePath, track.videoId);
        if (objectPath) {
          migrated++;
          results.push({ videoId: track.videoId, title: track.title, status: "migrated", path: objectPath });
        } else {
          failed++;
          results.push({ videoId: track.videoId, title: track.title, status: "failed", reason: "upload failed" });
        }
      }

      res.json({
        total: readyTracks.length,
        migrated,
        skipped,
        failed,
        results
      });
    } catch (error) {
      console.error("Migration error:", error);
      res.status(500).json({ error: "Migration failed", details: String(error) });
    }
  });

  // Track active re-downloads to prevent duplicates
  const activeRedownloads = new Set<string>();

  // POST /api/redownload-tracks - Re-download tracks from YouTube and store in Object Storage
  app.post("/api/redownload-tracks", async (req, res) => {
    if (!audioStorage.isConfigured()) {
      return res.status(400).json({ 
        error: "Object Storage not configured. Set AUDIO_STORAGE_DIR environment variable." 
      });
    }

    const { limit = 10 } = req.body; // Process in batches to avoid timeout
    
    try {
      const tracks = await storage.getAllTracks();
      const readyTracks = tracks.filter(t => t.status === "ready");
      
      // Find tracks that need re-downloading (not in Object Storage)
      const tracksToRedownload: typeof readyTracks = [];
      
      for (const track of readyTracks) {
        if (activeRedownloads.has(track.videoId)) {
          continue; // Skip if already being re-downloaded
        }
        const existsInStorage = await audioStorage.exists(track.videoId);
        if (!existsInStorage) {
          tracksToRedownload.push(track);
          if (tracksToRedownload.length >= limit) break;
        }
      }

      if (tracksToRedownload.length === 0) {
        return res.json({ 
          message: "All tracks are already in storage",
          total: readyTracks.length,
          pending: 0
        });
      }

      // Start re-downloads in background
      const redownloadResults: any[] = [];
      
      for (const track of tracksToRedownload) {
        activeRedownloads.add(track.videoId);
        
        // Re-download from YouTube
        const outputPath = path.join(MUSIC_DIR, `${track.videoId}.mp3`);
        const cookiesPath = path.join(process.cwd(), "youtube_cookies.txt");
        const useCookies = fs.existsSync(cookiesPath);
        
        const args = [
          "-m", "yt_dlp",
          "-f", "bestaudio",
          "--extract-audio",
          "--audio-format", "mp3",
          "--audio-quality", "0",
          // Performance optimizations for faster downloads
          "--concurrent-fragments", "4",
          "--buffer-size", "16K",
          "-o", outputPath,
          "--no-playlist",
          "--no-warnings"
        ];
        
        if (useCookies) {
          args.push("--cookies", cookiesPath);
        }
        
        args.push(`https://www.youtube.com/watch?v=${track.videoId}`);
        
        console.log(`Re-downloading ${track.videoId}: ${track.title}`);
        
        const ytdlp = spawn("python3", args);
        
        ytdlp.on("close", async (code) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            // Upload to Object Storage
            const objectPath = await audioStorage.uploadAudioFile(outputPath, track.videoId);
            if (objectPath) {
              console.log(`Re-downloaded and uploaded: ${track.title}`);
            } else {
              console.error(`Failed to upload after re-download: ${track.title}`);
            }
          } else {
            console.error(`Re-download failed for ${track.videoId}: ${track.title}`);
          }
          activeRedownloads.delete(track.videoId);
        });
        
        ytdlp.on("error", (err) => {
          console.error(`Re-download error for ${track.videoId}:`, err);
          activeRedownloads.delete(track.videoId);
        });
        
        redownloadResults.push({ videoId: track.videoId, title: track.title, status: "started" });
      }

      // Count remaining tracks that need re-download
      let pendingCount = 0;
      for (const track of readyTracks) {
        const existsInStorage = await audioStorage.exists(track.videoId);
        if (!existsInStorage && !activeRedownloads.has(track.videoId)) {
          pendingCount++;
        }
      }

      res.json({
        message: `Started re-downloading ${tracksToRedownload.length} tracks`,
        started: redownloadResults,
        total: readyTracks.length,
        pending: pendingCount - tracksToRedownload.length,
        inProgress: activeRedownloads.size
      });
    } catch (error) {
      console.error("Re-download error:", error);
      res.status(500).json({ error: "Re-download failed", details: String(error) });
    }
  });

  // GET /api/redownload-status - Check status of re-downloads
  app.get("/api/redownload-status", async (_req, res) => {
    try {
      const tracks = await storage.getAllTracks();
      const readyTracks = tracks.filter(t => t.status === "ready");
      
      let inStorage = 0;
      let missing = 0;
      
      for (const track of readyTracks) {
        const existsInStorage = await audioStorage.exists(track.videoId);
        if (existsInStorage) {
          inStorage++;
        } else {
          missing++;
        }
      }

      res.json({
        total: readyTracks.length,
        inStorage,
        missing,
        inProgress: activeRedownloads.size,
        activeVideoIds: Array.from(activeRedownloads)
      });
    } catch (error) {
      console.error("Status check error:", error);
      res.status(500).json({ error: "Failed to check status" });
    }
  });

  // Setup authentication
  await setupAuth(app);

  // GET /api/auth/user - Get current user
  app.get('/api/auth/user', async (req: any, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const claims = req.user?.claims;
    if (!claims) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    // Try to get the user's profile avatar (user-uploaded) first, 
    // then fall back to OIDC claims
    let profileImageUrl = claims.picture || claims.profile_image_url || null;
    
    try {
      const profile = await storage.getProfile(claims.sub);
      if (profile?.avatarUrl) {
        profileImageUrl = profile.avatarUrl;
      }
    } catch (e) {
      // Profile might not exist yet, that's okay
    }
    
    res.json({
      id: claims.sub,
      email: claims.email,
      firstName: claims.first_name || claims.given_name,
      lastName: claims.last_name || claims.family_name,
      profileImageUrl,
    });
  });

  // GET /api/tracks - List all tracks (legacy, returns all for backward compat)
  app.get("/api/tracks", async (req, res) => {
    try {
      const tracks = await storage.getAllTracks();
      res.json(tracks);
    } catch (error) {
      console.error("Error fetching tracks:", error);
      res.status(500).json({ error: "Failed to fetch tracks" });
    }
  });

  // GET /api/tracks/mine - Get current user's personal tracks
  app.get("/api/tracks/mine", async (req: any, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "User ID not found" });
      }
      const tracks = await storage.getUserTracks(userId);
      res.json(tracks);
    } catch (error) {
      console.error("Error fetching user tracks:", error);
      res.status(500).json({ error: "Failed to fetch tracks" });
    }
  });

  // GET /api/tracks/shared - Get all shared tracks
  app.get("/api/tracks/shared", async (_req, res) => {
    try {
      const tracks = await storage.getSharedTracks();
      res.json(tracks);
    } catch (error) {
      console.error("Error fetching shared tracks:", error);
      res.status(500).json({ error: "Failed to fetch tracks" });
    }
  });

  // GET /api/tracks/:id - Get a single track by ID
  app.get("/api/tracks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid track ID" });
      }
      const track = await storage.getTrackById(id);
      if (!track) {
        return res.status(404).json({ error: "Track not found" });
      }
      res.json(track);
    } catch (error) {
      console.error("Error fetching track:", error);
      res.status(500).json({ error: "Failed to fetch track" });
    }
  });

  // POST /api/download - Download a video (requires authentication)
  app.post("/api/download", async (req: any, res) => {
    try {
      // Require authentication for downloads
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Please sign in to download music" });
      }

      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const videoId = extractVideoId(url);
      if (!videoId) {
        return res.status(400).json({ error: "Invalid YouTube URL" });
      }

      // Get current user ID (required)
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "User ID not found" });
      }

      // Check if user already has this track
      const existing = await storage.getTrackByVideoIdForUser(videoId, userId);
      if (existing) {
        return res.status(409).json({ 
          error: "You already have this track", 
          track: existing 
        });
      }

      // Check if ANY user already has this track ready - reuse instead of re-downloading
      const existingReady = await storage.getReadyTrackByVideoId(videoId);
      if (existingReady) {
        console.log(`Reusing existing track ${videoId} for user ${userId} (original user: ${existingReady.userId})`);
        // Create a library entry for this user pointing to the same file
        const track = await storage.createTrack({
          videoId,
          title: existingReady.title,
          channel: existingReady.channel,
          filePath: existingReady.filePath,
          thumbnail: existingReady.thumbnail,
          status: "ready",
          progress: 100,
          userId: userId,
          isShared: 0,
        });
        return res.json({ 
          message: "Track added to your library", 
          track,
          reused: true 
        });
      }

      // Create initial track entry with userId
      const outputPath = path.join(MUSIC_DIR, `${videoId}_${userId.slice(0, 8)}.mp3`);
      const track = await storage.createTrack({
        videoId,
        title: `Downloading ${videoId}...`,
        channel: "YouTube",
        filePath: outputPath,
        status: "downloading",
        progress: 0,
        userId: userId,
        isShared: 0,
      });

      // Start download in background using Python yt-dlp module
      console.log(`Starting download for ${videoId} to ${outputPath}`);
      
      // Check for YouTube cookies file (required for production to bypass bot detection)
      const cookiesPath = path.join(process.cwd(), "youtube_cookies.txt");
      const hasCookies = fs.existsSync(cookiesPath);
      
      if (!hasCookies && process.env.NODE_ENV === "production") {
        console.warn("WARNING: No youtube_cookies.txt file found. Downloads may fail due to bot detection.");
      }
      
      // Use options to bypass YouTube bot detection in production
      const ytdlpArgs = [
        "-m", "yt_dlp",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        // Performance optimizations for faster downloads
        "--concurrent-fragments", "4",
        "--buffer-size", "16K",
        // Use multiple player clients for better success rate
        "--extractor-args", "youtube:player_client=android,web,default",
        // Add user agent to appear as a real browser
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        // Force IPv4 to avoid IPv6 routing issues
        "--force-ipv4",
        // Geo bypass for region restrictions
        "--geo-bypass",
        // Add slight delay between requests to appear more human
        "--sleep-interval", "1",
        "--max-sleep-interval", "3",
        // Retry failed downloads
        "--retries", "5",
        "--fragment-retries", "5",
        // Output options
        "-o", outputPath,
        "--print-json",
        "--no-warnings",
        url
      ];
      
      // Add cookies if available (critical for production)
      if (hasCookies) {
        ytdlpArgs.splice(2, 0, "--cookies", cookiesPath);
        console.log(`Using cookies from ${cookiesPath}`);
      }
      
      const ytdlp = spawn("python3", ytdlpArgs);

      let jsonOutput = "";
      let stderrOutput = "";
      
      ytdlp.stdout.on("data", (data) => {
        jsonOutput += data.toString();
      });

      ytdlp.stderr.on("data", (data) => {
        const msg = data.toString();
        stderrOutput += msg;
        console.log(`yt-dlp stderr: ${msg.trim()}`);
      });

      const trackId = track.id;
      
      ytdlp.on("error", async (err) => {
        console.error(`yt-dlp spawn error for ${videoId}:`, err);
        await storage.updateTrackStatusById(trackId, "error", 0);
      });

      ytdlp.on("close", async (code) => {
        console.log(`yt-dlp closed for ${videoId} with code ${code}`);
        if (code === 0) {
          try {
            const info = JSON.parse(jsonOutput);
            const rawTitle = info.title || `Track ${videoId}`;
            const thumbnailUrl = info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            
            // Extract artist intelligently
            let artist = "";
            let cleanTitle = rawTitle;
            
            // 1. Check if yt-dlp has artist metadata (common for music)
            if (info.artist) {
              artist = info.artist;
            } 
            // 2. Try to extract from title pattern "Artist - Song Title"
            else if (rawTitle.includes(" - ")) {
              const parts = rawTitle.split(" - ");
              const potentialArtist = parts[0].trim();
              // Clean up common prefixes/suffixes
              artist = potentialArtist
                .replace(/^\[.*?\]\s*/, '')  // Remove [anything] prefix
                .replace(/\s*\(.*?\)\s*$/, '') // Remove (anything) suffix
                .trim();
              // Keep the full title but we extracted the artist
              cleanTitle = rawTitle;
            }
            // 3. Check for "Artist Name ft." or "Artist Name feat." patterns
            else if (/^[\w\s]+\s+(ft\.|feat\.|featuring)/i.test(rawTitle)) {
              const match = rawTitle.match(/^([\w\s]+?)\s+(ft\.|feat\.|featuring)/i);
              if (match) {
                artist = match[1].trim();
              }
            }
            // 4. Fall back to channel/uploader, but filter out known non-artist channels
            if (!artist) {
              const channelName = info.channel || info.uploader || "YouTube";
              const nonArtistChannels = [
                'WORLDSTARHIPHOP', 'Thizzler On The Roof', 'On The Radar Radio',
                'Club Shay Shay', 'Proxclusiv', 'TIARRAMARIEFILMS', 'LN1800',
                'ShotBy O.A', 'Gangstaslotheditz', 'ImYungVlone', 'UpcomingPhilly',
                'Audio Exhibit', 'archived.mp3', 'Counterpoint 2.0', 'cHefbox',
                'Elevator', 'No Jumper', 'Lyrical Lemonade', 'Cole Bennett',
                'COLORS', 'Genius', 'Mass Appeal', 'Complex', 'XXL', 'Pitchfork',
                'HotNewHipHop', 'Rap City', 'BET Hip Hop', 'MTV', 'VH1'
              ];
              
              // If it's a known non-artist channel, try harder to extract from title
              if (nonArtistChannels.some(c => channelName.toLowerCase().includes(c.toLowerCase()))) {
                // Try to get first word(s) before common separators
                const titleMatch = rawTitle.match(/^([\w\s]+?)(?:\s*[-–—|:]\s*|\s+(?:ft\.|feat\.|x\s))/i);
                if (titleMatch) {
                  artist = titleMatch[1].trim();
                } else {
                  artist = channelName; // Last resort
                }
              } else {
                // Clean up " - Topic" suffix from YouTube auto-generated channels
                artist = channelName.replace(/\s*-\s*Topic$/i, '').trim();
              }
            }
            
            await storage.updateTrackMetadataById(trackId, cleanTitle, artist, thumbnailUrl);
            
            // Upload to Object Storage for production persistence
            if (audioStorage.isConfigured() && fs.existsSync(outputPath)) {
              const objectPath = await audioStorage.uploadAudioFile(outputPath, videoId);
              if (objectPath) {
                console.log(`Uploaded ${videoId} to object storage: ${objectPath}`);
              }
            }
            
            await storage.updateTrackStatusById(trackId, "ready", 100);
            console.log(`Download complete: ${cleanTitle} by ${artist}`);
          } catch (parseError) {
            console.error("Failed to parse yt-dlp output:", parseError);
            await storage.updateTrackMetadataById(trackId, `Track ${videoId}`, "YouTube", `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
            
            // Try to upload even if metadata parsing failed
            if (audioStorage.isConfigured() && fs.existsSync(outputPath)) {
              await audioStorage.uploadAudioFile(outputPath, videoId);
            }
            
            await storage.updateTrackStatusById(trackId, "ready", 100);
          }
        } else {
          console.error(`Download failed for ${videoId} with code ${code}. Stderr: ${stderrOutput}`);
          await storage.updateTrackStatusById(trackId, "error", 0);
        }
      });

      res.json({ 
        message: "Download started", 
        track 
      });
    } catch (error) {
      console.error("Error starting download:", error);
      res.status(500).json({ error: "Failed to start download" });
    }
  });

  // DELETE /api/tracks/:id - Delete a track
  app.delete("/api/tracks/:id", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid track ID" });
      }

      const track = await storage.getTrackById(id);
      if (!track) {
        return res.status(404).json({ error: "Track not found" });
      }

      // Check ownership - only owner or admin can delete
      const userId = req.isAuthenticated() ? req.user?.claims?.sub : null;
      if (track.userId && track.userId !== userId) {
        return res.status(403).json({ error: "You don't have permission to delete this track" });
      }

      // Delete the audio file from local if it exists
      if (fs.existsSync(track.filePath)) {
        fs.unlinkSync(track.filePath);
      }

      // Delete from Object Storage if configured
      if (audioStorage.isConfigured()) {
        await audioStorage.deleteAudioFile(track.videoId);
      }

      // Delete from database
      await storage.deleteTrack(id);
      
      res.json({ message: "Track deleted successfully" });
    } catch (error) {
      console.error("Error deleting track:", error);
      res.status(500).json({ error: "Failed to delete track" });
    }
  });

  // PUT /api/tracks/:id/share - Toggle sharing for a track
  app.put("/api/tracks/:id/share", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid track ID" });
      }

      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userId = req.user?.claims?.sub;
      const track = await storage.getTrackById(id);
      
      if (!track) {
        return res.status(404).json({ error: "Track not found" });
      }

      // Check ownership - only owner can share/unshare
      if (track.userId !== userId) {
        return res.status(403).json({ error: "You can only share your own tracks" });
      }

      // Calculate new status
      const newSharedStatus = track.isShared === 1 ? 0 : 1;

      // If trying to share, check if this song is already shared by someone else
      if (newSharedStatus === 1) {
        const alreadyShared = await storage.isVideoIdAlreadyShared(track.videoId);
        if (alreadyShared) {
          return res.status(409).json({ 
            error: "This song is already in the community library" 
          });
        }
      }

      await storage.updateTrackShared(id, newSharedStatus);
      
      res.json({ 
        message: newSharedStatus === 1 ? "Track shared with community" : "Track unshared",
        isShared: newSharedStatus
      });
    } catch (error) {
      console.error("Error toggling share:", error);
      res.status(500).json({ error: "Failed to update track sharing" });
    }
  });

  // POST /api/tracks/:id/add-to-library - Add any existing track to user's personal library
  app.post("/api/tracks/:id/add-to-library", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid track ID" });
      }

      // Require authentication
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Please sign in to add tracks to your library" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "User ID not found" });
      }

      // Get the source track
      const sourceTrack = await storage.getTrackById(id);
      if (!sourceTrack) {
        return res.status(404).json({ error: "Track not found" });
      }

      // Check if user already owns this track
      if (sourceTrack.userId === userId) {
        return res.status(400).json({ error: "This track is already in your library" });
      }

      // Check if user already has this track (by videoId)
      const existingTrack = await storage.getTrackByVideoIdForUser(sourceTrack.videoId, userId);
      if (existingTrack) {
        return res.status(409).json({ 
          error: "You already have this track in your library", 
          track: existingTrack 
        });
      }

      // Create a new track entry for the current user
      // The audio file is shared via object storage, so we don't need to copy it
      const newTrack = await storage.createTrack({
        videoId: sourceTrack.videoId,
        title: sourceTrack.title,
        channel: sourceTrack.channel,
        filePath: sourceTrack.filePath, // Same file path since audio is shared
        thumbnail: sourceTrack.thumbnail,
        status: "ready", // Already downloaded
        progress: 100,
        userId: userId,
        isShared: 0, // Start as not shared in user's library
      });

      console.log(`User ${userId} added track ${sourceTrack.videoId} to their library (reused from existing)`);
      
      res.json({ 
        message: "Track added to your library",
        track: newTrack
      });
    } catch (error) {
      console.error("Error adding track to library:", error);
      res.status(500).json({ error: "Failed to add track to library" });
    }
  });

  // GET /api/audio/:videoId - Serve audio via streaming from YouTube
  app.get("/api/audio/:videoId", async (req, res) => {
    try {
      const { videoId } = req.params;
      
      // Check if track exists in database
      const track = await storage.getReadyTrackByVideoId(videoId);
      
      if (!track) {
        const anyTrack = await storage.getTrackByVideoId(videoId);
        if (anyTrack && anyTrack.status !== "ready") {
          return res.status(425).json({ error: "Track not ready yet" });
        }
        return res.status(404).json({ error: "Track not found" });
      }

      // Try local file first (for development/cached files)
      const filePath = track.filePath;
      if (fs.existsSync(filePath)) {
        console.log(`Serving ${videoId} from local file`);
        
        const range = req.headers.range;
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Accept-Ranges", "bytes");
        
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;

        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunksize = (end - start) + 1;
          const file = fs.createReadStream(filePath, { start, end });
          
          res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Content-Length": chunksize,
          });
          
          file.pipe(res);
        } else {
          res.writeHead(200, {
            "Content-Length": fileSize,
          });
          fs.createReadStream(filePath).pipe(res);
        }
        return;
      }

      // Try Object Storage next (for production persistence)
      if (audioStorage.isConfigured()) {
        console.log(`[ObjectStorage] Checking for ${videoId}`);
        const audioBuffer = await audioStorage.getAudioFile(videoId);
        if (audioBuffer) {
          console.log(`[ObjectStorage] Serving ${videoId} from object storage`);
          const range = req.headers.range;
          await audioStorage.streamAudioFile(audioBuffer, res, range);
          return;
        }
      }

      // No local file or object storage - use streaming from YouTube
      console.log(`[Streaming] Getting stream URL for ${videoId}`);
      const streamUrl = await getStreamUrl(videoId);
      
      if (streamUrl) {
        console.log(`[Streaming] Redirecting to YouTube stream for ${videoId}`);
        return res.redirect(streamUrl);
      }

      return res.status(404).json({ error: "Audio not available - could not get stream URL" });
    } catch (error) {
      console.error("Error serving audio:", error);
      res.status(500).json({ error: "Failed to serve audio" });
    }
  });

  // GET /api/stream/:videoId - Get streaming URL for any YouTube video (no download required)
  app.get("/api/stream/:videoId", async (req, res) => {
    try {
      const { videoId } = req.params;
      
      if (!videoId || videoId.length !== 11) {
        return res.status(400).json({ error: "Invalid video ID" });
      }

      console.log(`[Streaming] Getting stream URL for ${videoId}`);
      const streamUrl = await getStreamUrl(videoId);
      
      if (streamUrl) {
        console.log(`[Streaming] Returning stream URL for ${videoId}`);
        return res.json({ streamUrl });
      }

      return res.status(404).json({ error: "Could not get stream URL" });
    } catch (error) {
      console.error("Error getting stream URL:", error);
      res.status(500).json({ error: "Failed to get stream URL" });
    }
  });

  // ============================================
  // MEDIA UPLOAD API
  // ============================================

  // POST /api/upload - Upload media file (photo/video)
  app.post("/api/upload", isAuthenticated, async (req: any, res) => {
    try {
      const contentType = req.headers['content-type'] || '';
      
      if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
        return res.status(400).json({ error: "Only images and videos are allowed" });
      }

      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      
      await new Promise<void>((resolve, reject) => {
        req.on('end', () => resolve());
        req.on('error', reject);
      });

      const buffer = Buffer.concat(chunks);
      
      if (buffer.length === 0) {
        return res.status(400).json({ error: "No file data received" });
      }

      if (buffer.length > 10 * 1024 * 1024) {
        return res.status(400).json({ error: "File too large. Maximum 10MB allowed." });
      }

      const ext = contentType.split('/')[1] || 'bin';
      const filename = `upload.${ext}`;
      
      const mediaUrl = await mediaStorage.uploadMedia(buffer, filename, contentType);
      
      if (!mediaUrl) {
        return res.status(500).json({ error: "Failed to upload media" });
      }

      res.json({ url: mediaUrl });
    } catch (error) {
      console.error("Error uploading media:", error);
      res.status(500).json({ error: "Failed to upload media" });
    }
  });

  // GET /api/media/:path(*) - Serve uploaded media from object storage
  app.get("/api/media/*", async (req: any, res) => {
    try {
      const objectName = req.params[0] as string;
      
      if (!objectName) {
        return res.status(400).json({ error: "Invalid media path" });
      }

      const media = await mediaStorage.getMedia(objectName);
      
      if (!media) {
        return res.status(404).json({ error: "Media not found" });
      }

      res.setHeader('Content-Type', media.contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.send(media.buffer);
    } catch (error) {
      console.error("Error serving media:", error);
      res.status(500).json({ error: "Failed to serve media" });
    }
  });

  // GET /api/uploads/:filename - Serve locally uploaded media (fallback storage)
  app.get("/api/uploads/:filename", async (req: any, res) => {
    try {
      const filename = req.params.filename as string;
      
      if (!filename) {
        return res.status(400).json({ error: "Invalid filename" });
      }

      const media = mediaStorage.getLocalMedia(filename);
      
      if (!media) {
        return res.status(404).json({ error: "Media not found" });
      }

      res.setHeader('Content-Type', media.contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.send(media.buffer);
    } catch (error) {
      console.error("Error serving local media:", error);
      res.status(500).json({ error: "Failed to serve media" });
    }
  });

  // ============================================
  // SOCIAL FEATURES API
  // ============================================

  // GET /api/profile/me - Get current user's profile
  app.get("/api/profile/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      let profile = await storage.getProfile(userId);
      
      if (!profile) {
        const user = req.user;
        profile = await storage.createProfile({
          userId,
          username: user.claims?.email || `user_${userId}`,
          displayName: user.claims?.first_name || user.claims?.given_name || user.claims?.email?.split('@')[0] || 'User',
          avatarUrl: user.claims?.picture || user.claims?.profile_image_url || null,
        });
      }

      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // PATCH /api/profile/me - Update current user's profile
  app.patch("/api/profile/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { displayName, bio, avatarUrl, bannerUrl } = req.body;
      const updates: any = {};
      
      if (displayName !== undefined) updates.displayName = displayName;
      if (bio !== undefined) updates.bio = bio;
      if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
      if (bannerUrl !== undefined) updates.bannerUrl = bannerUrl;

      const profile = await storage.updateProfile(userId, updates);
      res.json(profile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // GET /api/username/check - Check username availability
  app.get("/api/username/check", isAuthenticated, async (req: any, res) => {
    try {
      const username = (req.query.username as string)?.toLowerCase();
      const userId = req.user?.claims?.sub;
      
      if (!username) {
        return res.status(400).json({ error: "Username required" });
      }
      
      const validation = updateUsernameSchema.safeParse({ username });
      if (!validation.success) {
        return res.json({ 
          available: false, 
          error: validation.error.errors[0]?.message || "Invalid username" 
        });
      }
      
      const available = await storage.checkUsernameAvailability(username, userId);
      res.json({ available, username });
    } catch (error) {
      console.error("Error checking username:", error);
      res.status(500).json({ error: "Failed to check username" });
    }
  });

  // PUT /api/username - Update current user's username
  app.put("/api/username", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const validation = updateUsernameSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: validation.error.errors[0]?.message || "Invalid username" 
        });
      }
      
      const { username } = validation.data;
      const success = await storage.updateUsername(userId, username);
      
      if (!success) {
        return res.status(409).json({ error: "Username already taken" });
      }
      
      const user = await storage.getUser(userId);
      res.json({ success: true, username: user?.username });
    } catch (error) {
      console.error("Error updating username:", error);
      res.status(500).json({ error: "Failed to update username" });
    }
  });

  // GET /api/users/:userId/profile - Get another user's profile
  app.get("/api/users/:userId/profile", async (req: any, res) => {
    try {
      const { userId } = req.params;
      const profile = await storage.getProfile(userId);
      
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const currentUserId = req.isAuthenticated?.() ? req.user?.claims?.sub : null;
      const isFollowing = currentUserId ? await storage.isFollowing(currentUserId, userId) : false;

      res.json({ ...profile, isFollowing });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // GET /api/users/search - Search users
  app.get("/api/users/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.json([]);
      }
      const profiles = await storage.searchProfiles(query);
      res.json(profiles);
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).json({ error: "Failed to search users" });
    }
  });

  // POST /api/users/:userId/follow - Follow a user
  app.post("/api/users/:userId/follow", isAuthenticated, async (req: any, res) => {
    try {
      const followerId = req.user?.claims?.sub;
      const { userId: followingId } = req.params;

      if (!followerId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (followerId === followingId) {
        return res.status(400).json({ error: "Cannot follow yourself" });
      }

      const isAlreadyFollowing = await storage.isFollowing(followerId, followingId);
      if (isAlreadyFollowing) {
        return res.status(400).json({ error: "Already following this user" });
      }

      const follow = await storage.followUser(followerId, followingId);
      
      // Create notification for the followed user
      try {
        const followerProfile = await storage.getProfile(followerId);
        const displayName = followerProfile?.displayName || followerProfile?.username || 'Someone';
        await storage.createNotification({
          userId: followingId,
          type: 'follow',
          actorId: followerId,
          message: `${displayName} started following you`,
        });
      } catch (notifError) {
        console.error("Failed to create follow notification:", notifError);
      }
      
      res.json({ success: true, follow });
    } catch (error) {
      console.error("Error following user:", error);
      res.status(500).json({ error: "Failed to follow user" });
    }
  });

  // DELETE /api/users/:userId/follow - Unfollow a user
  app.delete("/api/users/:userId/follow", isAuthenticated, async (req: any, res) => {
    try {
      const followerId = req.user?.claims?.sub;
      const { userId: followingId } = req.params;

      if (!followerId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      await storage.unfollowUser(followerId, followingId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error unfollowing user:", error);
      res.status(500).json({ error: "Failed to unfollow user" });
    }
  });

  // GET /api/users/:userId/followers - Get user's followers
  app.get("/api/users/:userId/followers", async (req, res) => {
    try {
      const { userId } = req.params;
      const followers = await storage.getFollowers(userId);
      res.json(followers);
    } catch (error) {
      console.error("Error fetching followers:", error);
      res.status(500).json({ error: "Failed to fetch followers" });
    }
  });

  // GET /api/users/:userId/following - Get users that user follows
  app.get("/api/users/:userId/following", async (req, res) => {
    try {
      const { userId } = req.params;
      const following = await storage.getFollowing(userId);
      res.json(following);
    } catch (error) {
      console.error("Error fetching following:", error);
      res.status(500).json({ error: "Failed to fetch following" });
    }
  });

  // GET /api/feed - Get current user's feed
  app.get("/api/feed", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const posts = await storage.getFeed(userId);
      
      const postsWithProfiles = await Promise.all(
        posts.map(async (post) => {
          const profile = await storage.getProfile(post.authorId);
          const userReaction = await storage.getReaction(post.id, userId);
          return { ...post, author: profile, userReaction: userReaction?.type || null };
        })
      );

      res.json(postsWithProfiles);
    } catch (error) {
      console.error("Error fetching feed:", error);
      res.status(500).json({ error: "Failed to fetch feed" });
    }
  });

  // GET /api/feed/discover - Get public posts for discovery
  app.get("/api/feed/discover", async (req: any, res) => {
    try {
      const allPosts = await storage.getUserPosts('');
      
      const postsWithProfiles = await Promise.all(
        allPosts.slice(0, 50).map(async (post) => {
          const profile = await storage.getProfile(post.authorId);
          return { ...post, author: profile };
        })
      );

      res.json(postsWithProfiles);
    } catch (error) {
      console.error("Error fetching discover feed:", error);
      res.status(500).json({ error: "Failed to fetch discover feed" });
    }
  });

  // POST /api/posts - Create a new post
  app.post("/api/posts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { content, mediaType, mediaUrl, trackId } = req.body;

      if (!content && !mediaUrl && !trackId) {
        return res.status(400).json({ error: "Post must have content, media, or a track" });
      }

      const post = await storage.createPost({
        authorId: userId,
        content,
        mediaType,
        mediaUrl,
        trackId,
      });

      const profile = await storage.getProfile(userId);
      res.json({ ...post, author: profile });
    } catch (error) {
      console.error("Error creating post:", error);
      res.status(500).json({ error: "Failed to create post" });
    }
  });

  // GET /api/posts/:postId - Get a single post
  app.get("/api/posts/:postId", async (req: any, res) => {
    try {
      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) {
        return res.status(400).json({ error: "Invalid post ID" });
      }

      const post = await storage.getPostById(postId);
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }

      const profile = await storage.getProfile(post.authorId);
      const currentUserId = req.isAuthenticated?.() ? req.user?.claims?.sub : null;
      const userReaction = currentUserId ? await storage.getReaction(postId, currentUserId) : null;

      res.json({ ...post, author: profile, userReaction: userReaction?.type || null });
    } catch (error) {
      console.error("Error fetching post:", error);
      res.status(500).json({ error: "Failed to fetch post" });
    }
  });

  // GET /api/users/:userId/posts - Get user's posts
  app.get("/api/users/:userId/posts", async (req: any, res) => {
    try {
      const { userId } = req.params;
      const posts = await storage.getUserPosts(userId);
      
      const profile = await storage.getProfile(userId);
      const currentUserId = req.isAuthenticated?.() ? req.user?.claims?.sub : null;

      const postsWithData = await Promise.all(
        posts.map(async (post) => {
          const userReaction = currentUserId ? await storage.getReaction(post.id, currentUserId) : null;
          return { ...post, author: profile, userReaction: userReaction?.type || null };
        })
      );

      res.json(postsWithData);
    } catch (error) {
      console.error("Error fetching user posts:", error);
      res.status(500).json({ error: "Failed to fetch user posts" });
    }
  });

  // DELETE /api/posts/:postId - Delete a post
  app.delete("/api/posts/:postId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const postId = parseInt(req.params.postId);

      if (isNaN(postId)) {
        return res.status(400).json({ error: "Invalid post ID" });
      }

      const post = await storage.getPostById(postId);
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }

      if (post.authorId !== userId) {
        return res.status(403).json({ error: "Cannot delete another user's post" });
      }

      await storage.deletePost(postId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting post:", error);
      res.status(500).json({ error: "Failed to delete post" });
    }
  });

  // POST /api/posts/:postId/reactions - Add/update reaction
  app.post("/api/posts/:postId/reactions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const postId = parseInt(req.params.postId);
      const { type } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (isNaN(postId)) {
        return res.status(400).json({ error: "Invalid post ID" });
      }

      if (!['like', 'dislike'].includes(type)) {
        return res.status(400).json({ error: "Invalid reaction type" });
      }

      const reaction = await storage.addReaction({ postId, userId, type });
      const post = await storage.getPostById(postId);
      
      // Create notification for the post author when someone likes their post
      if (type === 'like' && post && post.authorId !== userId) {
        try {
          const reactorProfile = await storage.getProfile(userId);
          const displayName = reactorProfile?.displayName || reactorProfile?.username || 'Someone';
          await storage.createNotification({
            userId: post.authorId,
            type: 'like',
            actorId: userId,
            targetId: postId,
            targetType: 'post',
            message: `${displayName} liked your post`,
          });
        } catch (notifError) {
          console.error("Failed to create like notification:", notifError);
        }
      }
      
      res.json({ reaction, likesCount: post?.likesCount, dislikesCount: post?.dislikesCount });
    } catch (error) {
      console.error("Error adding reaction:", error);
      res.status(500).json({ error: "Failed to add reaction" });
    }
  });

  // DELETE /api/posts/:postId/reactions - Remove reaction
  app.delete("/api/posts/:postId/reactions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const postId = parseInt(req.params.postId);

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (isNaN(postId)) {
        return res.status(400).json({ error: "Invalid post ID" });
      }

      await storage.removeReaction(postId, userId);
      const post = await storage.getPostById(postId);
      
      res.json({ success: true, likesCount: post?.likesCount, dislikesCount: post?.dislikesCount });
    } catch (error) {
      console.error("Error removing reaction:", error);
      res.status(500).json({ error: "Failed to remove reaction" });
    }
  });

  // GET /api/posts/:postId/comments - Get post comments
  app.get("/api/posts/:postId/comments", async (req: any, res) => {
    try {
      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) {
        return res.status(400).json({ error: "Invalid post ID" });
      }

      const comments = await storage.getPostComments(postId);
      
      const commentsWithProfiles = await Promise.all(
        comments.map(async (comment) => {
          const profile = await storage.getProfile(comment.authorId);
          return { ...comment, author: profile };
        })
      );

      res.json(commentsWithProfiles);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  // POST /api/posts/:postId/comments - Add a comment
  app.post("/api/posts/:postId/comments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const postId = parseInt(req.params.postId);
      const { content, parentId } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (isNaN(postId)) {
        return res.status(400).json({ error: "Invalid post ID" });
      }

      if (!content || !content.trim()) {
        return res.status(400).json({ error: "Comment content is required" });
      }

      const comment = await storage.createComment({
        postId,
        authorId: userId,
        content: content.trim(),
        parentId: parentId || null,
      });

      const profile = await storage.getProfile(userId);
      res.json({ ...comment, author: profile });
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ error: "Failed to create comment" });
    }
  });

  // DELETE /api/comments/:commentId - Delete a comment
  app.delete("/api/comments/:commentId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const commentId = parseInt(req.params.commentId);

      if (isNaN(commentId)) {
        return res.status(400).json({ error: "Invalid comment ID" });
      }

      await storage.deleteComment(commentId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ error: "Failed to delete comment" });
    }
  });

  // POST /api/posts/:postId/share - Share a post (creates a new post in user's feed)
  app.post("/api/posts/:postId/share", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const postId = parseInt(req.params.postId);
      const { comment } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (isNaN(postId)) {
        return res.status(400).json({ error: "Invalid post ID" });
      }

      // Get the original post to get its trackId
      const originalPost = await storage.getPostById(postId);
      if (!originalPost) {
        return res.status(404).json({ error: "Post not found" });
      }

      // Record the share
      const share = await storage.createShare({
        postId,
        userId,
        comment,
      });

      if (!share) {
        return res.status(409).json({ error: "Already shared" });
      }

      // Create a new post with the shared track and user's comment
      if (originalPost.trackId) {
        const newPost = await storage.createPost({
          authorId: userId,
          content: comment || null,
          trackId: originalPost.trackId,
        });

        const profile = await storage.getProfile(userId);
        res.json({ share, post: { ...newPost, author: profile } });
      } else {
        res.json({ share });
      }
    } catch (error) {
      console.error("Error sharing post:", error);
      res.status(500).json({ error: "Failed to share post" });
    }
  });

  // ============ PLAYLIST ROUTES ============

  // GET /api/playlists - Get user's playlists
  app.get("/api/playlists", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const userPlaylists = await storage.getUserPlaylists(userId);
      res.json(userPlaylists);
    } catch (error) {
      console.error("Error fetching playlists:", error);
      res.status(500).json({ error: "Failed to fetch playlists" });
    }
  });

  // POST /api/playlists - Create a new playlist
  app.post("/api/playlists", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { name, description, isPublic } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Playlist name is required" });
      }

      const playlist = await storage.createPlaylist({
        userId,
        name: name.trim(),
        description: description?.trim() || null,
        isPublic: isPublic ? 1 : 0,
      });

      res.json(playlist);
    } catch (error) {
      console.error("Error creating playlist:", error);
      res.status(500).json({ error: "Failed to create playlist" });
    }
  });

  // GET /api/playlists/:id - Get a specific playlist
  app.get("/api/playlists/:id", async (req: any, res) => {
    try {
      const playlistId = parseInt(req.params.id);
      if (isNaN(playlistId)) return res.status(400).json({ error: "Invalid playlist ID" });

      const playlist = await storage.getPlaylist(playlistId);
      if (!playlist) return res.status(404).json({ error: "Playlist not found" });

      res.json(playlist);
    } catch (error) {
      console.error("Error fetching playlist:", error);
      res.status(500).json({ error: "Failed to fetch playlist" });
    }
  });

  // PUT /api/playlists/:id - Update a playlist
  app.put("/api/playlists/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const playlistId = parseInt(req.params.id);
      if (isNaN(playlistId)) return res.status(400).json({ error: "Invalid playlist ID" });

      const playlist = await storage.getPlaylist(playlistId);
      if (!playlist) return res.status(404).json({ error: "Playlist not found" });
      if (playlist.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      const { name, description, isPublic } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description?.trim() || null;
      if (isPublic !== undefined) updates.isPublic = isPublic ? 1 : 0;

      const updated = await storage.updatePlaylist(playlistId, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating playlist:", error);
      res.status(500).json({ error: "Failed to update playlist" });
    }
  });

  // DELETE /api/playlists/:id - Delete a playlist
  app.delete("/api/playlists/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const playlistId = parseInt(req.params.id);
      if (isNaN(playlistId)) return res.status(400).json({ error: "Invalid playlist ID" });

      const playlist = await storage.getPlaylist(playlistId);
      if (!playlist) return res.status(404).json({ error: "Playlist not found" });
      if (playlist.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      await storage.deletePlaylist(playlistId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting playlist:", error);
      res.status(500).json({ error: "Failed to delete playlist" });
    }
  });

  // GET /api/playlists/:id/tracks - Get tracks in a playlist
  app.get("/api/playlists/:id/tracks", async (req, res) => {
    try {
      const playlistId = parseInt(req.params.id);
      if (isNaN(playlistId)) return res.status(400).json({ error: "Invalid playlist ID" });

      const tracks = await storage.getPlaylistTracksWithDetails(playlistId);
      res.json(tracks);
    } catch (error) {
      console.error("Error fetching playlist tracks:", error);
      res.status(500).json({ error: "Failed to fetch playlist tracks" });
    }
  });

  // POST /api/playlists/:id/tracks - Add a track to a playlist
  app.post("/api/playlists/:id/tracks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const playlistId = parseInt(req.params.id);
      if (isNaN(playlistId)) return res.status(400).json({ error: "Invalid playlist ID" });

      const playlist = await storage.getPlaylist(playlistId);
      if (!playlist) return res.status(404).json({ error: "Playlist not found" });
      if (playlist.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      const { trackId } = req.body;
      if (!trackId) return res.status(400).json({ error: "Track ID is required" });

      const playlistTrack = await storage.addTrackToPlaylist(playlistId, trackId);
      res.json(playlistTrack);
    } catch (error) {
      console.error("Error adding track to playlist:", error);
      res.status(500).json({ error: "Failed to add track to playlist" });
    }
  });

  // DELETE /api/playlists/:id/tracks/:trackId - Remove a track from a playlist
  app.delete("/api/playlists/:id/tracks/:trackId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const playlistId = parseInt(req.params.id);
      const trackId = parseInt(req.params.trackId);
      if (isNaN(playlistId) || isNaN(trackId)) return res.status(400).json({ error: "Invalid IDs" });

      const playlist = await storage.getPlaylist(playlistId);
      if (!playlist) return res.status(404).json({ error: "Playlist not found" });
      if (playlist.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      await storage.removeTrackFromPlaylist(playlistId, trackId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing track from playlist:", error);
      res.status(500).json({ error: "Failed to remove track from playlist" });
    }
  });

  // ============ NOTIFICATION ROUTES ============

  // GET /api/notifications - Get user's notifications
  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const userNotifications = await storage.getUserNotifications(userId);
      res.json(userNotifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // GET /api/notifications/unread-count - Get unread notification count
  app.get("/api/notifications/unread-count", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  // PUT /api/notifications/:id/read - Mark a notification as read
  app.put("/api/notifications/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const notificationId = parseInt(req.params.id);
      if (isNaN(notificationId)) return res.status(400).json({ error: "Invalid notification ID" });

      await storage.markNotificationRead(notificationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ error: "Failed to mark notification read" });
    }
  });

  // PUT /api/notifications/read-all - Mark all notifications as read
  app.put("/api/notifications/read-all", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      await storage.markAllNotificationsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications read:", error);
      res.status(500).json({ error: "Failed to mark all notifications read" });
    }
  });

  // ============ RECOMMENDATIONS ROUTES ============

  // GET /api/recommendations - Get personalized music recommendations
  app.get("/api/recommendations", async (req: any, res) => {
    try {
      const userId = req.isAuthenticated() ? req.user?.claims?.sub : null;
      const limit = parseInt(req.query.limit as string) || 20;
      
      if (userId) {
        const recommendations = await storage.getRecommendations(userId, limit);
        res.json(recommendations);
      } else {
        const sharedTracks = await storage.getSharedTracks();
        const ready = sharedTracks.filter(t => t.status === "ready").slice(0, limit);
        res.json(ready);
      }
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      res.status(500).json({ error: "Failed to fetch recommendations" });
    }
  });

  // ============ TRENDING / CHARTS ROUTES ============

  // GET /api/trending - Get trending tracks (similar to user's library but not in it)
  app.get("/api/trending", async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const userId = req.user?.claims?.sub;
      const trending = await storage.getTrendingTracks(limit, userId);
      res.json(trending.map(item => ({
        ...item.track,
        score: item.score,
        userCount: item.userCount
      })));
    } catch (error) {
      console.error("Error fetching trending tracks:", error);
      res.status(500).json({ error: "Failed to fetch trending tracks" });
    }
  });

  // GET /api/trending/charts - Get trending tracks grouped by channel/artist (excluding user's library)
  app.get("/api/trending/charts", async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const userId = req.user?.claims?.sub;
      const charts = await storage.getTrendingByChannel(limit, userId);
      res.json(charts);
    } catch (error) {
      console.error("Error fetching charts:", error);
      res.status(500).json({ error: "Failed to fetch charts" });
    }
  });

  // ============ ARTIST PAGES ROUTES ============

  // GET /api/artists - Get all artists with track counts
  app.get("/api/artists", async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const artists = await storage.getArtists(limit);
      res.json(artists);
    } catch (error) {
      console.error("Error fetching artists:", error);
      res.status(500).json({ error: "Failed to fetch artists" });
    }
  });

  // GET /api/artists/:name - Get all tracks by a specific artist
  app.get("/api/artists/:name", async (req: any, res) => {
    try {
      const artistName = decodeURIComponent(req.params.name);
      const tracks = await storage.getArtistTracks(artistName);
      
      if (tracks.length === 0) {
        return res.status(404).json({ error: "Artist not found" });
      }
      
      const thumbnail = tracks.find(t => t.thumbnail)?.thumbnail || null;
      
      res.json({
        name: artistName,
        trackCount: tracks.length,
        thumbnail,
        tracks
      });
    } catch (error) {
      console.error("Error fetching artist tracks:", error);
      res.status(500).json({ error: "Failed to fetch artist tracks" });
    }
  });

  // ============ YOUTUBE SEARCH (yt-dlp) ============

  // GET /api/youtube/search - Search YouTube using yt-dlp (no API key required)
  app.get("/api/youtube/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

      if (!query || query.trim().length === 0) {
        return res.status(400).json({ error: "Search query is required" });
      }

      console.log(`Searching YouTube for: "${query}" (limit: ${limit})`);

      const args = [
        "-m", "yt_dlp",
        `ytsearch${limit}:${query}`,
        "--flat-playlist",
        "--dump-json",
        "--no-warnings",
        "--ignore-errors"
      ];

      const ytdlp = spawn("python3", args);
      let jsonOutput = "";
      let stderrOutput = "";

      ytdlp.stdout.on("data", (data) => {
        jsonOutput += data.toString();
      });

      ytdlp.stderr.on("data", (data) => {
        stderrOutput += data.toString();
      });

      await new Promise<void>((resolve, reject) => {
        ytdlp.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`yt-dlp exited with code ${code}: ${stderrOutput}`));
          }
        });
        ytdlp.on("error", reject);
      });

      // Parse the JSON output (one JSON object per line)
      const results: any[] = [];
      const lines = jsonOutput.trim().split("\n").filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const item = JSON.parse(line);
          if (item.id && item.title) {
            results.push({
              id: item.id,
              title: item.title,
              channel: item.channel || item.uploader || "Unknown",
              thumbnail: item.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
              url: `https://www.youtube.com/watch?v=${item.id}`,
              duration: item.duration,
              viewCount: item.view_count
            });
          }
        } catch (e) {
          // Skip malformed lines
        }
      }

      console.log(`Found ${results.length} results for "${query}"`);
      res.json(results);
    } catch (error: any) {
      console.error("YouTube search error:", error);
      res.status(500).json({ error: "Search failed", details: error.message });
    }
  });

  // ============ YOUTUBE DATA API ROUTES ============

  const YOUTUBE_API_KEY = process.env.GOOGLE_API_KEY;

  // GET /api/youtube/for-you - Get personalized YouTube recommendations based on user's library
  app.get("/api/youtube/for-you", async (req: any, res) => {
    try {
      if (!YOUTUBE_API_KEY) {
        return res.status(500).json({ error: "YouTube API key not configured" });
      }

      const limit = parseInt(req.query.limit as string) || 12;
      const userId = req.isAuthenticated() ? req.user?.claims?.sub : null;

      let searchTerms: string[] = [];
      let existingVideoIds: Set<string> = new Set();

      if (userId) {
        const userTracks = await storage.getUserTracks(userId);
        existingVideoIds = new Set(userTracks.map(t => t.videoId));
        
        const channels = Array.from(new Set(userTracks.map(t => t.channel)))
          .filter(ch => ch && ch.trim().length > 0);
        if (channels.length > 0) {
          const topChannels = channels.slice(0, 3);
          searchTerms = topChannels.map(ch => `${ch} music`);
        }
      }

      if (searchTerms.length === 0) {
        searchTerms = ['popular music 2024', 'top hits music'];
      }

      const allVideos: any[] = [];
      const seenVideoIds = new Set<string>();

      for (const term of searchTerms.slice(0, 2)) {
        const url = new URL('https://www.googleapis.com/youtube/v3/search');
        url.searchParams.set('part', 'snippet');
        url.searchParams.set('type', 'video');
        url.searchParams.set('videoCategoryId', '10');
        url.searchParams.set('order', 'relevance');
        url.searchParams.set('maxResults', '10');
        url.searchParams.set('q', term);
        url.searchParams.set('key', YOUTUBE_API_KEY);

        const response = await fetch(url.toString());
        if (response.ok) {
          const data = await response.json();
          const videos = data.items?.map((item: any) => ({
            videoId: item.id?.videoId || item.id,
            title: item.snippet?.title || 'Unknown',
            channel: item.snippet?.channelTitle || 'Unknown',
            thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${item.id?.videoId}/hqdefault.jpg`,
            publishedAt: item.snippet?.publishedAt,
            status: 'youtube'
          })) || [];

          for (const video of videos) {
            if (!seenVideoIds.has(video.videoId) && !existingVideoIds.has(video.videoId)) {
              seenVideoIds.add(video.videoId);
              allVideos.push(video);
            }
          }
        }
      }

      const shuffled = allVideos.sort(() => Math.random() - 0.5);
      res.json(shuffled.slice(0, limit));
    } catch (error) {
      console.error("Error fetching personalized recommendations:", error);
      res.status(500).json({ error: "Failed to fetch recommendations" });
    }
  });

  return httpServer;
}
