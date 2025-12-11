import bcrypt from "bcrypt";
import { Database } from "better-sqlite3";
import type { Request, Response, NextFunction } from "express";

// Security configuration
const SALT_ROUNDS = 12; // bcrypt salt rounds (higher = more secure but slower)
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 50;

export interface AuthUser {
  id: number;
  username: string;
  created_at: string;
  last_login: string;
}

export class LocalAuthService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Validate username format
   */
  private validateUsername(username: string): { valid: boolean; error?: string } {
    if (!username || typeof username !== "string") {
      return { valid: false, error: "Username is required" };
    }

    const trimmed = username.trim();

    if (trimmed.length < MIN_USERNAME_LENGTH) {
      return { valid: false, error: `Username must be at least ${MIN_USERNAME_LENGTH} characters` };
    }

    if (trimmed.length > MAX_USERNAME_LENGTH) {
      return { valid: false, error: `Username must not exceed ${MAX_USERNAME_LENGTH} characters` };
    }

    // Only allow alphanumeric and underscores
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return { valid: false, error: "Username can only contain letters, numbers, and underscores" };
    }

    return { valid: true };
  }

  /**
   * Validate password strength
   */
  private validatePassword(password: string): { valid: boolean; error?: string } {
    if (!password || typeof password !== "string") {
      return { valid: false, error: "Password is required" };
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return { valid: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      return { valid: false, error: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters` };
    }

    // Recommended: at least one uppercase, lowercase, number
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumber) {
      return {
        valid: false,
        error: "Password must contain at least one uppercase letter, one lowercase letter, and one number"
      };
    }

    return { valid: true };
  }

  /**
   * Register a new user
   */
  async register(username: string, password: string): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    try {
      // Validate username
      const usernameValidation = this.validateUsername(username);
      if (!usernameValidation.valid) {
        return { success: false, error: usernameValidation.error };
      }

      // Validate password
      const passwordValidation = this.validatePassword(password);
      if (!passwordValidation.valid) {
        return { success: false, error: passwordValidation.error };
      }

      const trimmedUsername = username.trim();

      // Check if username exists (case-insensitive)
      const existing = this.db.prepare(
        "SELECT id FROM auth_users WHERE LOWER(username) = LOWER(?)"
      ).get(trimmedUsername);

      if (existing) {
        return { success: false, error: "Username already exists" };
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // Insert user
      const now = new Date().toISOString();
      const result = this.db.prepare(`
        INSERT INTO auth_users (username, password_hash, created_at, last_login)
        VALUES (?, ?, ?, ?)
      `).run(trimmedUsername, passwordHash, now, now);

      const userId = result.lastInsertRowid as number;

      // Fetch created user
      const user = this.db.prepare(
        "SELECT id, username, created_at, last_login FROM auth_users WHERE id = ?"
      ).get(userId) as AuthUser;

      return { success: true, user };
    } catch (error: any) {
      console.error("[LocalAuth] Registration error:", error);
      return { success: false, error: "Registration failed" };
    }
  }

  /**
   * Authenticate user with username and password
   */
  async login(username: string, password: string): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    try {
      if (!username || !password) {
        return { success: false, error: "Username and password are required" };
      }

      // Fetch user by username (case-insensitive)
      const userRecord = this.db.prepare(`
        SELECT id, username, password_hash, created_at, last_login
        FROM auth_users
        WHERE LOWER(username) = LOWER(?)
      `).get(username.trim()) as any;

      if (!userRecord) {
        return { success: false, error: "Invalid username or password" };
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, userRecord.password_hash);

      if (!passwordMatch) {
        return { success: false, error: "Invalid username or password" };
      }

      // Update last_login
      const now = new Date().toISOString();
      this.db.prepare(
        "UPDATE auth_users SET last_login = ? WHERE id = ?"
      ).run(now, userRecord.id);

      const user: AuthUser = {
        id: userRecord.id,
        username: userRecord.username,
        created_at: userRecord.created_at,
        last_login: now,
      };

      return { success: true, user };
    } catch (error: any) {
      console.error("[LocalAuth] Login error:", error);
      return { success: false, error: "Login failed" };
    }
  }

  /**
   * Get user by ID
   */
  getUserById(userId: number): AuthUser | null {
    try {
      const user = this.db.prepare(
        "SELECT id, username, created_at, last_login FROM auth_users WHERE id = ?"
      ).get(userId) as AuthUser | undefined;

      return user || null;
    } catch (error) {
      console.error("[LocalAuth] Get user error:", error);
      return null;
    }
  }

  /**
   * Delete inactive accounts (last_login > 7 days ago)
   * This should be run as a daily scheduled job
   */
  cleanupInactiveAccounts(): number {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoffDate = sevenDaysAgo.toISOString();

      const result = this.db.prepare(
        "DELETE FROM auth_users WHERE last_login < ?"
      ).run(cutoffDate);

      const deletedCount = result.changes;

      if (deletedCount > 0) {
        console.log(`[LocalAuth] Cleanup: Deleted ${deletedCount} inactive accounts`);
      }

      return deletedCount;
    } catch (error) {
      console.error("[LocalAuth] Cleanup error:", error);
      return 0;
    }
  }

  /**
   * Get total user count
   */
  getUserCount(): number {
    try {
      const result = this.db.prepare(
        "SELECT COUNT(*) as count FROM auth_users"
      ).get() as { count: number };

      return result.count;
    } catch (error) {
      console.error("[LocalAuth] Get count error:", error);
      return 0;
    }
  }
}

/**
 * Express middleware: Require authentication
 * Use this to protect routes that require a logged-in user
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({
      error: "Authentication required",
      message: "You must be logged in to access this resource"
    });
  }
  next();
}

/**
 * Express middleware: Attach user to request
 * Populates req.user with the authenticated user if session exists
 */
export function attachUser(authService: LocalAuthService) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.session?.userId) {
      const user = authService.getUserById(req.session.userId);
      if (user) {
        (req as any).user = user;
      } else {
        // User doesn't exist anymore (deleted), clear session
        req.session.destroy(() => {});
      }
    }
    next();
  };
}

// Extend Express session interface
declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}
