# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for better-sqlite3, su-exec, and curl for healthchecks
RUN apk add --no-cache sqlite-libs su-exec shadow curl

# Copy package files
COPY package*.json ./

# Install production dependencies with native rebuild
RUN npm ci --production && \
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

# Verify volume mounts
echo ""
echo "Checking volume mounts..."
echo "----------------------------------------"

if mountpoint -q /app/data 2>/dev/null || [ "$(stat -c %d /app/data)" != "$(stat -c %d /app)" ]; then
    echo "✓ /app/data appears to be a volume mount"
else
    echo "⚠ WARNING: /app/data does not appear to be a volume!"
    echo "  Your database will be stored in the container and WILL BE LOST on container recreation."
    echo "  Please configure a volume mount for /app/data in your Docker/Portainer setup."
fi

if mountpoint -q /app/uploads 2>/dev/null || [ "$(stat -c %d /app/uploads)" != "$(stat -c %d /app)" ]; then
    echo "✓ /app/uploads appears to be a volume mount"
else
    echo "⚠ WARNING: /app/uploads does not appear to be a volume!"
    echo "  Uploaded files will be stored in the container and WILL BE LOST on container recreation."
    echo "  Please configure a volume mount for /app/uploads in your Docker/Portainer setup."
fi

# Set ownership of data directories
echo ""
echo "Setting permissions..."
chown -R $PUID:$PGID /app/data /app/uploads
echo "✓ Permissions set"

# Set DB_PATH environment variable
export DB_PATH=${DB_PATH:-/app/data/todos.db}
echo ""
echo "Database configuration:"
echo "----------------------------------------"
echo "Database path: $DB_PATH"

# Check if database exists
if [ -f "$DB_PATH" ]; then
    DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
    echo "✓ Existing database found (size: $DB_SIZE)"
else
    echo "ℹ No existing database found - will create new database on first run"
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
