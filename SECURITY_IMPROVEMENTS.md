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

### 9. Production-Safe Logging System (HIGH)
**Date:** November 5, 2025
**Issue:** 135+ console.log statements leaked sensitive information in production
**Risk:** Information disclosure, performance impact, security context leakage

**Fix:**
- Created `src/lib/logger.js` with conditional logging based on environment
- Implemented log levels: ERROR, WARN, INFO, DEBUG
- Added automatic sanitization of sensitive fields (password, token, session, etc.)
- Replaced console statements in critical files:
  - `src/lib/websocket.server.js` - WebSocket connections and events
  - `src/hooks.server.js` - Server startup and cleanup
  - `src/routes/api/auth/login/+server.js` - Authentication
  - `src/routes/api/auth/register/+server.js` - Registration
  - `src/routes/api/todos/+server.js` - Todo operations
  - `src/routes/api/todos/attachments/+server.js` - File uploads
  - `src/lib/file-validation.js` - Security events

**Logging Levels:**
- **ERROR**: Always logged (errors only)
- **WARN**: Warnings and errors (default in production)
- **INFO**: Informational messages, warnings, errors (default in production)
- **DEBUG**: Verbose logging including debug info (default in development)

**Features:**
- Automatic sensitive data redaction (passwords, tokens, sessions)
- ISO timestamp formatting
- Module-specific loggers with context
- Security event logging (always logged)
- Configurable via `LOG_LEVEL` environment variable

**Configuration:**
```bash
# Production (recommended)
LOG_LEVEL=INFO

# Development
LOG_LEVEL=DEBUG

# Minimal logging
LOG_LEVEL=ERROR
```

### 10. Input Sanitization for XSS Prevention (HIGH)
**Date:** November 5, 2025
**Issue:** User-generated content not sanitized, potential XSS attacks
**Risk:** Cross-site scripting attacks via todo text, notes, comments

