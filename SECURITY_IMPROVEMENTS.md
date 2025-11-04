# Security Improvements - November 2025

This document tracks critical security improvements implemented in Tido.

## Changes Implemented

### 1. WebSocket CORS Protection (CRITICAL)
**Date:** November 4, 2025
**Issue:** WebSocket server was accepting connections from any origin (`origin: '*'`)
**Risk:** Cross-origin attacks, unauthorized WebSocket connections

**Fix:**
- Modified `src/lib/websocket.server.js` to use `process.env.ORIGIN` for CORS configuration
- Changed from `origin: '*'` to `origin: process.env.ORIGIN || false`
- Added `credentials: true` for proper cookie handling
- Updated all configuration files to include ORIGIN variable

**Configuration:**
```bash
# Production (REQUIRED)
ORIGIN=https://yourdomain.com

# Development (allows all origins)
ORIGIN=false  # or leave unset
```

### 2. Rate Limiting Implementation (CRITICAL)
**Date:** November 4, 2025
**Issue:** No protection against brute force attacks or API abuse
**Risk:** Account compromise, denial of service, resource exhaustion

**Fix:**
- Created `src/lib/rate-limit.js` with sliding window rate limiter
- Implemented three rate limit presets:
  - **AUTH**: 5 requests/minute (login, register)
  - **API**: 30 requests/minute (general operations)
  - **READ**: 100 requests/minute (read operations)
- Applied to authentication endpoints:
  - `src/routes/api/auth/login/+server.js`
  - `src/routes/api/auth/register/+server.js`

**Features:**
- IP-based identification (supports x-forwarded-for, x-real-ip headers)
- Returns 429 status with Retry-After header
- Adds X-RateLimit-* headers to responses
- Automatic cleanup of old entries every 5 minutes
- In-memory storage (suitable for single-instance deployments)

**Response Headers:**
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 2025-11-04T23:15:00.000Z
```

**Rate Limited Response:**
```json
{
  "error": "Too many authentication attempts. Please try again in a minute.",
  "retryAfter": 45
}
```

### 3. Documentation Updates
**Files Updated:**
- `README.md` - Added Security Features section
- `CLAUDE.md` - Added comprehensive security documentation
- `.env.example` - Added ORIGIN and COOKIE_SECURE with explanations
- `stack.env` - Added ORIGIN configuration for Portainer/Unraid
- `docker-compose.yml` - Added ORIGIN environment variable

## Usage for Developers

### Applying Rate Limiting to New Endpoints

```javascript
import { applyRateLimit, RATE_LIMITS } from '$lib/rate-limit.js';

export async function POST({ request, getClientAddress, setHeaders }) {
  // Apply rate limiting
  const rateLimitResult = applyRateLimit(
    { request, getClientAddress, setHeaders },
    RATE_LIMITS.API  // or AUTH, READ
  );

  if (rateLimitResult) {
    return json(rateLimitResult, {
      status: 429,
      headers: {
        'Retry-After': rateLimitResult.retryAfter?.toString() || '60'
      }
    });
  }

  // ... rest of endpoint logic
}
```

### Custom Rate Limits

```javascript
import { createRateLimiter } from '$lib/rate-limit.js';

const customLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 60000,
  message: 'Custom rate limit exceeded'
});
```

## Deployment Checklist

Before deploying to production:

- [ ] Set `ORIGIN=https://yourdomain.com` in environment variables
- [ ] Set `COOKIE_SECURE=true` or leave unset for HTTPS
- [ ] Test WebSocket connection from correct origin
- [ ] Test WebSocket rejection from unauthorized origin
- [ ] Verify rate limiting on login endpoint
- [ ] Verify rate limiting on register endpoint
- [ ] Check that X-RateLimit-* headers are present in responses

## Future Security Improvements

### High Priority (Next Phase)
1. Improve email validation (use proper regex or validator library)
2. Add file type validation for uploads (server-side MIME checking)
3. Implement CSRF token validation
4. Add security headers (CSP, X-Frame-Options, etc.)
5. Remove console.log statements from production code

### Medium Priority
6. Add password strength requirements
7. Implement password reset functionality
8. Add email verification
9. Create session management UI
10. Add input sanitization for XSS prevention

### Low Priority
11. Implement persistent rate limiting (Redis/database)
12. Add distributed rate limiting for multi-instance deployments
13. Create rate limit bypass for whitelisted IPs
14. Add monitoring/alerting for rate limit violations

## Testing Notes

Rate limiting can be tested with:
```bash
# Test auth rate limit (should block after 5 requests)
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"test"}' \
    -w "\nStatus: %{http_code}\n"
  sleep 1
done
```

WebSocket CORS can be tested by:
1. Setting ORIGIN=https://example.com
2. Attempting connection from different origin
3. Connection should be rejected

## References

- [OWASP Rate Limiting Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
- [Socket.io CORS Configuration](https://socket.io/docs/v4/handling-cors/)
- [SvelteKit Security Best Practices](https://kit.svelte.dev/docs/security)

## Changelog

**v1.1.0** (November 4, 2025)
- Added WebSocket CORS protection via ORIGIN environment variable
- Implemented rate limiting for authentication endpoints
- Updated documentation across all config files
- Created SECURITY_IMPROVEMENTS.md tracking document
