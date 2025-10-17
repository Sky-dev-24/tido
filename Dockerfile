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

# Install runtime dependencies for better-sqlite3 and su-exec for user switching
RUN apk add --no-cache sqlite-libs su-exec shadow

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

echo "Starting Tido with PUID=$PUID and PGID=$PGID"

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
echo "Setting permissions on /app/data and /app/uploads"
chown -R $PUID:$PGID /app/data /app/uploads

# Set DB_PATH environment variable
export DB_PATH=${DB_PATH:-/app/data/todos.db}
echo "Database path: $DB_PATH"

# Switch to the specified user and run the app
echo "Starting Node.js application..."
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
  CMD node -e "require('http').get('http://localhost:3000', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Run the app
CMD ["/app/entrypoint.sh"]