**Fix:**
- Enhanced `src/lib/validation.js` with `sanitizeText()` function
- HTML entity encoding for special characters (< > & " ' /)
- Applied to all user-generated content endpoints

**Sanitization Process:**
1. Validate text length and format
2. Encode HTML special characters:
   - `<` → `&lt;`
   - `>` → `&gt;`
   - `&` → `&amp;`
   - `"` → `&quot;`
   - `'` → `&#x27;`
   - `/` → `&#x2F;`
3. Optionally remove/preserve newlines
4. Truncate to maximum length

**Applied to:**
- ✅ Todo text creation (`src/routes/api/todos/+server.js` POST)
- ✅ Todo text updates (`src/routes/api/todos/+server.js` PATCH)
- ✅ Todo notes (`src/routes/api/todos/+server.js` PATCH)
- ✅ Comments creation (`src/routes/api/comments/+server.js` POST)
- ✅ Comments updates (`src/routes/api/comments/[id]/+server.js` PATCH)
- ✅ List names (`src/routes/api/lists/+server.js` POST/PATCH)

### 11. Password Reset Functionality (HIGH)
**Date:** November 5, 2025
**Issue:** No password recovery mechanism
**Risk:** Users locked out of accounts, support burden

**Fix:**
- Created `src/lib/email.js` with SMTP email sending support
- Added password reset token tables to database schema
- Implemented secure token generation (32 bytes cryptographically random)
- Token expiry: 1 hour
- Rate limited endpoints (5 req/min)

**Implementation:**
- **Database schema** (`src/lib/db.js`):
  - `password_reset_tokens` table with expiry and usage tracking
  - `createPasswordResetToken()` - Generate secure token
  - `getPasswordResetToken()` - Validate token and check expiry
  - `markPasswordResetTokenUsed()` - Invalidate used tokens
  - `updateUserPassword()` - Update password with bcrypt hashing
  - `getUserByEmail()` - Look up user by email
  - `cleanupExpiredPasswordResetTokens()` - Auto cleanup

- **API Endpoints:**
  - `POST /api/auth/request-password-reset` - Request reset email
  - `POST /api/auth/reset-password` - Confirm reset with token
  - Both endpoints rate limited (AUTH: 5 req/min)

- **UI Pages:**
  - `/forgot-password` - Request password reset
  - `/reset-password?token=...` - Reset password with token
  - Link added to login page

**Security Features:**
- Email enumeration protection (always returns success message)
- Tokens expire after 1 hour
- Single-use tokens (marked as used after password reset)
- Old tokens invalidated when new one requested
- Password strength validation enforced
- Rate limiting to prevent abuse

**Configuration:**
```bash
# Required for password reset emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourdomain.com
```

### 12. Email Verification System (HIGH)
**Date:** November 5, 2025
**Issue:** No email ownership verification
**Risk:** Account creation with fake emails, spam potential

**Fix:**
- Added email verification token tables to database schema
- Verification emails sent on registration
- Secure token generation (32 bytes cryptographically random)
- Token expiry: 24 hours
- `email_verified` column added to users table

**Implementation:**
- **Database schema** (`src/lib/db.js`):
  - `email_verification_tokens` table with expiry and verification tracking
  - `createEmailVerificationToken()` - Generate secure token
  - `getEmailVerificationToken()` - Validate token and check expiry
  - `verifyEmail()` - Mark email as verified
  - `isEmailVerified()` - Check verification status
  - `cleanupExpiredEmailVerificationTokens()` - Auto cleanup
  - `email_verified` column in users table

- **API Endpoints:**
  - `POST /api/auth/verify-email` - Verify email with token
  - `POST /api/auth/resend-verification` - Resend verification email
  - Both endpoints rate limited (AUTH: 5 req/min)

- **UI Pages:**
  - `/verify-email?token=...` - Email verification page
  - Auto-verifies on page load, redirects to app

- **Integration:**
  - Registration endpoint updated to send verification emails
  - Verification email sent automatically after registration
  - Email notification includes approval notification function

**Security Features:**
- Tokens expire after 24 hours
- Single-use tokens (marked as verified after use)
- Old tokens deleted when new one requested
- User must be logged in to resend verification
- Already verified emails cannot be re-verified
- Rate limiting to prevent abuse

**Email Templates:**
- HTML and plain text versions
- Branded with Tido identity
- Clear calls-to-action
- Security warnings included

**Note:** Email functionality is optional. If SMTP is not configured:
- Emails are logged to console instead of sent
- Application continues to function normally
- Useful for development/testing without email server

### 13. Documentation Updates
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

### Required
- [ ] Set `ORIGIN=https://yourdomain.com` in environment variables
- [ ] Set `COOKIE_SECURE=true` or leave unset for HTTPS
- [ ] Set `LOG_LEVEL=INFO` for production logging

### Optional (Email Features)
- [ ] Configure SMTP settings if email features desired:
  - [ ] `SMTP_HOST` - SMTP server hostname
  - [ ] `SMTP_PORT` - SMTP port (usually 587)
  - [ ] `SMTP_SECURE` - true for port 465, false for other ports
  - [ ] `SMTP_USER` - SMTP username/email
  - [ ] `SMTP_PASS` - SMTP password/app password
  - [ ] `SMTP_FROM` - Sender email address
- [ ] Test password reset flow
- [ ] Test email verification flow

### Security Testing
- [ ] Test WebSocket connection from correct origin
- [ ] Test WebSocket rejection from unauthorized origin
- [ ] Verify rate limiting on login endpoint (max 5 req/min)
- [ ] Verify rate limiting on register endpoint (max 5 req/min)
- [ ] Verify rate limiting on password reset endpoints (max 5 req/min)
- [ ] Check that X-RateLimit-* headers are present in responses
- [ ] Verify security headers are present in all responses
- [ ] Test file upload with various file types (should validate correctly)
- [ ] Test file upload with executable files (should be blocked)
- [ ] Verify password requirements are enforced (min 8 chars, complexity)
- [ ] Test XSS prevention in todos, notes, comments, and list names

## Security Status Summary

### ✅ Completed (Phase 1, 2, 3 & 4)
1. ✅ WebSocket CORS protection - `ORIGIN` environment variable
2. ✅ Rate limiting - Auth endpoints (5 req/min)
3. ✅ Email validation - RFC 5322 compliant
4. ✅ Password strength validation - 8 char min, complexity required
5. ✅ File upload MIME validation - Magic number detection
6. ✅ Security headers - CSP, X-Frame-Options, HSTS, etc.
7. ✅ Username validation - Alphanumeric + underscore/hyphen
8. ✅ CSRF infrastructure - Ready for implementation
9. ✅ Production logging system - Sensitive data redaction, log levels
10. ✅ Input sanitization - XSS prevention for all user-generated content
11. ✅ Password reset functionality - SMTP email, secure tokens, rate limited
12. ✅ Email verification - Automatic on registration, resend capability

### 🔄 In Progress / Needs Attention
13. ⚠️ Console.log statements - Critical files updated, ~100 remain in client code
14. ⚠️ CSRF enforcement - Infrastructure ready but not enforced yet
15. ⚠️ Email verification enforcement - Optional, not required for access

### 📋 Future Security Improvements

### High Priority (Next Phase)
1. Remove/replace console.log statements from client code
2. Enforce CSRF token validation on all state-changing endpoints
3. Make email verification required for full access (optional feature flag)
4. Add failed login attempt tracking and account locking
5. Implement admin notification for suspicious activity

### Medium Priority
6. Create session management UI (view/revoke active sessions)
7. Add account security features (2FA, login history)
8. Implement persistent rate limiting (Redis/database for multi-instance)
9. Add security event logging and monitoring dashboard
10. Create API documentation with security best practices

### Low Priority
11. Add distributed rate limiting for multi-instance deployments
12. Create rate limit bypass for whitelisted IPs
13. Add monitoring/alerting for rate limit violations
14. Implement comprehensive security audit logging
15. Add honeypot fields for bot detection
16. Add email notification for password changes
17. Add email notification for new login from unknown device

## Testing Notes

### Rate Limiting
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

### WebSocket CORS
1. Setting ORIGIN=https://example.com
2. Attempting connection from different origin
3. Connection should be rejected

### Password Reset Flow
1. Navigate to `/forgot-password`
2. Enter email address
3. Check email for reset link (or check logs if SMTP not configured)
4. Click link to `/reset-password?token=...`
5. Enter new password (must meet strength requirements)
6. Verify password is updated and can log in

### Email Verification Flow
1. Register new account
2. Check email for verification link (or check logs if SMTP not configured)
3. Click link to `/verify-email?token=...`
4. Verify email is marked as verified
5. Test resend verification from account settings (if logged in)

## References

- [OWASP Rate Limiting Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
- [Socket.io CORS Configuration](https://socket.io/docs/v4/handling-cors/)
- [SvelteKit Security Best Practices](https://kit.svelte.dev/docs/security)

## Changelog

**v1.4.0** (November 5, 2025) - Phase 4
- Added password reset functionality with SMTP email support
- Implemented email verification system
- Created email utility module with nodemailer
- Added password reset and email verification token schemas
- Created forgot-password, reset-password, and verify-email UI pages
- Updated all configuration files with SMTP settings
- Added automatic token cleanup (6-hour intervals)

**v1.3.0** (November 5, 2025) - Phase 3
- Implemented production logging system with sensitive data redaction
- Added comprehensive input sanitization for XSS prevention
- Applied sanitization to todos, notes, comments, and list names
- Replaced console statements in critical server files
- Added LOG_LEVEL environment variable

**v1.2.0** (November 5, 2025) - Phase 2
- Implemented RFC 5322 email validation
- Added password strength validation (8 char min, complexity)
- Created server-side file MIME type validation with magic numbers
- Added security headers (CSP, HSTS, X-Frame-Options, etc.)
- Implemented username validation
- Created CSRF infrastructure (not enforced)

**v1.1.0** (November 4, 2025) - Phase 1
- Added WebSocket CORS protection via ORIGIN environment variable
- Implemented rate limiting for authentication endpoints
- Updated documentation across all config files
- Created SECURITY_IMPROVEMENTS.md tracking document
