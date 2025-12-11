import { spawn } from "child_process";
import path from "path";
import fs from "fs";

/**
 * Extract video ID from YouTube URL
 */
export function extractVideoId(url: string): string | null {
  const regex = /(?:v=|\/|youtu\.be\/)([0-9A-Za-z_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

/**
 * Get streaming URL from YouTube using yt-dlp
 */
export async function getStreamUrl(videoId: string): Promise<string | null> {
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

/**
 * Extract artist from track metadata intelligently
 */
export function extractArtist(info: any): string {
  const rawTitle = info.title || "";
  let artist = "";

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
      .replace(/^\[.*?\]\s*/, "") // Remove [anything] prefix
      .replace(/\s*\(.*?\)\s*$/, "") // Remove (anything) suffix
      .trim();
  }
  // 3. Check for "Artist Name ft." or "Artist Name feat." patterns
  else if (/\s+(ft\.|feat\.|featuring)\s+/i.test(rawTitle)) {
    const match = rawTitle.match(/^([\w\s]+?)\s+(ft\.|feat\.|featuring)/i);
    if (match) {
      artist = match[1].trim();
    }
  }

  // 4. Fall back to channel/uploader, but filter out known non-artist channels
  if (!artist) {
    const channelName = info.channel || info.uploader || "YouTube";
    const nonArtistChannels = [
      "WORLDSTARHIPHOP",
      "Thizzler On The Roof",
      "On The Radar Radio",
      "Club Shay Shay",
      "Proxclusiv",
      "TIARRAMARIEFILMS",
      "LN1800",
      "ShotBy O.A",
      "Gangstaslotheditz",
      "ImYungVlone",
      "UpcomingPhilly",
      "Audio Exhibit",
      "archived.mp3",
      "Counterpoint 2.0",
      "cHefbox",
      "Elevator",
      "No Jumper",
      "Lyrical Lemonade",
      "Cole Bennett",
      "COLORS",
      "Genius",
      "Mass Appeal",
      "Complex",
      "XXL",
      "Pitchfork",
      "HotNewHipHop",
      "Rap City",
      "BET Hip Hop",
      "MTV",
      "VH1",
    ];

    // If it's a known non-artist channel, try harder to extract from title
    if (
      nonArtistChannels.some((c) =>
        channelName.toLowerCase().includes(c.toLowerCase())
      )
    ) {
      // Try to get first word(s) before common separators
      const titleMatch = rawTitle.match(
        /^([\w\s]+?)(?:\s*[-–—|:]\s*|\s+(?:ft\.|feat\.|x\s))/i
      );
      if (titleMatch) {
        artist = titleMatch[1].trim();
      } else {
        artist = channelName; // Last resort
      }
    } else {
      // Clean up " - Topic" suffix from YouTube auto-generated channels
      artist = channelName.replace(/\s*-\s*Topic$/i, "").trim();
    }
  }

  return artist || "Unknown Artist";
}

/**
 * Get default yt-dlp download arguments
 */
export function getDownloadArgs(outputPath: string, url: string): string[] {
  const cookiesPath = path.join(process.cwd(), "youtube_cookies.txt");
  const hasCookies = fs.existsSync(cookiesPath);

  const args = [
    "-m",
    "yt_dlp",
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    // Performance optimizations for faster downloads
    "--concurrent-fragments",
    "4",
    "--buffer-size",
    "16K",
    // Use multiple player clients for better success rate
    "--extractor-args",
    "youtube:player_client=android,web,default",
    // Add user agent to appear as a real browser
    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    // Force IPv4 to avoid IPv6 routing issues
    "--force-ipv4",
    // Geo bypass for region restrictions
    "--geo-bypass",
    // Add slight delay between requests to appear more human
    "--sleep-interval",
    "1",
    "--max-sleep-interval",
    "3",
    // Retry failed downloads
    "--retries",
    "5",
    "--fragment-retries",
    "5",
    // Output options
    "-o",
    outputPath,
    "--print-json",
    "--no-warnings",
  ];

  // Add cookies if available (critical for production)
  if (hasCookies) {
    args.splice(2, 0, "--cookies", cookiesPath);
    console.log(`Using cookies from ${cookiesPath}`);
  } else if (process.env.NODE_ENV === "production") {
    console.warn(
      "WARNING: No youtube_cookies.txt file found. Downloads may fail due to bot detection."
    );
  }

  args.push(url);
  return args;
}
