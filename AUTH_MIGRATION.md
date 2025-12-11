# Authentication Migration Guide

## Overview

This application has been migrated from **Replit OAuth** to **local username/password authentication**.

## ⚠️ CRITICAL CHANGES

### What Was Removed

1. **Replit OAuth Integration**
   - All Replit OAuth routes (`/auth/replit`, `/oauth/callback`, etc.)
   - Replit OAuth client configuration
   - `openid-client` and Replit-specific dependencies
   - Replit-based session handling

2. **Old User Accounts**
   - **ALL PREVIOUS REPLIT-AUTHENTICATED ACCOUNTS HAVE BEEN INVALIDATED**
   - All sessions created with Replit OAuth have been destroyed
   - Users must re-register with username/password

3. **Dependencies Removed**
   - `openid-client` (Replit OAuth)
   - `passport` and `passport-local` (OAuth framework)
   - `connect-pg-simple` (PostgreSQL sessions)

### What Was Added

1. **Local Authentication System**
   - Username/password registration
   - bcrypt password hashing (12 salt rounds)
   - SQLite-based user database
   - SQLite-based session storage

2. **Security Features**
   - Rate limiting on auth endpoints (5 attempts per 10 minutes)
   - Password strength requirements
   - Secure session management

3. **Account Lifecycle**
   - Automatic deletion of accounts inactive for 7+ days
   - Daily cleanup job at 3 AM (configurable)

## Migration Steps for Deployment

### 1. Remove Replit OAuth Credentials

```bash
# Remove from environment variables
unset REPLIT_OAUTH_CLIENT_ID
unset REPLIT_OAUTH_CLIENT_SECRET
unset REPLIT_OAUTH_REDIRECT_URI

# If using .env file:
# Delete or comment out these lines:
# REPLIT_OAUTH_CLIENT_ID=...
# REPLIT_OAUTH_CLIENT_SECRET=...
```

### 2. Generate New Session Secret

```bash
# Generate a secure random secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env:
SESSION_SECRET=<generated-secret-here>
```

### 3. Clean Up Old Sessions

```bash
# If you have old PostgreSQL session table:
psql $DATABASE_URL -c "DROP TABLE IF EXISTS sessions;"

# The new SQLite session table will be created automatically
```

### 4. Inform Users

**Send this notification to all users:**

```
🔒 Important: Authentication System Update

We have upgraded our authentication system for improved security and privacy.

REQUIRED ACTION:
- All previous accounts have been reset
- You must create a NEW account with username/password
- Your previous Replit-based login no longer works

IMPORTANT TO KNOW:
- ⚠️ NO PASSWORD RECOVERY: If you forget your password, your account is permanently lost
- 🗑️ AUTO-DELETION: Accounts not used for 7 days are automatically deleted
- 🔐 Keep your password safe - write it down if needed

Create your new account at: https://yourdomain.com/register
```

### 5. Update Frontend

Remove all Replit sign-in UI components:

```typescript
// REMOVE: Replit OAuth button
// <Button onClick={handleReplitLogin}>Sign in with Replit</Button>

// KEEP: New username/password forms
// <LoginForm />
// <RegisterForm />
```

### 6. Verify Deployment

After deployment, verify:

```bash
# 1. Check auth database exists
ls -lh data/auth.db

# 2. Test registration
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"TestPass123"}'

# 3. Test login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"TestPass123"}'

# 4. Check cleanup job started
# Look for log: "[CleanupJob] Scheduling daily cleanup at 3:00"
```

## Security Checklist

- [ ] SESSION_SECRET changed from default
- [ ] HTTPS enabled in production
- [ ] Old Replit OAuth credentials removed
- [ ] Session secret rotated (invalidates old sessions)
- [ ] Firewall rules updated (if applicable)
- [ ] Users notified of auth system change
- [ ] Frontend Replit sign-in UI removed
- [ ] Old session storage cleared

## Rollback Plan

If you need to rollback:

1. **Stop the server**
2. **Restore previous version** from git
3. **Restore Replit OAuth credentials**
4. **Clear new SQLite databases**:
   ```bash
   rm -f data/auth.db*
   ```

## Data Retention

### Old Data
- **User accounts**: All invalidated - users must re-register
- **Sessions**: All destroyed - users must log in again
- **Music library**: Preserved (linked by user ID, will be orphaned)
- **Posts/Comments**: Preserved (linked by user ID, will be orphaned)

### New Data
- **New user accounts**: Stored in `data/auth.db`
- **New sessions**: Stored in `data/auth.db` sessions table
- **Automatic cleanup**: Accounts deleted after 7 days of inactivity

## Important Notes

### No Migration Path

There is **NO automatic migration** of old Replit accounts to the new system because:

1. We don't have passwords for old accounts (OAuth-based)
2. We can't recover OAuth identity without Replit integration
3. Clean break ensures security and simplicity

### User Experience Impact

- **All users must re-register** with new credentials
- **No password recovery** - emphasize this to users
- **Account auto-deletion** - users must log in at least once per week

### Technical Debt Removed

- Removed complex OAuth flow
- Removed external dependency (Replit)
- Simplified session management
- Reduced attack surface

## Monitoring

After migration, monitor:

1. **Registration rate**: `SELECT COUNT(*) FROM auth_users;`
2. **Active users**: `SELECT COUNT(*) FROM auth_users WHERE last_login > datetime('now', '-7 days');`
3. **Cleanup job logs**: Look for `[CleanupJob]` messages
4. **Failed login attempts**: Check rate limiter logs

## Support

For issues during migration:

1. Check server logs for errors
2. Verify DATABASE_URL and SESSION_SECRET are set
3. Ensure HTTPS is configured (production)
4. Check file permissions on `data/auth.db`

## Files Changed

```
REMOVED:
- server/replitAuth.ts

ADDED:
- server/auth/localAuth.ts
- server/auth/database.ts
- server/auth/cleanupJob.ts
- server/routes/auth.routes.ts
- server/db/auth-schema.sql
- data/auth.db (created at runtime)

MODIFIED:
- server/index.ts (new auth initialization)
- package.json (new dependencies)
- All protected routes (new auth middleware)
```
