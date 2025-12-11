# Local Authentication System - Setup Guide

## Overview

This application uses **local username/password authentication** with SQLite storage.

⚠️ **IMPORTANT SECURITY NOTES:**
- **NO PASSWORD RECOVERY** - Lost passwords result in permanent account loss
- **AUTO-DELETION** - Accounts inactive for 7+ days are automatically deleted
- **HTTPS REQUIRED** - Must run behind HTTPS in production

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

New authentication dependencies:
- `bcrypt` - Password hashing (12 salt rounds)
- `better-sqlite3` - SQLite database
- `connect-sqlite3` - SQLite session store

### 2. Configure Environment

```bash
cp .env.example .env
```

**Required:** Set a strong session secret:

```bash
# Generate random secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env
SESSION_SECRET=<paste-generated-secret-here>
```

### 3. Run the Application

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

The auth database will be created automatically at `./data/auth.db`

## Authentication Endpoints

### POST /api/auth/register

Register a new account.

**Request:**
```json
{
  "username": "myusername",
  "password": "MySecurePass123"
}
```

**Password Requirements:**
- Minimum 8 characters
- Maximum 128 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

**Username Requirements:**
- Minimum 3 characters
- Maximum 50 characters
- Only letters, numbers, and underscores
- Case-insensitive (usernames are unique regardless of case)

**Response (201):**
```json
{
  "message": "Registration successful",
  "user": {
    "id": 1,
    "username": "myusername",
    "created_at": "2025-12-11T01:00:00.000Z"
  },
  "warning": "⚠️ No password recovery available. Keep your password safe..."
}
```

**Rate Limit:** 5 attempts per 10 minutes per IP+username

### POST /api/auth/login

Authenticate with credentials.

**Request:**
```json
{
  "username": "myusername",
  "password": "MySecurePass123"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "username": "myusername",
    "created_at": "2025-12-11T01:00:00.000Z",
    "last_login": "2025-12-11T01:30:00.000Z"
  }
}
```

**Rate Limit:** 5 attempts per 10 minutes per IP+username

### POST /api/auth/logout

Destroy current session.

**Response (200):**
```json
{
  "message": "Logout successful"
}
```

### GET /api/auth/me

Get current authenticated user (requires authentication).

**Response (200):**
```json
{
  "id": 1,
  "username": "myusername",
  "created_at": "2025-12-11T01:00:00.000Z",
  "last_login": "2025-12-11T01:30:00.000Z"
}
```

**Response (401):** Not authenticated

### GET /api/auth/stats

Get authentication statistics (public).

**Response (200):**
```json
{
  "total_users": 42,
  "auth_type": "local",
  "password_recovery": false,
  "account_retention_days": 7
}
```

## Protecting Routes

Use the `requireAuth` middleware to protect routes:

```typescript
import { requireAuth } from "./auth/localAuth";

app.get("/api/protected", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const user = (req as any).user; // Attached by attachUser middleware

  res.json({ message: "You are authenticated!", user });
});
```

## Account Lifecycle

### Automatic Cleanup

Accounts are **automatically deleted** if not logged in for 7+ days.

The cleanup job runs daily at 3 AM by default (configurable via `CLEANUP_HOUR` env var).

**Manual cleanup:**
```typescript
import { LocalAuthService } from "./auth/localAuth";

const deletedCount = authService.cleanupInactiveAccounts();
console.log(`Deleted ${deletedCount} inactive accounts`);
```

### Checking Activity

```bash
# Connect to database
sqlite3 data/auth.db

# Check user activity
SELECT username, last_login,
       julianday('now') - julianday(last_login) as days_inactive
FROM auth_users
ORDER BY last_login DESC;

# Find accounts that will be deleted
SELECT username, last_login
FROM auth_users
WHERE last_login < datetime('now', '-7 days');
```

## HTTPS Configuration

### Local Development (Self-Signed Certificate)

```bash
# Generate self-signed certificate
openssl req -nodes -new -x509 -keyout server.key -out server.cert -days 365

# Add to .env
HTTPS_ENABLED=true
HTTPS_KEY_PATH=./server.key
HTTPS_CERT_PATH=./server.cert
```

### Production (Recommended Options)

#### Option 1: Reverse Proxy (Recommended)

Use nginx or Caddy:

**Nginx example:**
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

**Caddy example (automatic HTTPS):**
```
yourdomain.com {
    reverse_proxy localhost:5000
}
```

#### Option 2: Platform-Managed TLS

Use platforms with automatic HTTPS:
- Heroku (automatic)
- Railway (automatic)
- Render (automatic)
- Vercel/Netlify (automatic)
- Cloudflare Pages (automatic)

## Security Hardening

### Password Policy

Current policy (configured in `localAuth.ts`):
- Minimum 8 characters
- Maximum 128 characters
- Requires: uppercase, lowercase, number
- bcrypt salt rounds: 12

**Increase security:**
```typescript
// In localAuth.ts
const SALT_ROUNDS = 14; // Slower but more secure
const MIN_PASSWORD_LENGTH = 12; // Longer minimum
```

### Rate Limiting

Current limits (configured in `auth.routes.ts`):
- 5 attempts per 10 minutes per IP+username

