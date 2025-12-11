import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import fs from "fs";
import path from "path";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function parseObjectPath(pathStr: string): { bucketName: string; objectName: string } {
  if (!pathStr.startsWith("/")) {
    pathStr = `/${pathStr}`;
  }
  const pathParts = pathStr.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");
  return { bucketName, objectName };
}

export class AudioStorageService {
  private prefix: string;

  constructor() {
    this.prefix = "audio";
  }

  isConfigured(): boolean {
    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    return !!privateDir;
  }

  private getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR not set");
    }
    return dir;
  }

  private getObjectPath(videoId: string): string {
    const privateDir = this.getPrivateObjectDir();
    return `${privateDir}/${this.prefix}/${videoId}.mp3`;
  }

  async uploadAudioFile(localFilePath: string, videoId: string): Promise<string | null> {
    if (!this.isConfigured()) {
      console.log("Object storage not configured, skipping upload");
      return null;
    }

    try {
      const objectPath = this.getObjectPath(videoId);
      const { bucketName, objectName } = parseObjectPath(objectPath);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      await bucket.upload(localFilePath, {
        destination: objectName,
        metadata: {
          contentType: "audio/mpeg",
        },
      });
      
      console.log(`Uploaded audio to object storage: ${objectPath}`);
      return objectPath;
    } catch (error) {
      console.error("Failed to upload to object storage:", error);
      return null;
    }
  }

  async getAudioFile(videoId: string): Promise<Buffer | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const objectPath = this.getObjectPath(videoId);
      const { bucketName, objectName } = parseObjectPath(objectPath);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      const [exists] = await file.exists();
      if (!exists) {
        console.log(`[ObjectStorage] Object not found: ${objectPath}`);
        return null;
      }
      
      const [buffer] = await file.download();
      console.log(`[ObjectStorage] Successfully retrieved audio from object storage: ${objectPath}`);
      return buffer;
    } catch (error) {
      console.error("Failed to get audio from object storage:", error);
      return null;
    }
  }

  async exists(videoId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const objectPath = this.getObjectPath(videoId);
      const { bucketName, objectName } = parseObjectPath(objectPath);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      const [exists] = await file.exists();
      return exists;
    } catch (error) {
      console.error("Failed to check if audio exists in object storage:", error);
      return false;
    }
  }

  async streamAudioFile(audioBuffer: Buffer, res: Response, range?: string): Promise<void> {
    try {
      const fileSize = audioBuffer.length;
      
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Accept-Ranges", "bytes");
      
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Content-Length": chunksize,
        });
        
        res.end(audioBuffer.slice(start, end + 1));
      } else {
        res.writeHead(200, {
          "Content-Length": fileSize,
          "Cache-Control": "public, max-age=31536000",
        });
        
        res.end(audioBuffer);
      }
    } catch (error) {
      console.error("Error streaming audio:", error);
      throw error;
    }
  }

  async deleteAudioFile(videoId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const objectPath = this.getObjectPath(videoId);
      const { bucketName, objectName } = parseObjectPath(objectPath);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      await file.delete();
      console.log(`Deleted audio from object storage: ${objectPath}`);
      return true;
    } catch (error) {
      console.error("Failed to delete from object storage:", error);
      return false;
    }
  }
}

export const audioStorage = new AudioStorageService();

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function ensureUploadsDirExists() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export class MediaStorageService {
  private getPrivateObjectDir(): string {
    return process.env.PRIVATE_OBJECT_DIR || "";
  }

  isConfigured(): boolean {
    return !!this.getPrivateObjectDir();
  }
  
  async uploadMedia(buffer: Buffer, filename: string, contentType: string): Promise<string | null> {
    const uniqueFilename = `${Date.now()}_${filename}`;
    
    if (this.isConfigured()) {
      try {
        const privateDir = this.getPrivateObjectDir();
        const objectPath = `${privateDir}/media/${uniqueFilename}`;
        const { bucketName, objectName } = parseObjectPath(objectPath);
        
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(objectName);
        
        await file.save(buffer, {
          metadata: { contentType },
        });
        
        console.log(`Uploaded media to object storage: ${objectPath}`);
        return `/api/media/${objectName}`;
      } catch (error) {
        console.error("Object storage upload failed, trying local fallback:", error);
      }
    }
    
    try {
      ensureUploadsDirExists();
      const localPath = path.join(UPLOADS_DIR, uniqueFilename);
      fs.writeFileSync(localPath, buffer);
      console.log(`Uploaded media to local storage: ${localPath}`);
      return `/api/uploads/${uniqueFilename}`;
    } catch (error) {
      console.error("Failed to upload media to local storage:", error);
      return null;
    }
  }

  async getMedia(objectName: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const ext = objectName.split('.').pop()?.toLowerCase() || '';
    const contentTypeMap: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mov': 'video/quicktime',
    };
    const contentType = contentTypeMap[ext] || 'application/octet-stream';
    
    if (this.isConfigured()) {
      try {
        const privateDir = this.getPrivateObjectDir();
        const objectPath = `${privateDir}/${objectName}`;
        const { bucketName, objectName: objName } = parseObjectPath(objectPath);
        
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(objName);
        
        const [exists] = await file.exists();
        if (exists) {
          const [buffer] = await file.download();
          return { buffer, contentType };
        }
      } catch (error) {
        console.error("Failed to get media from object storage:", error);
      }
    }
    
    return null;
  }
  
  getLocalMedia(filename: string): { buffer: Buffer; contentType: string } | null {
    try {
      const localPath = path.join(UPLOADS_DIR, filename);
      if (!fs.existsSync(localPath)) {
        return null;
      }
      
      const buffer = fs.readFileSync(localPath);
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const contentTypeMap: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mov': 'video/quicktime',
      };
      const contentType = contentTypeMap[ext] || 'application/octet-stream';
      
      return { buffer, contentType };
    } catch (error) {
      console.error("Failed to get local media:", error);
      return null;
    }
  }
}

export const mediaStorage = new MediaStorageService();
