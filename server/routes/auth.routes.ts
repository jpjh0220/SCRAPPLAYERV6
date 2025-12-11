import { Router } from "express";
import { LocalAuthService, requireAuth } from "../auth/localAuth";
import { asyncHandler } from "../middleware/errorHandler";
import { rateLimit } from "../middleware/rateLimit";
import { z } from "zod";

export function createAuthRoutes(authService: LocalAuthService): Router {
  const router = Router();

  // Rate limiters for auth endpoints
  const authRateLimit = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxRequests: 5, // 5 attempts per 10 minutes
    message: "Too many authentication attempts. Please try again later.",
    keyGenerator: (req) => {
      // Rate limit by IP + username combination
      const username = req.body?.username || "unknown";
      return `${req.ip}-${username}`;
    },
  });

  // Validation schemas
  const registerSchema = z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(8).max(128),
  });

  const loginSchema = z.object({
    username: z.string(),
    password: z.string(),
  });

  /**
   * POST /api/auth/register
   * Register a new user account
   *
   * IMPORTANT:
   * - No email, no phone, no recovery mechanism
   * - Lost passwords result in permanent account loss
   * - Accounts inactive for 7+ days are automatically deleted
   */
  router.post(
    "/register",
    authRateLimit,
    asyncHandler(async (req, res) => {
      // Validate input
      const validation = registerSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validation.error.errors.map((e) => e.message),
        });
      }

      const { username, password } = validation.data;

      // Register user
      const result = await authService.register(username, password);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Create session
      req.session.userId = result.user!.id;

      // Save session explicitly
      req.session.save((err) => {
        if (err) {
          console.error("[Auth] Session save error:", err);
          return res.status(500).json({ error: "Failed to create session" });
        }

        res.status(201).json({
          message: "Registration successful",
          user: {
            id: result.user!.id,
            username: result.user!.username,
            created_at: result.user!.created_at,
          },
          warning: "⚠️ No password recovery available. Keep your password safe - there is no way to recover a lost password.",
        });
      });
    })
  );

  /**
   * POST /api/auth/login
   * Authenticate with username and password
   */
  router.post(
    "/login",
    authRateLimit,
    asyncHandler(async (req, res) => {
      // Validate input
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Username and password are required",
        });
      }

      const { username, password } = validation.data;

      // Authenticate
      const result = await authService.login(username, password);

      if (!result.success) {
        return res.status(401).json({ error: result.error });
      }

      // Create session
      req.session.userId = result.user!.id;

      // Save session explicitly
      req.session.save((err) => {
        if (err) {
          console.error("[Auth] Session save error:", err);
          return res.status(500).json({ error: "Failed to create session" });
        }

        res.json({
          message: "Login successful",
          user: {
            id: result.user!.id,
            username: result.user!.username,
            created_at: result.user!.created_at,
            last_login: result.user!.last_login,
          },
        });
      });
    })
  );

  /**
   * POST /api/auth/logout
   * Destroy current session
   */
  router.post(
    "/logout",
    asyncHandler(async (req, res) => {
      if (!req.session) {
        return res.json({ message: "Already logged out" });
      }

      req.session.destroy((err) => {
        if (err) {
          console.error("[Auth] Logout error:", err);
          return res.status(500).json({ error: "Logout failed" });
        }

        res.clearCookie("connect.sid"); // Clear session cookie
        res.json({ message: "Logout successful" });
      });
    })
  );

  /**
   * GET /api/auth/me
   * Get current authenticated user
   */
  router.get(
    "/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = req.session.userId!;
      const user = authService.getUserById(userId);

      if (!user) {
        // User was deleted
        req.session.destroy(() => {});
        return res.status(404).json({
          error: "User not found",
          message: "Your account may have been deleted due to inactivity"
        });
      }

      res.json({
        id: user.id,
        username: user.username,
        created_at: user.created_at,
        last_login: user.last_login,
      });
    })
  );

  /**
   * GET /api/auth/stats
   * Get authentication statistics (public)
   */
  router.get(
    "/stats",
    asyncHandler(async (req, res) => {
      const totalUsers = authService.getUserCount();

      res.json({
        total_users: totalUsers,
        auth_type: "local",
        password_recovery: false,
        account_retention_days: 7,
      });
    })
  );

  return router;
}
