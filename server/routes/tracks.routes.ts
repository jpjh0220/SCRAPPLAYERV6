import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { validate, schemas } from "../middleware/validate";
import { rateLimiters } from "../middleware/rateLimit";
import { audioStorage } from "../objectStorage";
import fs from "fs";
import { z } from "zod";

const router = Router();

// GET /api/tracks - List all tracks (legacy endpoint)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const tracks = await storage.getAllTracks();
    res.json(tracks);
  })
);

// GET /api/tracks/mine - Get current user's personal tracks
router.get(
  "/mine",
  isAuthenticated,
  asyncHandler(async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) throw new AppError(401, "User ID not found");

    const tracks = await storage.getUserTracks(userId);
    res.json(tracks);
  })
);

// GET /api/tracks/shared - Get all shared tracks
router.get(
  "/shared",
  asyncHandler(async (req, res) => {
    const tracks = await storage.getSharedTracks();
    res.json(tracks);
  })
);

// GET /api/tracks/:id - Get a single track by ID
router.get(
  "/:id",
  validate({ params: schemas.id }),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    const track = await storage.getTrackById(id);

    if (!track) {
      throw new AppError(404, "Track not found");
    }

    res.json(track);
  })
);

// DELETE /api/tracks/:id - Delete a track
router.delete(
  "/:id",
  isAuthenticated,
  validate({ params: schemas.id }),
  asyncHandler(async (req: any, res) => {
    const id = parseInt(req.params.id);
    const track = await storage.getTrackById(id);

    if (!track) {
      throw new AppError(404, "Track not found");
    }

    // Check ownership
    const userId = req.user?.claims?.sub;
    if (track.userId && track.userId !== userId) {
      throw new AppError(403, "You don't have permission to delete this track");
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
  })
);

// PUT /api/tracks/:id/share - Toggle sharing for a track
router.put(
  "/:id/share",
  isAuthenticated,
  validate({ params: schemas.id }),
  asyncHandler(async (req: any, res) => {
    const id = parseInt(req.params.id);
    const userId = req.user?.claims?.sub;
    const track = await storage.getTrackById(id);

    if (!track) {
      throw new AppError(404, "Track not found");
    }

    // Check ownership
    if (track.userId !== userId) {
      throw new AppError(403, "You can only share your own tracks");
    }

    // Calculate new status
    const newSharedStatus = track.isShared === 1 ? 0 : 1;

    // If trying to share, check if this song is already shared by someone else
    if (newSharedStatus === 1) {
      const alreadyShared = await storage.isVideoIdAlreadyShared(track.videoId);
      if (alreadyShared) {
        throw new AppError(409, "This song is already in the community library");
      }
    }

    await storage.updateTrackShared(id, newSharedStatus);

    res.json({
      message:
        newSharedStatus === 1 ? "Track shared with community" : "Track unshared",
      isShared: newSharedStatus,
    });
  })
);

// POST /api/tracks/:id/add-to-library - Add existing track to user's library
router.post(
  "/:id/add-to-library",
  isAuthenticated,
  validate({ params: schemas.id }),
  asyncHandler(async (req: any, res) => {
    const id = parseInt(req.params.id);
    const userId = req.user?.claims?.sub;

    if (!userId) {
      throw new AppError(401, "User ID not found");
    }

    // Get the source track
    const sourceTrack = await storage.getTrackById(id);
    if (!sourceTrack) {
      throw new AppError(404, "Track not found");
    }

    // Check if user already owns this track
    if (sourceTrack.userId === userId) {
      throw new AppError(400, "This track is already in your library");
    }

    // Check if user already has this track (by videoId)
    const existingTrack = await storage.getTrackByVideoIdForUser(
      sourceTrack.videoId,
      userId
    );
    if (existingTrack) {
      throw new AppError(409, "You already have this track in your library");
    }

    // Create a new track entry for the current user
    const newTrack = await storage.createTrack({
      videoId: sourceTrack.videoId,
      title: sourceTrack.title,
      channel: sourceTrack.channel,
      filePath: sourceTrack.filePath,
      thumbnail: sourceTrack.thumbnail,
      status: "ready",
      progress: 100,
      userId: userId,
      isShared: 0,
    });

    console.log(
      `User ${userId} added track ${sourceTrack.videoId} to their library`
    );

    res.json({
      message: "Track added to your library",
      track: newTrack,
    });
  })
);

// GET /api/audio/:videoId - Serve audio file
router.get(
  "/audio/:videoId",
  validate({ params: schemas.videoId }),
  asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    // Check if track exists in database
    const track = await storage.getReadyTrackByVideoId(videoId);

    if (!track) {
      const anyTrack = await storage.getTrackByVideoId(videoId);
      if (anyTrack && anyTrack.status !== "ready") {
        throw new AppError(425, "Track not ready yet");
      }
      throw new AppError(404, "Track not found");
    }

    // Try local file first
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
        const chunksize = end - start + 1;
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

    // Try Object Storage next
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

    throw new AppError(404, "Audio file not available");
  })
);

export default router;
