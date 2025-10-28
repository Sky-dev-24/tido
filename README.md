# Tido

A modern, real-time collaborative task management application built with SvelteKit and Socket.io.

## Features

### Core Functionality
- ✅ Create, edit, and complete tasks
- 📋 Multiple lists with personal and shared options
- 🔄 Real-time collaboration with WebSocket support
- 👥 User authentication and authorization
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
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd todolist

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

Environment variables:
- `NODE_ENV`: Set to `production` for production deployment
- `PORT`: Port to run the server on (default: 3000)

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
