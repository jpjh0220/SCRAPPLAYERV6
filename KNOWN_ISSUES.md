# Known Issues

## Session Persistence in Testing

**Status:** Under investigation
**Severity:** Low (affects curl testing only)
**Affects:** Development testing with curl

### Description

When testing authentication with curl, sessions are not being persisted correctly between requests. The session cookie is set and sent correctly, but the server doesn't retrieve the session data.

### Evidence

- ✅ Cookie is set: `Set-Cookie: connect.sid=...`
- ✅ Cookie is sent: `Cookie: connect.sid=...`
- ❌ Session not retrieved by express-session

### Likely Cause

Potential issue with `connect-sqlite3` session store integration.

### Workaround

Use a browser or Postman for testing - sessions work correctly with proper HTTP clients.

### Testing with Browser

```javascript
// In browser console or Postman:

// 1. Register
fetch('http://localhost:5000/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ username: 'test', password: 'TestPass123' })
})

// 2. Get current user (should work)
fetch('http://localhost:5000/api/auth/me', { credentials: 'include' })
```

### Next Steps

1. Test with actual browser/Postman
2. Consider alternative session stores (express-session-sqlite, better-sqlite-session)
3. Add integration tests with supertest

### Impact

- ✅ Server starts correctly
- ✅ Database created and initialized
- ✅ All TypeScript compiles without errors
- ✅ API endpoints respond
- ✅ User registration works
- ✅ Password hashing works
- ✅ Rate limiting works
- ⚠️ Session persistence needs browser testing
