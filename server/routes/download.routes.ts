import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { rateLimiters } from "../middleware/rateLimit";
import { audioStorage } from "../objectStorage";
import { extractVideoId, getDownloadArgs, extractArtist } from "../utils/youtube";
import { getWebSocketManager } from "../utils/websocket";
import { z } from "zod";

const router = Router();

const MUSIC_DIR = path.join(process.cwd(), "music");

// Ensure music directory exists
if (!fs.existsSync(MUSIC_DIR)) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

const downloadSchema = z.object({
  url: z.string().url(),
});

// POST /api/download - Download a video
router.post(
  "/",
  isAuthenticated,
  rateLimiters.download,
  asyncHandler(async (req: any, res) => {
    const validation = downloadSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError(400, "Invalid request: URL is required");
    }

    const { url } = validation.data;
    const videoId = extractVideoId(url);

    if (!videoId) {
      throw new AppError(400, "Invalid YouTube URL");
    }

    const userId = req.user?.claims?.sub;
    if (!userId) {
      throw new AppError(401, "User ID not found");
    }

    // Check if user already has this track
    const existing = await storage.getTrackByVideoIdForUser(videoId, userId);
    if (existing) {
      return res.status(409).json({
        error: "You already have this track",
        track: existing,
      });
    }

    // Check if ANY user already has this track ready - reuse instead of re-downloading
    const existingReady = await storage.getReadyTrackByVideoId(videoId);
    if (existingReady) {
      console.log(
        `Reusing existing track ${videoId} for user ${userId} (original user: ${existingReady.userId})`
      );

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
        reused: true,
      });
    }

    // Create initial track entry
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

    // Start download in background
    console.log(`Starting download for ${videoId} to ${outputPath}`);

    const args = getDownloadArgs(outputPath, url);
    const ytdlp = spawn("python3", args);

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
    const wsManager = getWebSocketManager();

    ytdlp.on("error", async (err) => {
      console.error(`yt-dlp spawn error for ${videoId}:`, err);
      await storage.updateTrackStatusById(trackId, "error", 0);
      wsManager?.notifyDownloadProgress(userId, trackId, 0, "error");
    });

    ytdlp.on("close", async (code) => {
      console.log(`yt-dlp closed for ${videoId} with code ${code}`);
      if (code === 0) {
        try {
          const info = JSON.parse(jsonOutput);
          const rawTitle = info.title || `Track ${videoId}`;
          const thumbnailUrl =
            info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

          const artist = extractArtist(info);

          await storage.updateTrackMetadataById(
            trackId,
            rawTitle,
            artist,
            thumbnailUrl
          );

          // Upload to Object Storage for production persistence
          if (audioStorage.isConfigured() && fs.existsSync(outputPath)) {
            const objectPath = await audioStorage.uploadAudioFile(
              outputPath,
              videoId
            );
            if (objectPath) {
              console.log(
                `Uploaded ${videoId} to object storage: ${objectPath}`
              );
            }
          }

          await storage.updateTrackStatusById(trackId, "ready", 100);
          wsManager?.notifyDownloadProgress(userId, trackId, 100, "ready");
          console.log(`Download complete: ${rawTitle} by ${artist}`);
        } catch (parseError) {
          console.error("Failed to parse yt-dlp output:", parseError);
          await storage.updateTrackMetadataById(
            trackId,
            `Track ${videoId}`,
            "YouTube",
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          );

          if (audioStorage.isConfigured() && fs.existsSync(outputPath)) {
            await audioStorage.uploadAudioFile(outputPath, videoId);
          }

          await storage.updateTrackStatusById(trackId, "ready", 100);
          wsManager?.notifyDownloadProgress(userId, trackId, 100, "ready");
        }
      } else {
        console.error(
          `Download failed for ${videoId} with code ${code}. Stderr: ${stderrOutput}`
        );
        await storage.updateTrackStatusById(trackId, "error", 0);
        wsManager?.notifyDownloadProgress(userId, trackId, 0, "error");
      }
    });

    res.json({
      message: "Download started",
      track,
    });
  })
);

// Track active re-downloads to prevent duplicates
const activeRedownloads = new Set<string>();

// POST /api/redownload-tracks - Re-download tracks for Object Storage
router.post(
  "/redownload-tracks",
  asyncHandler(async (req, res) => {
    if (!audioStorage.isConfigured()) {
      throw new AppError(
        400,
        "Object Storage not configured. Set AUDIO_STORAGE_DIR environment variable."
      );
    }

    const { limit = 10 } = req.body;

    const tracks = await storage.getAllTracks();
    const readyTracks = tracks.filter((t) => t.status === "ready");

    const tracksToRedownload: typeof readyTracks = [];

    for (const track of readyTracks) {
      if (activeRedownloads.has(track.videoId)) {
        continue;
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
        pending: 0,
      });
    }

    // Start re-downloads in background
    const redownloadResults: any[] = [];

    for (const track of tracksToRedownload) {
      activeRedownloads.add(track.videoId);

      const outputPath = path.join(MUSIC_DIR, `${track.videoId}.mp3`);
      const args = getDownloadArgs(
        outputPath,
        `https://www.youtube.com/watch?v=${track.videoId}`
      );

      console.log(`Re-downloading ${track.videoId}: ${track.title}`);

      const ytdlp = spawn("python3", args);

      ytdlp.on("close", async (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          const objectPath = await audioStorage.uploadAudioFile(
            outputPath,
            track.videoId
          );
          if (objectPath) {
            console.log(`Re-downloaded and uploaded: ${track.title}`);
          } else {
            console.error(`Failed to upload after re-download: ${track.title}`);
          }
        } else {
          console.error(
            `Re-download failed for ${track.videoId}: ${track.title}`
          );
        }
        activeRedownloads.delete(track.videoId);
      });

      ytdlp.on("error", (err) => {
        console.error(`Re-download error for ${track.videoId}:`, err);
        activeRedownloads.delete(track.videoId);
      });

      redownloadResults.push({
        videoId: track.videoId,
        title: track.title,
        status: "started",
      });
    }

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
      inProgress: activeRedownloads.size,
    });
  })
);

// GET /api/redownload-status - Check status of re-downloads
router.get(
  "/redownload-status",
  asyncHandler(async (req, res) => {
    const tracks = await storage.getAllTracks();
    const readyTracks = tracks.filter((t) => t.status === "ready");

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
      activeVideoIds: Array.from(activeRedownloads),
    });
  })
);

export default router;
