# Project Overview

This project is a real-time, collaborative task management application named "Tido". It is built with a modern tech stack, featuring SvelteKit for the full-stack framework, Socket.io for real-time communication, and SQLite for the database. The application allows users to create and manage tasks, organize them into lists, and collaborate with others in real-time.

## Main Technologies

*   **Frontend:** Svelte 5 (with runes)
*   **Backend:** SvelteKit (full-stack)
*   **Database:** SQLite (using `better-sqlite3`)
*   **Real-time Communication:** Socket.io
*   **Styling:** Custom CSS with variables for theming
*   **Authentication:** Session-based with secure password hashing

## Architecture

The application follows a full-stack SvelteKit architecture. A custom Node.js server (`server.js`) is used to run the SvelteKit handler and initialize the WebSocket server. The core business logic and database interactions are encapsulated in `src/lib/db.js`, which provides a comprehensive API for managing users, lists, todos, and other application data. The frontend is built with Svelte components, and real-time updates are pushed to clients via Socket.io.

# Building and Running

## Prerequisites

*   Node.js 18+
*   npm or pnpm

## Development

To run the application in a development environment, follow these steps:

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Run the development server:
    ```bash
    npm run dev
    ```
The application will be available at `http://localhost:5173`.

## Building for Production

To build the application for production, use the following command:

```bash
npm run build
```

This will create a production-ready build in the `build` directory.

## Running in Production

To run the application in production, you can use the preview command or run the custom server directly:

**Using `vite preview`:**

```bash
npm run preview
```

**Running the custom server:**

```bash
node server.js
```

It is recommended to use a process manager like PM2 to run the application in a production environment.

# Development Conventions

## Coding Style

The codebase is written in JavaScript and Svelte. It follows modern JavaScript conventions, including the use of ES modules. The code is well-structured and organized, with a clear separation of concerns between the frontend, backend, and database layers.

## Testing

The project includes a Playwright configuration (`playwright.config.ts`) for end-to-end testing. The tests are located in the `tests` directory. To run the tests, you will need to have Playwright installed and configured.

## Contribution Guidelines

The `README.md` file provides clear guidelines for contributing to the project. Contributions are welcome and should follow the standard fork-and-pull-request workflow. All contributions will be licensed under the AGPL-3.0 license.
