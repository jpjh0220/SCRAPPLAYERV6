import { Request, Response, NextFunction } from "express";

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string;
  keyGenerator?: (req: Request) => string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const limitStore = new Map<string, RateLimitEntry>();

/**
 * Simple in-memory rate limiter middleware
 * For production, consider using Redis-backed rate limiter
 */
export function rateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    message = "Too many requests, please try again later",
    keyGenerator = (req) => {
      // Use user ID if authenticated, otherwise IP
      const user = (req as any).user;
      return user?.claims?.sub || req.ip || "unknown";
    },
  } = config;

  // Cleanup old entries every minute
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of limitStore.entries()) {
      if (now > entry.resetTime) {
        limitStore.delete(key);
      }
    }
  }, 60000);

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let entry = limitStore.get(key);

    if (!entry || now > entry.resetTime) {
      // New window
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      limitStore.set(key, entry);
      return next();
    }

    entry.count++;

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      res.set("X-RateLimit-Limit", String(maxRequests));
      res.set("X-RateLimit-Remaining", "0");
      res.set("X-RateLimit-Reset", String(entry.resetTime));

      return res.status(429).json({
        error: message,
        retryAfter,
      });
    }

    res.set("X-RateLimit-Limit", String(maxRequests));
    res.set("X-RateLimit-Remaining", String(maxRequests - entry.count));
    res.set("X-RateLimit-Reset", String(entry.resetTime));

    next();
  };
}

// Pre-configured rate limiters for common use cases
export const rateLimiters = {
  // Strict limit for downloads (expensive operation)
  download: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 50,
    message: "Download limit exceeded. Please wait before downloading more tracks.",
  }),

  // Medium limit for API endpoints
  api: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
  }),

  // Stricter limit for auth endpoints
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
    message: "Too many authentication attempts. Please try again later.",
  }),

  // Very strict for search (to prevent abuse)
  search: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
  }),

  // Strict for uploads
  upload: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50,
    message: "Upload limit exceeded. Please wait before uploading more files.",
  }),
};
