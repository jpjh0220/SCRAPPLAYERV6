# SCRAPPLAYERV6 🎵

A full-stack **social music platform** that downloads YouTube videos as MP3s and provides a Spotify-like experience with social features.

![Tech Stack](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)

## ✨ Features

### Core Music Features
- 🎵 **YouTube to MP3 Conversion** - Download any YouTube video as high-quality MP3
- 📚 **Personal Music Library** - Organize your downloaded tracks
- 🎧 **HTML5 Audio Player** - Stream music with full playback controls
- 📥 **Smart Download Queue** - Track download progress in real-time
- 🎨 **Beautiful UI** - Modern, responsive design with dark/light themes
- 🔍 **YouTube Search** - Search and preview before downloading
- 🎼 **Artist Pages** - Browse tracks by artist/channel
- 📝 **Playlist Management** - Create and organize custom playlists

### Social Features
- 👤 **User Profiles** - Customizable profiles with avatars and bios
- 👥 **Follow System** - Follow your favorite users
- 📱 **Social Feed** - Share tracks, posts, and engage with the community
- ❤️ **Reactions** - Like/dislike posts and tracks
- 💬 **Comments** - Discuss music with other users
- 🔔 **Real-time Notifications** - Stay updated with WebSocket-powered alerts
- 🔥 **Trending Tracks** - Discover what's hot in the community
- 🎯 **Personalized Recommendations** - AI-powered music suggestions

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- React 19 + TypeScript
- Vite (build tool & dev server)
- TailwindCSS + shadcn/ui
- Zustand (state management)
- TanStack Query (data fetching)
- Wouter (routing)
- Framer Motion (animations)

**Backend:**
- Node.js + Express
- TypeScript (ESM modules)
- Drizzle ORM + PostgreSQL
- Passport.js (authentication)
- WebSocket (real-time features)
- yt-dlp (YouTube downloads)

**Infrastructure:**
- Replit (hosting platform)
- Google Cloud Storage (file persistence)
- PostgreSQL 16 (database)

### Project Structure

```
SCRAPPLAYERV6/
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # UI components (shadcn/ui + custom)
│   │   ├── pages/       # Route pages
│   │   ├── lib/         # Client utilities & state management
│   │   └── hooks/       # Custom React hooks
├── server/              # Express backend
│   ├── routes/          # Modular API routes
│   ├── middleware/      # Express middleware
│   ├── utils/           # Server utilities
│   ├── db/              # Database migrations
│   ├── __tests__/       # Unit tests
│   ├── index.ts         # Server entry point
│   ├── storage.ts       # Database layer
│   └── replitAuth.ts    # Authentication
├── shared/              # Shared TypeScript types
│   └── schema.ts        # Drizzle ORM schemas
└── script/
    └── build.ts         # Production build script
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Python 3.11+ (for yt-dlp)
- ffmpeg

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd SCRAPPLAYERV6
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   # Create .env file with:
   DATABASE_URL=postgresql://user:password@localhost:5432/scrapplayer
   GOOGLE_API_KEY=your_youtube_api_key  # Optional for For You page
   AUDIO_STORAGE_DIR=path/to/storage    # Optional for object storage
   ```

4. **Run database migrations:**
   ```bash
   npm run db:push  # Push Drizzle schema
   npm run db:migrate  # Run optimization indexes
   ```

5. **Start development server:**
   ```bash
   npm run dev
   ```

6. **Access the app:**
   - Frontend: http://localhost:5000
   - API: http://localhost:5000/api
   - WebSocket: ws://localhost:5000/ws

### Production Build

```bash
npm run build  # Build both client and server
npm start      # Start production server
```

## 📝 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run check` | TypeScript type checking |
| `npm run lint` | Lint code with ESLint |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm run format` | Format code with Prettier |
| `npm run test` | Run unit tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run validate` | Run all checks (types, lint, format, tests) |
| `npm run db:push` | Push database schema changes |
| `npm run db:migrate` | Run database migrations |

## 🔧 Configuration

### YouTube Cookies (Important for Production)

