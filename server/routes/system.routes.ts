import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { asyncHandler } from "../middleware/errorHandler";
import { audioStorage, mediaStorage } from "../objectStorage";
import { storage } from "../storage";
import { getWebSocketManager } from "../utils/websocket";

const router = Router();

// GET /api/health - Health check endpoint
router.get("/health", (req, res) => {
  const wsManager = getWebSocketManager();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    websocket: {
      connected: wsManager?.getClientCount() || 0,
    },
  });
});

// GET /api/diagnostic - Comprehensive diagnostic endpoint
router.get(
  "/diagnostic",
  asyncHandler(async (req, res) => {
    const cookiesPath = path.join(process.cwd(), "youtube_cookies.txt");
    const results: Record<string, any> = {
      timestamp: new Date().toISOString(),
      node_env: process.env.NODE_ENV || "development",
      node_version: process.version,
      platform: process.platform,
      cwd: process.cwd(),
      music_dir: path.join(process.cwd(), "music"),
      music_dir_exists: fs.existsSync(path.join(process.cwd(), "music")),
      cookies_file_exists: fs.existsSync(cookiesPath),
      cookies_file_path: cookiesPath,
      object_storage_configured: audioStorage.isConfigured(),
      audio_storage_dir: process.env.AUDIO_STORAGE_DIR || "(not set)",
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    };

    // Check yt-dlp
    try {
      const ytdlp = spawn("python3", ["-m", "yt_dlp", "--version"]);
      let version = "";
      ytdlp.stdout.on("data", (data) => {
        version += data.toString();
      });
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
      ffmpeg.stdout.on("data", (data) => {
        ffver += data.toString().split("\n")[0];
      });
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
      results.warning =
        "Production without cookies - downloads may fail due to YouTube bot detection. Add youtube_cookies.txt file.";
    }

    // Test object storage
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
          const pathParts = privateDir.split("/").filter((p) => p);
          const bucketName = pathParts[0];
          const testObjectName = `${pathParts.slice(1).join("/")}/_test_${Date.now()}.txt`;
          const testData = "test-" + Date.now();

          const bucket = testClient.bucket(bucketName);
          const file = bucket.file(testObjectName);

          await file.save(testData, { contentType: "text/plain" });
          results.object_storage_write = "success";

          const [content] = await file.download();
          results.object_storage_read =
            content.toString() === testData ? "success" : "content mismatch";

          await file.delete();
        }
      } catch (err: any) {
        results.object_storage_test_error = err.message || String(err);
      }
    }

    // Database stats
    try {
      const tracks = await storage.getAllTracks();
      results.database = {
        total_tracks: tracks.length,
        ready_tracks: tracks.filter((t) => t.status === "ready").length,
        downloading_tracks: tracks.filter((t) => t.status === "downloading")
          .length,
        error_tracks: tracks.filter((t) => t.status === "error").length,
      };
    } catch (err: any) {
      results.database_error = err.message;
    }

    res.json(results);
  })
);

// POST /api/migrate-to-storage - Migrate local files to Object Storage
router.post(
  "/migrate-to-storage",
  asyncHandler(async (req, res) => {
    if (!audioStorage.isConfigured()) {
      return res.status(400).json({
        error:
          "Object Storage not configured. Set AUDIO_STORAGE_DIR environment variable.",
      });
    }

    const tracks = await storage.getAllTracks();
    const readyTracks = tracks.filter((t) => t.status === "ready");

    let migrated = 0;
    let skipped = 0;
    let failed = 0;
    const results: any[] = [];

    for (const track of readyTracks) {
      const existsInStorage = await audioStorage.exists(track.videoId);
      if (existsInStorage) {
        skipped++;
        results.push({
          videoId: track.videoId,
          title: track.title,
          status: "skipped",
          reason: "already in storage",
        });
        continue;
      }

      if (!fs.existsSync(track.filePath)) {
        failed++;
        results.push({
          videoId: track.videoId,
          title: track.title,
          status: "failed",
          reason: "local file not found",
        });
        continue;
      }

      const objectPath = await audioStorage.uploadAudioFile(
        track.filePath,
        track.videoId
      );
      if (objectPath) {
        migrated++;
        results.push({
          videoId: track.videoId,
          title: track.title,
          status: "migrated",
          path: objectPath,
        });
      } else {
        failed++;
        results.push({
          videoId: track.videoId,
          title: track.title,
          status: "failed",
          reason: "upload failed",
        });
      }
    }

    res.json({
      total: readyTracks.length,
      migrated,
      skipped,
      failed,
      results,
    });
  })
);

export default router;
