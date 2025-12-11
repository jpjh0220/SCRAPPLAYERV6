# Routes Migration Guide - Replit OAuth to Local Auth

## Overview

The `server/routes.ts` file needs to be updated to replace Replit OAuth with local authentication.

## Required Changes

### 1. Remove setupAuth() Call

**Find (line ~428):**
```typescript
await setupAuth(app);
```

**Replace with:**
```typescript
// REMOVED: Replit OAuth setup - now using local auth
// Authentication is initialized in server/index.ts
```

### 2. Replace isAuthenticated Middleware

**Find all instances of:**
```typescript
app.post("/some/route", isAuthenticated, async (req: any, res) => {
```

**Replace with:**
```typescript
app.post("/some/route", requireAuth, async (req: any, res) => {
```

**Affected routes (grep results):**
- Line 1023: `POST /api/upload`
- Line 1118: `GET /api/profile/me`
- Line 1145: `PATCH /api/profile/me`
- Line 1169: `GET /api/username/check`
- Line 1195: `PUT /api/username`
- Line 1260: `POST /api/users/:userId/follow`
- Line 1302: `DELETE /api/users/:userId/follow`
- Line 1344: `GET /api/feed`
- Line 1388: `POST /api/posts`
- Line 1465: `DELETE /api/posts/:postId`
... and more

### 3. Replace req.isAuthenticated() Checks

**Find all instances of:**
```typescript
if (!req.isAuthenticated()) {
  return res.status(401).json({ error: "Unauthorized" });
}
```

**Replace with:**
```typescript
if (!req.session?.userId) {
  return res.status(401).json({ error: "Unauthorized" });
}
```

**Affected lines:**
- Line 432
- Line 476
- Line 524
- Line 810
- Line 861

### 4. Replace req.user?.claims?.sub

**Find all instances of:**
```typescript
const userId = req.user?.claims?.sub;
```

**Replace with:**
```typescript
const userId = req.session.userId;
// Or if user object is needed:
const user = (req as any).user; // AuthUser type
const userId = user?.id;
```

**Affected code patterns:**
```typescript
// OLD
const userId = req.user?.claims?.sub;
const user = req.user;
profile = await storage.createProfile({
  userId,
  username: user.claims?.email || `user_${userId}`,
  displayName: user.claims?.first_name || user.claims?.given_name || ...
});

// NEW
const userId = req.session.userId!; // ! because requireAuth ensures it exists
const authUser = (req as any).user; // Attached by attachUser middleware
profile = await storage.createProfile({
  userId: String(userId), // Convert number to string if needed
  username: authUser.username,
  displayName: authUser.username, // Or let user set this separately
});
```

### 5. Replace Optional Authentication Checks

**Find:**
```typescript
const currentUserId = req.isAuthenticated?.() ? req.user?.claims?.sub : null;
```

**Replace with:**
```typescript
const currentUserId = req.session?.userId || null;
```

**Affected lines:**
- Line 776
- Line 1234
- Line 1431
- Line 1448

### 6. Remove OLD /api/auth/user Endpoint

**Find (around line 431):**
```typescript
app.get('/api/auth/user', async (req: any, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const claims = req.user?.claims;
  ...
});
```

**Replace with:**
```typescript
// REMOVED: This endpoint is replaced by /api/auth/me
// See server/routes/auth.routes.ts
```

## Systematic Replacement Script

You can use this sed script to make bulk replacements:

```bash
# Backup first!
cp server/routes.ts server/routes.ts.backup

# Remove setupAuth call
sed -i '/await setupAuth(app);/d' server/routes.ts

# Replace isAuthenticated middleware
sed -i 's/, isAuthenticated,/, requireAuth,/g' server/routes.ts

# Replace req.user?.claims?.sub with req.session.userId
sed -i 's/req\.user\?\.claims\?\.sub/req.session.userId/g' server/routes.ts

# Replace req.isAuthenticated() checks
sed -i 's/!req\.isAuthenticated()/!req.session?.userId/g' server/routes.ts
sed -i 's/req\.isAuthenticated?.()/req.session?.userId/g' server/routes.ts
```