**Adjust limits:**
```typescript
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 3, // Only 3 attempts
  ...
});
```

### Account Lockout (Optional)

Add to `localAuth.ts`:

```typescript
// Track failed attempts
private failedAttempts = new Map<string, number>();

async login(username: string, password: string) {
  const attempts = this.failedAttempts.get(username) || 0;

  // Lock out after 5 failed attempts
  if (attempts >= 5) {
    return { success: false, error: "Account locked due to too many failed attempts" };
  }

  // ... existing login logic ...

  if (!passwordMatch) {
    this.failedAttempts.set(username, attempts + 1);
    return { success: false, error: "Invalid credentials" };
  }

  // Clear failed attempts on successful login
  this.failedAttempts.delete(username);

  // ... rest of login ...
}
```

### IP-Based Throttling (Optional)

Enhance rate limiting by IP:

```typescript
// In auth.routes.ts
const strictRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 20, // Max 20 attempts per hour per IP
  keyGenerator: (req) => req.ip || "unknown",
});

router.post("/register", strictRateLimit, authRateLimit, ...);
router.post("/login", strictRateLimit, authRateLimit, ...);
```

### Audit Logging

Add security event logging:

```typescript
// Create audit log table
CREATE TABLE auth_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    username TEXT,
    ip_address TEXT,
    user_agent TEXT,
    success INTEGER NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

// Log events
function logAuthEvent(type, username, ip, success) {
  db.prepare(`
    INSERT INTO auth_audit_log (event_type, username, ip_address, success)
    VALUES (?, ?, ?, ?)
  `).run(type, username, ip, success ? 1 : 0);
}
```

## Testing

### Manual Testing

```bash
# 1. Register a user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"TestPass123"}' \
  -c cookies.txt

# 2. Login (should fail - already logged in from registration)
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"TestPass123"}' \
  -b cookies.txt

# 3. Get current user
curl http://localhost:5000/api/auth/me -b cookies.txt

# 4. Logout
curl -X POST http://localhost:5000/api/auth/logout -b cookies.txt

# 5. Try to access protected endpoint (should fail)
curl http://localhost:5000/api/auth/me -b cookies.txt

# 6. Login again
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"TestPass123"}' \
  -c cookies.txt

# 7. Get stats
curl http://localhost:5000/api/auth/stats
```

### Test Cleanup Job

```bash
# Connect to database
sqlite3 data/auth.db

# Create old account (backdated)
INSERT INTO auth_users (username, password_hash, created_at, last_login)
VALUES ('olduser', '$2b$12$dummy', datetime('now', '-10 days'), datetime('now', '-10 days'));

# Trigger cleanup
curl -X POST http://localhost:5000/api/admin/cleanup

# Verify deletion
SELECT * FROM auth_users WHERE username = 'olduser';
# Should return no results
```

## Troubleshooting

### "Session secret not set" warning

**Solution:** Set `SESSION_SECRET` in `.env`

```bash
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### Sessions not persisting

**Check:**
1. `data/auth.db` file exists
2. `SESSION_SECRET` is set and consistent
3. Cookies are being sent (check browser dev tools)
4. Cookie `secure` flag matches HTTPS status

### Database locked errors

**Solution:** SQLite uses WAL mode for better concurrency, but check:

```bash
# Check database mode
sqlite3 data/auth.db "PRAGMA journal_mode;"
# Should return: wal

# If not, enable it
sqlite3 data/auth.db "PRAGMA journal_mode=WAL;"
```

### Rate limiting too strict

**Adjust in code:**

```typescript
// server/routes/auth.routes.ts
const authRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  maxRequests: 10, // Increase from 5 to 10
  ...
});
```

## Database Management

### Backup

```bash
# Backup auth database
sqlite3 data/auth.db ".backup data/auth-backup-$(date +%Y%m%d).db"

# Or simply copy file
cp data/auth.db data/auth-backup.db
```

### Restore

```bash
# Stop server first!
cp data/auth-backup.db data/auth.db
```

### View Users

```bash
sqlite3 data/auth.db "SELECT id, username, created_at, last_login FROM auth_users;"
```

### Delete All Users

```bash
sqlite3 data/auth.db "DELETE FROM auth_users;"
```

### Clean Sessions

```bash
# Delete expired sessions
sqlite3 data/auth.db "DELETE FROM sessions WHERE expired < (strftime('%s', 'now') * 1000);"
```

## Production Checklist

- [ ] `SESSION_SECRET` set to random 32+ character string
- [ ] HTTPS enabled (reverse proxy or platform-managed)
- [ ] `NODE_ENV=production` set
- [ ] Cookie `secure` flag enabled (automatic with HTTPS)
- [ ] Database backups configured
- [ ] Cleanup job verified running
- [ ] Rate limits appropriate for your traffic
- [ ] Firewall rules configured
- [ ] Error monitoring in place
- [ ] User communication sent about no password recovery

## Migration from Replit OAuth

See [AUTH_MIGRATION.md](./AUTH_MIGRATION.md) for complete migration guide.

## Support

For issues or questions:
1. Check server logs
2. Verify environment variables
3. Test with curl commands above
4. Check database integrity: `sqlite3 data/auth.db "PRAGMA integrity_check;"`
