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

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache sqlite-libs

# Copy package files
COPY package*.json ./

# Install production dependencies with native rebuild
RUN npm ci --production && \
    npm rebuild better-sqlite3

# Copy built app from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/static ./static

# Copy source lib directory for database module
COPY --from=builder /app/src/lib ./src/lib

# Create directories for data persistence
RUN mkdir -p /app/data /app/uploads

# Create a startup script to handle database location
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'export DB_PATH=${DB_PATH:-/app/data/todos.db}' >> /app/start.sh && \
    echo 'node build' >> /app/start.sh && \
    chmod +x /app/start.sh

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
CMD ["/app/start.sh"]