**⚠️ WARNING:** Automated replacement may not handle all cases correctly. Manual review is required!

## Manual Review Required

After automated replacements, manually review these patterns:

### User Profile Creation

**OLD:**
```typescript
const user = req.user;
profile = await storage.createProfile({
  userId,
  username: user.claims?.email || `user_${userId}`,
  displayName: user.claims?.first_name || 'User',
  avatarUrl: user.claims?.picture || null,
});
```

**NEW:**
```typescript
const authUser = (req as any).user; // AuthUser from localAuth
profile = await storage.createProfile({
  userId: String(authUser.id),
  username: authUser.username,
  displayName: authUser.username, // Default, user can change later
  avatarUrl: null, // No OAuth avatar
});
```

### Notification Messages

**OLD:**
```typescript
const followerProfile = await storage.getProfile(followerId);
const displayName = followerProfile?.displayName || followerProfile?.username || 'Someone';
```

**NEW:** (No changes needed - this pattern still works)

## Testing After Migration

```bash
# 1. Test protected route without auth
curl http://localhost:5000/api/profile/me
# Should return 401

# 2. Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"TestPass123"}' \
  -c cookies.txt

# 3. Test protected route with auth
curl http://localhost:5000/api/profile/me -b cookies.txt
# Should return user profile

# 4. Test download endpoint
curl -X POST http://localhost:5000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' \
  -b cookies.txt
```

## Common Errors After Migration

### "userId is not defined"

**Cause:** Forgot to get userId from session

**Fix:**
```typescript
const userId = req.session.userId!;
```

### "Cannot read property 'claims' of undefined"

**Cause:** Still using old req.user.claims pattern

**Fix:**
```typescript
// OLD: const userId = req.user?.claims?.sub;
const userId = req.session.userId;
```

### "Property 'user' does not exist on type 'Request'"

**Cause:** Need to cast to any for user property

**Fix:**
```typescript
const authUser = (req as any).user;
```

## Complete Example

**Before:**
```typescript
app.get("/api/profile/me", isAuthenticated, async (req: any, res) => {
  const userId = req.user?.claims?.sub;
  const user = req.user;

  let profile = await storage.getProfile(userId);

  if (!profile) {
    profile = await storage.createProfile({
      userId,
      username: user.claims?.email || `user_${userId}`,
      displayName: user.claims?.first_name || 'User',
      avatarUrl: user.claims?.picture || null,
    });
  }

  res.json(profile);
});
```

**After:**
```typescript
app.get("/api/profile/me", requireAuth, async (req: any, res) => {
  const userId = req.session.userId!;
  const authUser = (req as any).user; // AuthUser type

  let profile = await storage.getProfile(String(userId));

  if (!profile) {
    profile = await storage.createProfile({
      userId: String(userId),
      username: authUser.username,
      displayName: authUser.username,
      avatarUrl: null,
    });
  }

  res.json(profile);
});
```

## Files to Update

1. ✅ `server/routes.ts` - Main routes file (this guide)
2. ✅ `server/index.ts` - Already updated
3. ✅ `server/routes/tracks.routes.ts` - Already using requireAuth
4. ✅ `server/routes/download.routes.ts` - Already using requireAuth
5. ⚠️ Any other route files you've created

## Verification Checklist

After making changes:

- [ ] No imports of `replitAuth` remain
- [ ] All `isAuthenticated` replaced with `requireAuth`
- [ ] All `req.user?.claims?.sub` replaced
- [ ] All `req.isAuthenticated()` checks replaced
- [ ] Profile creation updated (no OAuth fields)
- [ ] TypeScript compiles without errors: `npm run check`
- [ ] All protected endpoints tested
- [ ] Session cookies working correctly

## Rollback

If something breaks, restore backup:

```bash
cp server/routes.ts.backup server/routes.ts
```