To prevent YouTube bot detection, add a `youtube_cookies.txt` file to the root directory:

1. Install a browser extension like "Get cookies.txt"
2. Visit YouTube and export cookies
3. Save as `youtube_cookies.txt` in project root

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://...

# Optional
GOOGLE_API_KEY=...           # YouTube Data API for "For You" recommendations
AUDIO_STORAGE_DIR=...        # Google Cloud Storage path
PRIVATE_OBJECT_DIR=...       # Private object storage path
ALLOWED_ORIGINS=...          # CORS allowed origins (comma-separated)
```

## 🎨 Code Quality

This project uses:
- **ESLint** - Linting with TypeScript, React, and import rules
- **Prettier** - Code formatting
- **Vitest** - Unit testing
- **TypeScript** - Strict type checking

Run all quality checks:
```bash
npm run validate
```

## 🗄️ Database Schema

11 main tables:
- `users` - User authentication
- `profiles` - User profile data
- `tracks` - Music library (per-user entries)
- `posts` - Social posts
- `comments` - Post comments
- `reactions` - Likes/dislikes
- `follows` - User relationships
- `shares` - Track sharing
- `playlists` - User playlists
- `playlist_tracks` - Playlist contents
- `notifications` - User notifications

All tables have strategic indexes for performance optimization.

## 🚦 API Endpoints

### Tracks
- `GET /api/tracks/mine` - Get user's tracks
- `GET /api/tracks/shared` - Get shared tracks
- `POST /api/download` - Download YouTube video
- `DELETE /api/tracks/:id` - Delete track
- `PUT /api/tracks/:id/share` - Toggle sharing

### Social
- `GET /api/feed` - Get personalized feed
- `POST /api/posts` - Create post
- `POST /api/posts/:id/reactions` - React to post
- `POST /api/posts/:id/comments` - Comment on post
- `POST /api/users/:id/follow` - Follow user

### Playlists
- `GET /api/playlists` - Get user playlists
- `POST /api/playlists` - Create playlist
- `POST /api/playlists/:id/tracks` - Add track to playlist

### System
- `GET /api/health` - Health check
- `GET /api/diagnostic` - System diagnostics

[Full API documentation available in `/server/routes/`]

## 🔐 Security Features

- **Rate Limiting** - Prevents API abuse
- **Input Validation** - Zod schema validation
- **Security Headers** - CSP, XSS protection, etc.
- **Authentication** - Replit OAuth integration
- **Error Handling** - Comprehensive error boundaries

## 📊 Performance Optimizations

- **Database Indexes** - 30+ strategic indexes
- **In-Memory Caching** - Fast data retrieval
- **WebSocket** - Real-time updates without polling
- **Lazy Loading** - Code splitting for faster loads
- **Audio Streaming** - HTTP range requests for seeking
- **Smart Downloads** - Reuse existing files

## 🧪 Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

Tests use Vitest with Node environment. Test files located in `server/__tests__/`.

## 📈 Monitoring

Access diagnostics:
```
GET /api/diagnostic
```

Returns:
- System info (Node version, platform, uptime)
- Dependencies (yt-dlp, ffmpeg)
- Object storage status
- Database statistics
- Memory usage

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

**Code Style:**
- Run `npm run validate` before committing
- Follow existing patterns
- Add tests for new features
- Update documentation

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - YouTube download engine
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Replit](https://replit.com/) - Hosting platform

## 🐛 Troubleshooting

**Downloads failing?**
- Add `youtube_cookies.txt` file (see Configuration section)
- Check yt-dlp is installed: `python3 -m yt_dlp --version`
- Check ffmpeg is installed: `ffmpeg -version`

**Database errors?**
- Ensure PostgreSQL is running
- Run migrations: `npm run db:migrate`
- Check DATABASE_URL is correct

**Build errors?**
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Clear dist folder: `rm -rf dist`

## 📞 Support

For issues and questions:
- Open an issue on GitHub
- Check `/api/diagnostic` for system status
- Review logs in console output

---

**Built with ❤️ using modern web technologies**
