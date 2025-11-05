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

### 3. Email Validation Enhancement (CRITICAL)
**Date:** November 5, 2025
**Issue:** Email validation only checked for `@` symbol, allowing invalid emails
**Risk:** Account creation with invalid emails, potential injection attacks

**Fix:**
- Created `src/lib/validation.js` with comprehensive validation functions
- Implemented RFC 5322 compliant email validation
- Added length constraints (254 chars max, 64 for local part, 255 for domain)
- Check for consecutive dots and invalid dot positions
- Applied to `src/routes/api/auth/register/+server.js`

**Validation Rules:**
- Must contain @ symbol with valid format
- Local part <= 64 characters
- Domain part <= 255 characters
- Total length <= 254 characters
- No consecutive dots (..)
- No leading/trailing dots in local part

### 4. Password Strength Validation (HIGH)
**Date:** November 5, 2025
**Issue:** Only required 6 characters, no complexity requirements
**Risk:** Weak passwords vulnerable to brute force attacks

**Fix:**
- Added password strength validation in `src/lib/validation.js`
- Minimum length increased to 8 characters
- Maximum length 72 characters (bcrypt limit)
- Checks for common weak passwords
- Requires mix of character types (uppercase, lowercase, numbers, special)
- Calculates strength score (0-7+)
- Applied to registration endpoint

**Password Requirements:**
- Minimum 8 characters (was 6)
- Not in common password list
- Strength score >= 4 (moderate)
- Mix of uppercase, lowercase, numbers, and special characters recommended

### 5. File Upload MIME Type Validation (CRITICAL)
**Date:** November 5, 2025
**Issue:** File type checking relied on client-provided MIME type, easily spoofed
**Risk:** Malicious file uploads, executable code disguised as images

**Fix:**
- Created `src/lib/file-validation.js` with magic number detection
- Validates actual file content using file signatures (magic numbers)
- Whitelist of allowed file types (images, documents, media)
- Type-specific file size limits (10MB-50MB depending on type)
- Blocks dangerous executable extensions (.exe, .bat, .sh, etc.)
- Applied to `src/routes/api/todos/attachments/+server.js`

**Supported File Types:**
- **Images**: JPEG, PNG, GIF, WebP, BMP, SVG (10MB max)
- **Documents**: PDF, ZIP, RAR, 7z, Office formats (25MB max)
- **Audio**: MP3, WAV, OGG (20MB max)
- **Video**: MP4, WebM, OGG (50MB max)
- **Text**: Plain text, CSV, HTML, Markdown (5MB max)

**Security Features:**
- Server-side MIME type detection (not client-provided)
- Magic number verification for known file types
- Dangerous extension blocking
- Type-specific size limits
- Logs MIME type mismatches

### 6. Username Validation (MEDIUM)
**Date:** November 5, 2025
**Issue:** Minimal username validation
**Fix:**
- Added comprehensive username validation
- Length: 3-32 characters
- Allowed characters: alphanumeric, underscore, hyphen
- No spaces or special characters

### 7. Security Headers Implementation (HIGH)
**Date:** November 5, 2025
**Issue:** No security headers in HTTP responses
**Risk:** XSS, clickjacking, MIME sniffing attacks

**Fix:**
- Added comprehensive security headers in `src/hooks.server.js`
- Applied to all HTTP responses

**Headers Added:**
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Strict-Transport-Security: max-age=31536000; includeSubDomains (HTTPS only)
Content-Security-Policy: [see below]
```

**Content Security Policy:**
```
default-src 'self'
script-src 'self' 'unsafe-inline'
style-src 'self' 'unsafe-inline'
img-src 'self' data: blob:
font-src 'self' data:
connect-src 'self' ws: wss:
frame-ancestors 'none'
base-uri 'self'
form-action 'self'
```

### 8. CSRF Protection Infrastructure (MEDIUM)
**Date:** November 5, 2025
**Issue:** No explicit CSRF token system for API endpoints
**Status:** Infrastructure created, not yet enforced (breaking change)

**Fix:**
- Created `src/lib/csrf.js` with double-submit cookie pattern
- Generates cryptographically secure tokens (32 bytes)
- Implements constant-time comparison to prevent timing attacks
- Ready for future implementation

**Note:** Not enforced yet to avoid breaking changes. The app currently relies on:
- SameSite='strict' cookies (provides CSRF protection for modern browsers)
- SvelteKit's built-in CSRF protection for form submissions

**Future Implementation:**
- Add CSRF token to all state-changing API requests
- Update frontend to include `x-csrf-token` header
- Enforce validation in API endpoints

### 9. Documentation Updates
**Files Updated:**
- `README.md` - Added Security Features section
- `CLAUDE.md` - Added comprehensive security documentation
- `.env.example` - Added ORIGIN and COOKIE_SECURE with explanations
- `stack.env` - Added ORIGIN configuration for Portainer/Unraid
- `docker-compose.yml` - Added ORIGIN environment variable
- `SECURITY_IMPROVEMENTS.md` - This file (created and maintained)

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
- [ ] Verify rate limiting on login endpoint (max 5 req/min)
- [ ] Verify rate limiting on register endpoint (max 5 req/min)
- [ ] Check that X-RateLimit-* headers are present in responses
- [ ] Verify security headers are present in all responses
- [ ] Test file upload with various file types (should validate correctly)
- [ ] Test file upload with executable files (should be blocked)
- [ ] Verify password requirements are enforced (min 8 chars, complexity)

## Security Status Summary

### ✅ Completed (Phase 1 & 2)
1. ✅ WebSocket CORS protection - `ORIGIN` environment variable
2. ✅ Rate limiting - Auth endpoints (5 req/min)
3. ✅ Email validation - RFC 5322 compliant
4. ✅ Password strength validation - 8 char min, complexity required
5. ✅ File upload MIME validation - Magic number detection
6. ✅ Security headers - CSP, X-Frame-Options, HSTS, etc.
7. ✅ Username validation - Alphanumeric + underscore/hyphen
8. ✅ CSRF infrastructure - Ready for implementation

### 🔄 In Progress / Needs Attention
9. ⚠️ Console.log statements - 135+ instances need removal/replacement
10. ⚠️ CSRF enforcement - Infrastructure ready but not enforced yet

### 📋 Future Security Improvements

### High Priority (Next Phase)
1. Remove/replace console.log statements from production code
2. Enforce CSRF token validation on all state-changing endpoints
3. Add input sanitization for XSS prevention (todo text, notes, comments)
4. Implement password reset functionality
5. Add email verification on registration

### Medium Priority
6. Create session management UI (view/revoke active sessions)
7. Add account security features (2FA, login history)
8. Implement persistent rate limiting (Redis/database for multi-instance)
9. Add security event logging and monitoring
10. Create API documentation with security best practices

### Low Priority
11. Add distributed rate limiting for multi-instance deployments
12. Create rate limit bypass for whitelisted IPs
13. Add monitoring/alerting for rate limit violations
14. Implement security audit logging
15. Add honeypot fields for bot detection

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
