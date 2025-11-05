# Tido

A modern, real-time collaborative task management application built with SvelteKit and Socket.io.

## Features

### Core Functionality
- ✅ Create, edit, and complete tasks
- 📋 Multiple lists with personal and shared options
- 🔄 Real-time collaboration with WebSocket support
- 👥 User authentication and authorization
- 🔐 Password reset and email verification
- 📝 Rich task details with notes and attachments
- 🗑️ Soft-delete with "Recently Deleted" recovery (7-day retention)

### Task Management
- 📅 Due dates and reminders
- 🎯 Priority levels (high, medium, low)
- 🔁 Recurring tasks (daily, weekly, monthly, yearly)
- 📎 File attachments
- 👤 Task assignment to team members
- 🎨 Subtasks and task hierarchy
- ↕️ Drag-and-drop reordering

### Collaboration Features
- 🤝 Real-time presence indicators
- ✍️ Live editing visibility
- 💬 Typing indicators
- 👁️ See who's actively viewing tasks
- 🔔 List member management
- 📨 Share lists with invite system

### Customization
- 🎨 11 beautiful gradient themes (Aurora default)
- 🌓 Dark mode support
- 📏 View density options (compact, comfortable, spacious)
- ⚙️ User preferences saved per account

### Admin Features
- 👑 First user becomes admin automatically
- ✅ User approval system for new registrations
- 👥 User management dashboard

## Tech Stack

- **Frontend**: Svelte 5 with runes
- **Backend**: SvelteKit (full-stack)
- **Database**: SQLite with better-sqlite3
- **Real-time**: Socket.io for WebSocket communication
- **Styling**: Custom CSS with CSS variables for theming
- **Authentication**: Session-based with secure password hashing

## Development

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/Sky-dev-24/tido.git
cd tido

# Install dependencies
npm install

# Run development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Building for Production

```bash
npm run build
npm run preview
```

## Deployment

### Docker (Recommended)

This application is designed to be deployed via Docker. See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions on deploying with:
- Portainer from GitHub (recommended)
- Docker Compose
- Docker CLI

Quick start with Docker Compose:
```bash
docker-compose up -d
```

### Manual Deployment

1. Build the application:
```bash
npm run build
```

2. Run the production server:
```bash
NODE_ENV=production node build
```

## Configuration

Copy `.env.example` to `.env` and configure as needed:
```bash
cp .env.example .env
```

### Required Environment Variables

- `NODE_ENV`: Set to `production` for production deployment (default: development)
- `PORT`: Port to run the server on (default: 3000)
- `ORIGIN`: **[SECURITY - REQUIRED FOR PRODUCTION]** Set to your application's URL for WebSocket CORS protection
  - Example: `https://yourdomain.com` or `http://192.168.1.100:3000`
  - Leave unset for development to allow all origins
- `COOKIE_SECURE`: Set to `false` for HTTP (development), automatically `true` for HTTPS in production

### Optional Environment Variables

#### Email Configuration (SMTP)
Configure these to enable password reset and email verification features. If not set, the app will function normally but email features will be disabled (emails logged to console instead).

- `SMTP_HOST`: SMTP server hostname (e.g., `smtp.gmail.com`)
- `SMTP_PORT`: SMTP server port (default: 587)
- `SMTP_SECURE`: Use SSL/TLS (true for port 465, false for other ports)
- `SMTP_USER`: SMTP username/email
- `SMTP_PASS`: SMTP password or app-specific password
- `SMTP_FROM`: Sender email address (e.g., `noreply@yourdomain.com`)

**Example Gmail Configuration:**
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # Use App Password, not regular password
SMTP_FROM=your-email@gmail.com
```

**Example SendGrid Configuration:**
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=noreply@yourdomain.com
```

#### Logging
- `LOG_LEVEL`: Set logging level (default: INFO in production, DEBUG in development)
  - Options: `ERROR`, `WARN`, `INFO`, `DEBUG`

#### Database
- `DB_PATH`: Custom database file location (default: `src/lib/../../todos.db` in dev, `/app/data/todos.db` in Docker)

## Security Features

Tido includes comprehensive production-grade security protections:

