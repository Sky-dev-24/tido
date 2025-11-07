# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tido is a modern, real-time collaborative task management application built with SvelteKit and Socket.io. It features multi-user collaboration with real-time updates, user authentication with admin approval, multiple task lists with sharing capabilities, and persistent SQLite storage.

## Tech Stack

- **Frontend**: Svelte 5 with runes (`runes: true` enabled in svelte.config.js)
- **Backend**: SvelteKit with adapter-node for production deployment
- **Database**: SQLite with better-sqlite3 (configurable path via `DB_PATH` environment variable)
- **Real-time**: Socket.io for WebSocket communication
- **Authentication**: Session-based with bcrypt password hashing, password reset, email verification
- **Email**: SMTP email support via nodemailer (Gmail, Outlook, SendGrid, etc.)
- **Security**: Rate limiting, CORS protection, input sanitization, XSS prevention, SQL injection prevention

## Security Features

### Rate Limiting (`src/lib/rate-limit.js`)

The application implements a sliding window rate limiter with three presets:
- **AUTH**: 5 requests/minute for authentication endpoints (login, register)
- **API**: 30 requests/minute for general API operations
- **READ**: 100 requests/minute for read operations

Rate limiting is applied via the `applyRateLimit()` helper function in API routes. The limiter:
- Uses IP address as identifier (supports x-forwarded-for and x-real-ip headers)
- Returns 429 status with Retry-After header when limit exceeded
- Automatically cleans up old entries every 5 minutes
- Adds X-RateLimit-* headers to responses

### WebSocket CORS Protection

WebSocket connections are restricted to the origin specified in the `ORIGIN` environment variable:
- **Production**: MUST set `ORIGIN=https://yourdomain.com` to prevent unauthorized connections
- **Development**: Leave unset or set to `false` to allow all origins
- **Configuration**: `src/lib/websocket.server.js` reads `process.env.ORIGIN`

### Additional Security Measures

- **Session Security**: httpOnly, sameSite='strict' cookies with 7-day expiration
- **Password Security**: bcrypt hashing with cost factor 10, 8 character minimum with complexity requirements
- **Password Reset**: Token-based reset with 1-hour expiration, email enumeration protection
- **Email Verification**: Optional verification on registration with 24-hour token expiration
- **Input Sanitization**: HTML entity encoding for all user-generated content (todos, notes, comments, list names)
- **File Upload Security**: Server-side MIME type detection using magic numbers, blocks executables
- **Security Headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **Production Logging**: Automatic sensitive data redaction in logs (`src/lib/logger.js`)
- **SQL Injection**: All queries use parameterized statements via better-sqlite3
- **Permission Checks**: All database operations verify user access via `list_members` table
- **Automatic Cleanup**: Expired tokens, sessions, and soft-deleted items cleaned up automatically

## Email System (`src/lib/email.js`)

The application includes optional SMTP email functionality for password reset and email verification:

### Configuration

Email is **optional** - the app functions normally without it. Configure via environment variables:
- `SMTP_HOST`: SMTP server hostname (e.g., smtp.gmail.com)
- `SMTP_PORT`: SMTP port (default: 587)
- `SMTP_SECURE`: true for port 465, false for other ports
- `SMTP_USER`: SMTP username/email
- `SMTP_PASS`: SMTP password or app-specific password
- `SMTP_FROM`: Sender email address

### Supported Providers

Pre-configured examples for:
- **Gmail**: Use App Password (not regular password)
- **Outlook**: Standard SMTP
- **SendGrid**: API key authentication

### Email Functions

- `sendPasswordResetEmail(email, username, resetToken, baseUrl)` - Send password reset link
- `sendEmailVerification(email, username, verificationToken, baseUrl)` - Send email verification
- `sendApprovalNotification(email, username, baseUrl)` - Notify user when admin approves account
- `verifyEmailConfig()` - Test SMTP configuration

### Behavior Without SMTP

If SMTP is not configured:
- Emails are logged to console instead of sent
- Token links appear in server logs for testing
- All functionality works normally (tokens still generated and validated)
- Useful for development and testing

### Password Reset Flow

1. User requests reset at `/forgot-password`
2. Token generated (32 bytes, 1-hour expiry)
3. Email sent with reset link to `/reset-password?token=...`
4. User enters new password (validated for strength)
5. Token marked as used, password updated

### Email Verification Flow

1. Verification email sent automatically on registration
2. Token generated (32 bytes, 24-hour expiry)
3. Email sent with verification link to `/verify-email?token=...`
4. User clicks link, email marked as verified
5. User can resend verification from `/api/auth/resend-verification`

## Development Commands

### Running the Application

```bash
# Development server (runs on http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Production Deployment

```bash
# Run production server directly
NODE_ENV=production node build

# Or use the custom server with WebSocket support
node server.js
```

### Docker Deployment

```bash
# Using Docker Compose
docker-compose up -d

