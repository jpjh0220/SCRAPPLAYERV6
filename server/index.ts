import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initializeWebSocket } from "./utils/websocket";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { securityHeaders, requestLogger } from "./middleware/security";
import { initializeAuthDatabase } from "./auth/database";
import { LocalAuthService, attachUser } from "./auth/localAuth";
import { AccountCleanupJob } from "./auth/cleanupJob";
import ConnectSqlite3 from "connect-sqlite3";
import crypto from "crypto";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Security headers middleware (apply early)
app.use(securityHeaders);

// Request logging middleware
app.use(requestLogger);

// Body parsing middleware
app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "10mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    log("Starting server initialization...", "startup");

    // Initialize authentication database
    log("Initializing authentication database...", "startup");
    const authDb = initializeAuthDatabase();
    const authService = new LocalAuthService(authDb);
    log("Authentication database ready", "startup");

    // Initialize session store
    const SqliteStore = ConnectSqlite3(session);
    const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

    if (!process.env.SESSION_SECRET) {
      log("⚠️  WARNING: SESSION_SECRET not set! Using random secret (sessions will not persist across restarts)", "startup");
      log("⚠️  Set SESSION_SECRET in .env for production!", "startup");
    }

    const sessionConfig: session.SessionOptions = {
      store: new SqliteStore({
        db: "auth.db",
        dir: "./data",
        table: "sessions",
      }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true, // Refresh session on each request
      name: "connect.sid",
      cookie: {
        maxAge: 86400000, // 24 hours
        httpOnly: true,
        secure: false, // Must be false for HTTP in development
        sameSite: "lax",
        path: "/",
      },
    };

    app.use(session(sessionConfig));
    log("Session middleware configured", "startup");

    // Attach user to request
    app.use(attachUser(authService));

    // Initialize WebSocket for real-time features
    const wsManager = initializeWebSocket(httpServer);
    log(`WebSocket server initialized at ws://localhost:${process.env.PORT || 5000}/ws`, "startup");

    // Start account cleanup job
    const cleanupJob = new AccountCleanupJob(authService);
    const cleanupHour = parseInt(process.env.CLEANUP_HOUR || "3");
    cleanupJob.start(cleanupHour);
    log(`Account cleanup job scheduled (runs daily at ${cleanupHour}:00)`, "startup");

    await registerRoutes(httpServer, app, authService);
    log("Routes registered", "startup");

    // 404 handler for unmatched routes
    app.use(notFoundHandler);

    // Global error handler (must be last)
    app.use(errorHandler);

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (process.env.NODE_ENV === "production") {
      log("Setting up static file serving...", "startup");
      serveStatic(app);
      log("Static files configured", "startup");
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || "5000", 10);
    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
        reusePort: true,
      },
      () => {
        log(`Server ready and listening on 0.0.0.0:${port}`);
      },
    );
  } catch (error) {
    log(`Fatal startup error: ${error}`, "error");
    console.error(error);
    process.exit(1);
  }
})();