### Authentication & Access Control
- **Strong Password Requirements**: Minimum 8 characters with complexity requirements (uppercase, lowercase, numbers, special characters)
- **Password Reset**: Secure token-based password reset via email with 1-hour expiration
- **Email Verification**: Optional email verification on registration with 24-hour token expiration
- **Secure Sessions**: httpOnly, sameSite strict cookies with 7-day expiration
- **Password Hashing**: bcrypt with cost factor 10
- **User Approval System**: Admin approval required for new user registrations

### Input Validation & Sanitization
- **XSS Prevention**: All user-generated content (todos, notes, comments, list names) sanitized with HTML entity encoding
- **Email Validation**: RFC 5322 compliant email address validation
- **Username Validation**: Alphanumeric characters with underscore/hyphen, 3-32 character length
- **File Upload Security**: Server-side MIME type detection using magic numbers, blocks executable files

### Network Security
- **Rate Limiting**: Multi-level rate limiting to prevent abuse
  - Authentication endpoints: 5 requests/minute
  - General API endpoints: 30 requests/minute
  - Read operations: 100 requests/minute
- **CORS Protection**: WebSocket connections restricted to configured origin only
- **Security Headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **SQL Injection Protection**: Parameterized queries throughout all database operations

### Production Features
- **Production Logging**: Automatic sensitive data redaction in logs (passwords, tokens, sessions)
- **CSRF Infrastructure**: Ready for enforcement (infrastructure in place)
- **Automatic Cleanup**: Expired tokens and deleted items automatically cleaned up

**Important Security Notes:**
- Always set the `ORIGIN` environment variable in production to prevent unauthorized WebSocket connections
- Use HTTPS in production and set `COOKIE_SECURE=true`
- Configure SMTP settings for password reset functionality
- Review `SECURITY_IMPROVEMENTS.md` for detailed security documentation

See [SECURITY_IMPROVEMENTS.md](./SECURITY_IMPROVEMENTS.md) for complete security documentation.

## First Time Setup

1. Navigate to your deployed application
2. Register a new user account
3. The first user is automatically set as admin and approved
4. Subsequent users need admin approval to access the app
5. Create lists and start adding tasks!

## Data Storage

- **Database**: SQLite database stored in `src/lib/todos.db`
- **Uploads**: Task attachments stored in `uploads/` directory
- **Sessions**: Stored in database with 7-day expiration

## Features Overview

### Themes
Choose from 11 stunning gradient themes:
- Aurora Borealis (default) - Multi-color northern lights effect
- Ocean Blue - Deep navy to bright cyan
- Forest Green - Dark forest to bright mint
- Sunset Orange - Deep red to golden yellow
- Midnight Blue - Dark navy to sky blue
- Candy Pink - Deep pink gradient
- Lavender Dream - Purple to light pink
- Crimson Fire - Pure red gradient
- Amber Glow - Brown to golden yellow
- Monochrome - Grayscale gradient
- Emerald Sea - Teal to turquoise

### Real-time Collaboration
- See when other users are editing tasks
- Live typing indicators
- Presence tracking shows who's online
- Instant updates across all connected clients

### Task Organization
- Create multiple lists for different projects
- Share lists with team members
- Set different permission levels (admin, editor)
- Organize with subtasks
- Reorder tasks via drag-and-drop

## Browser Support

Modern browsers with WebSocket support:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## License

This project is licensed under the **GNU Affero General Public License v3 (AGPL-3.0)**.

This means:

- ✅ You are free to use, modify, and self-host this software
- ✅ You can contribute and build on it
- ✅ You can use it commercially **as long as** you open source your modifications
- ❗ If you offer it as a hosted service (SaaS), you must also release your modifications under the AGPL

I plan to offer an official hosted service for teams who don’t want to manage deployment — this helps support ongoing development.


## Contributing

## Code of Conduct  
This project adheres to the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.  

## Support  
If you need help using Tido, please refer to the [SUPPORT.md](SUPPORT.md) file for guidance on bug reports, feature requests, and user questions.  

## Security  
For security issues or vulnerabilities, please see our [SECURITY.md](SECURITY.md) policy and follow the responsible disclosure guidelines.

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m "Add your feature"`)
4. Push to your branch (`git push origin feature/your-feature`)
5. Open a Pull Request

By contributing, you agree that your contributions will be licensed under the AGPL-3.0 license.