# Build Docker image
docker build -t tido .
```

## Architecture Overview

### Database Layer (`src/lib/db.js`)

The database module is the heart of the application, managing all data operations:

- **Schema**: Defines 6 core tables (users, sessions, lists, list_members, list_invitations, todos) plus supporting tables (task_attachments, todo_comments, password_reset_tokens, email_verification_tokens)
- **Dynamic columns**: Uses `ensureTodoColumn()`, `ensureUserColumn()`, `ensureListColumn()` for backward-compatible schema migrations
- **Soft deletes**: Todos use `deleted_at` timestamp for 7-day retention before permanent deletion
- **Auto-archiving**: Completed todos can be auto-archived based on user preferences (`auto_archive_days`)
- **Configurable path**: Database location controlled by `DB_PATH` environment variable (defaults to `src/lib/../../todos.db` in dev, `/app/data/todos.db` in Docker)

Key database patterns:
- All database functions verify user permissions via `list_members` table
- Task hierarchy limited to one level (subtasks cannot have subtasks)
- Recurring tasks use `next_occurrence` timestamp and automatic recreation on completion
- Session expiration handled via `expires_at` timestamp with automatic cleanup in `hooks.server.js`

### WebSocket Architecture

Real-time collaboration implemented via Socket.io with a custom integration pattern:

1. **Initialization**: `src/lib/vite-plugin-websocket.js` registers a Vite plugin that calls `initializeWebSocket()` during dev server startup
2. **Global singleton**: `src/lib/websocket.server.js` maintains WebSocket instance in `globalThis.__socketIO` to persist across HMR
3. **Production server**: `server.js` manually initializes WebSocket with the HTTP server
4. **Room-based broadcasting**: Users join `list-${listId}` rooms for scoped real-time updates

WebSocket events:
- `join-list`, `leave-list`: Room management
- `todo:editing`, `todo:stopped-editing`: Visual editing indicators
- `todo:typing`, `todo:stopped-typing`: Typing indicators per field
- `todo:created`, `todo:updated`, `todo:deleted`: Server-side broadcasts via `emitTodo*()` functions
- `user:joined`, `user:left`: Presence tracking

### SvelteKit Application Structure

- **Hooks**: `src/hooks.server.js` handles session validation and sets `event.locals.user`
- **Page protection**: `+page.server.js` files use `locals.user` to enforce authentication
- **API routes**: All data operations go through `/api/*` endpoints (not direct database access from pages)
- **First-time setup**: Empty database redirects to `/register` where first user becomes admin with auto-approval

### Component Organization

Key Svelte 5 components:
- `TodoItem.svelte`: Individual task with inline editing, drag-and-drop, subtasks
- `KanbanBoard.svelte`: Kanban view with status columns (To Do, In Progress, Done)
- `GanttChart.svelte`: Timeline visualization for tasks with due dates
- `MindMapView.svelte`: Hierarchical mind map visualization
- `CommentModal.svelte`: Task commenting interface
- `ThemeBuilder.svelte`: Custom theme creation UI

All components use Svelte 5 runes (`$state`, `$derived`, `$effect`) - ensure new code follows this pattern.

### Permission System

Three permission levels in `list_members.permission_level`:
- `admin`: Full control including member management and list deletion
- `editor`: Can create, edit, and delete todos
- `viewer`: Read-only access (not currently enforced in UI but database ready)

List creators cannot be removed. Archived lists must be archived before permanent deletion.

### Recurring Tasks

Patterns stored as:
- Standard: `daily`, `weekly`, `biweekly`, `monthly`, `yearly`
- Custom: `custom:N:unit` (e.g., `custom:3:days`, `custom:2:weeks`)

When a recurring task is completed:
1. Task remains completed with `completed_at` timestamp
2. New incomplete task created with updated due date
3. Original task's `next_occurrence` updated for next cycle
4. Process triggered by `checkRecurringTasksForList()` called on list load

### Theme System

11 built-in gradient themes defined in `src/lib/themes.js`:
- Default: `aurora` (multi-color northern lights)
- Users can create custom themes via ThemeBuilder
- Themes stored per-user in `users.theme` column
- Custom theme names sanitized and limited to 64 characters

### File Attachments

- Stored in `uploads/` directory (persisted via Docker volume)
- Metadata in `task_attachments` table
- Files reference original name, stored name, MIME type, size
- Access controlled via list membership verification

## Important Implementation Details

### Docker and Database Persistence

The application is designed for Docker deployment with proper data persistence:

- Database path MUST be set to `/app/data/todos.db` via `DB_PATH` environment variable
- Volume mounted at `/app/data` for database persistence
- Volume mounted at `/app/uploads` for file attachments
- Entrypoint script handles PUID/PGID for Unraid compatibility
- Health check uses curl to verify application is responding

### Session Management

- Sessions stored in database (not in-memory or file-based)
- 7-day expiration period
- Cleaned up via `cleanExpiredSessions()` called on session retrieval
- Old deleted todos cleaned every hour via `setInterval` in `hooks.server.js`

### Sort Ordering

Tasks maintain `sort_order` integer for drag-and-drop persistence:
- `getNextSortOrder()` finds max sort_order and increments
- Reordering via `/api/todos/reorder` validates all IDs belong to same list
- Moving tasks between lists or parents triggers full reindex of siblings

### Validation Patterns

The database layer includes extensive validation helpers:
- `normalizeDateTime()`: Ensures valid ISO timestamps or null
- `normalizePriority()`: Validates against `low`, `medium`, `high`
- `normalizeReminderMinutes()`: Converts to integer or null
- `normalizeAssignee()`: Verifies assignee is a list member

Always use these helpers when updating task fields to maintain data integrity.

## Testing and Development Tips

- Use browser DevTools WebSocket tab to debug real-time events
- Check Docker logs with `docker logs tido-app` for production issues
- Database file location differs between dev (project root) and Docker (`/app/data`)
- First user registration automatically grants admin + approval
- Subsequent users require admin approval via `/admin` dashboard

## License

AGPL-3.0 - modifications must be released under same license if offered as a service.
