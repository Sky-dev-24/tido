# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files and npm config
COPY package*.json .npmrc* ./

# Install dependencies with better error handling
RUN npm ci --verbose || npm install

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for better-sqlite3, su-exec, and curl for healthchecks
RUN apk add --no-cache sqlite-libs su-exec shadow curl python3 make g++

# Copy package files
COPY package*.json .npmrc* ./

# Install production dependencies with native rebuild and fallback
RUN (npm ci --production || npm install --production) && \
    npm rebuild better-sqlite3

# Copy built app from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/static ./static
COPY --from=builder /app/server.js ./server.js

# Copy source lib directory for database module
COPY --from=builder /app/src/lib ./src/lib

# Create directories for data persistence
RUN mkdir -p /app/data /app/uploads

# Create entrypoint script with proper user handling
RUN cat > /app/entrypoint.sh <<'EOF'
#!/bin/sh
set -e

# Default to user 1000 if not specified
PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "========================================"
echo "Starting Tido Task Manager"
echo "========================================"
echo "PUID: $PUID"
echo "PGID: $PGID"

# Create group if it doesn't exist
if ! getent group $PGID > /dev/null 2>&1; then
    echo "Creating group with GID $PGID"
    addgroup -g $PGID appgroup
fi

# Create user if it doesn't exist
if ! getent passwd $PUID > /dev/null 2>&1; then
    echo "Creating user with UID $PUID"
    adduser -D -u $PUID -G $(getent group $PGID | cut -d: -f1) appuser
fi

# Set ownership of data directories
echo ""
echo "Setting permissions on data directories..."
chown -R $PUID:$PGID /app/data /app/uploads 2>/dev/null || true

# Set DB_PATH environment variable
export DB_PATH=${DB_PATH:-/app/data/todos.db}
echo ""
echo "Database configuration:"
echo "----------------------------------------"
echo "Database path: $DB_PATH"
echo "Data directory: /app/data"
echo "Uploads directory: /app/uploads"

# Check if database exists
if [ -f "$DB_PATH" ]; then
    DB_SIZE=$(du -h "$DB_PATH" 2>/dev/null | cut -f1 || echo "unknown")
    echo "Status: Existing database found (size: $DB_SIZE)"
else
    echo "Status: No existing database - will create on first run"
fi

echo ""
echo "========================================"
echo "Starting Node.js application on port ${PORT:-3000}..."
echo "========================================"
echo ""

# Switch to the specified user and run the app
exec su-exec $PUID:$PGID node server.js
EOF

RUN chmod +x /app/entrypoint.sh

# Expose the port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/todos.db

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ["curl", "-fsS", "-m", "5", "http://127.0.0.1:3000/"]

# Declare volumes for data persistence
# This helps Docker/Portainer recognize these as mount points
VOLUME ["/app/data", "/app/uploads"]

# Run the app
CMD ["/app/entrypoint.sh"]
