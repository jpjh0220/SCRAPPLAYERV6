import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "auth.db");
const SCHEMA_PATH = path.join(process.cwd(), "server/db/auth-schema.sql");

/**
 * Initialize SQLite database for authentication
 * Creates database file and applies schema
 */
export function initializeAuthDatabase(): Database.Database {
  // Ensure data directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log(`[AuthDB] Created data directory: ${DB_DIR}`);
  }

  // Create/open database
  const db = new Database(DB_PATH, {
    verbose: process.env.NODE_ENV === "development" ? console.log : undefined,
  });

  console.log(`[AuthDB] Database opened: ${DB_PATH}`);

  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  // Apply schema
  if (fs.existsSync(SCHEMA_PATH)) {
    const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
    db.exec(schema);
    console.log("[AuthDB] Schema applied successfully");
  } else {
    console.warn(`[AuthDB] Schema file not found: ${SCHEMA_PATH}`);
  }

  // WAL mode for better concurrency
  db.pragma("journal_mode = WAL");

  return db;
}

/**
 * Get database file path (for backup/migration)
 */
export function getAuthDatabasePath(): string {
  return DB_PATH;
}

/**
 * Close database connection
 */
export function closeAuthDatabase(db: Database.Database) {
  try {
    db.close();
    console.log("[AuthDB] Database closed");
  } catch (error) {
    console.error("[AuthDB] Error closing database:", error);
  }
}
