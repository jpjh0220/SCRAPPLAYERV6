# YT-DLP Command Center

## Overview

YT-DLP Command Center is a full-stack web application that provides a terminal-styled interface for downloading YouTube videos as MP3 files and managing a personal music library. The application combines YouTube search capabilities with yt-dlp download functionality, allowing users to discover, download, and play audio content directly in their browser.

The application features a distinctive terminal/command-line aesthetic with a dark theme, monospace fonts (JetBrains Mono), and green accent colors reminiscent of classic terminal interfaces.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System:**
- React with TypeScript for type-safe component development
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- TailwindCSS for styling with custom terminal-inspired theme

**State Management:**
- Zustand for global state management (music library, player state, search results)
- TanStack Query (React Query) for server state management and API data fetching

**UI Component Library:**
- Radix UI primitives for accessible, unstyled components
- shadcn/ui component system (New York style variant)
- Lucide React for icons

**Key Frontend Features:**
- Split-panel layout: left side for YouTube search/discovery, right side for download queue and library
- Real-time audio player with HTML5 audio elements
- Progress tracking for downloads
- Terminal-styled command input interface

### Backend Architecture

**Server Framework:**
- Express.js for HTTP server and API routing
- Node.js with TypeScript (ESM modules)
- HTTP server creation for both production and development

**Development vs Production:**
- Development: Vite middleware integrated with Express for HMR
- Production: Serves pre-built static assets from dist/public
- Custom build script using esbuild for server bundling and Vite for client bundling

**API Design:**
- RESTful endpoints under `/api` prefix
- `/api/tracks` - GET all tracks in library
- `/api/download` - POST to initiate YouTube downloads
- `/api/audio/:videoId` - Serve audio files

**External Process Integration:**
- Spawns Python child processes to execute yt-dlp commands
- File system management for downloaded MP3 files in `/music` directory
- Video ID extraction from YouTube URLs using regex patterns

### Data Storage

**Database:**
- PostgreSQL as the primary database
- Drizzle ORM for type-safe database queries and schema management
- Connection pooling via node-postgres (pg)

**Schema Design:**
- `users` table: id (UUID), username, password
- `tracks` table: id (serial), videoId (unique), title, channel, filePath, status, progress, addedAt
- Zod schemas derived from Drizzle for runtime validation

**Storage Pattern:**
- Interface-based storage abstraction (IStorage)
- DatabaseStorage implementation for PostgreSQL operations
- Track status tracking: downloading, processing, ready, error

### External Dependencies

**Third-Party APIs:**
- YouTube Data API v3 for video search functionality
- API key hardcoded in client (for prototype purposes)

**External Tools:**
- yt-dlp (Python package) for YouTube video downloading
- FFmpeg for audio conversion and processing
- Runs as subprocess from Node.js backend

**Session Management:**
- Express-session with connect-pg-simple for PostgreSQL session storage
- Session configuration for user authentication state

**Development Tools:**
- Replit-specific Vite plugins (cartographer, dev-banner, runtime-error-modal)
- Custom meta images plugin for OpenGraph image URL updates
- TypeScript with strict mode enabled

**Font Resources:**
- Google Fonts: JetBrains Mono (monospace, terminal aesthetic)
- Google Fonts: Inter (sans-serif, readability)

**Build Optimization:**
- Server dependency bundling allowlist to reduce cold start times
- Selective bundling of frequently-used packages (drizzle-orm, express, pg, etc.)
- External dependencies list to minimize bundle size

### Production Deployment Configuration

**Server Bindings:**
- Server binds to `0.0.0.0:${PORT}` (default 5000) - NOT localhost
- All client API calls use relative paths (`/api/...`) - no hardcoded hosts
- Port 5000 maps to external port 80 in production

**Environment Detection:**
- Development: `NODE_ENV` undefined, uses Vite middleware for HMR
- Production: `NODE_ENV=production`, serves static files from `dist/public`

**Python Dependencies:**
- yt-dlp installed via `pyproject.toml` (yt-dlp>=2025.11.12)
- Build script verifies yt-dlp availability, falls back to pip install if needed
- ffmpeg available via Nix packages in `.replit` configuration

**Deployment Commands:**
- Build: `npm run build` (bundles client with Vite, server with esbuild)
- Start: `npm run start` (runs `NODE_ENV=production node dist/index.cjs`)

**Diagnostic Endpoint:**
- `/api/diagnostic` - Returns JSON with yt-dlp/ffmpeg availability and versions
- Use this endpoint to verify production environment is correctly configured