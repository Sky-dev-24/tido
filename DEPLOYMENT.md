# Tido Deployment Guide

This guide covers deploying Tido using Docker with various methods, with special focus on Portainer deployment.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Portainer Deployment (Recommended)](#portainer-deployment-recommended)
- [Docker Compose](#docker-compose)
- [Docker CLI](#docker-cli)
- [Unraid](#unraid)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Docker installed and running
- For Portainer: Portainer CE or BE installed
- Ports available: 3000 (or your chosen port)

## Portainer Deployment (Recommended)

Portainer makes it easy to deploy Tido directly from this GitHub repository.

### Method 1: Deploy from GitHub Repository (Easiest)

1. **Navigate to Portainer**
   - Log into your Portainer instance
   - Go to your environment (e.g., "local")

2. **Create a New Stack**
   - Click "Stacks" in the left sidebar
   - Click "Add stack"
   - Give it a name (e.g., `tido`)

3. **Configure the Stack**
   - Select "Repository" as the build method
   - Enter the repository URL: `https://github.com/Sky-dev-24/tido`
   - Set Compose path: `docker-compose.yml`
   - **IMPORTANT**: Scroll down to "Environment variables" and configure:

   ```env
   PUID=1000
   PGID=1000
   COOKIE_SECURE=false
   ```

   Adjust PUID/PGID to match your system user (run `id` command to find yours).

4. **Deploy the Stack**
   - Click "Deploy the stack"
   - Wait for the build and deployment to complete

5. **Verify Volumes Were Created**
   - Go to "Volumes" in the left sidebar
   - You should see two volumes:
     - `tido_tido-data` (for the SQLite database)
     - `tido_tido-uploads` (for file attachments)

### Method 2: Deploy as a Container (More Control)

If you prefer deploying as a single container with more control over volumes:

1. **Navigate to Containers**
   - Click "Containers" in the left sidebar
   - Click "Add container"

2. **Basic Configuration**
   - Name: `tido-app`
   - Image: `ghcr.io/sky-dev-24/tido:latest` (or build from source)

3. **Port Mapping**
   - Map host port `3000` to container port `3000`

4. **Volume Configuration** ⚠️ **CRITICAL FOR DATA PERSISTENCE**

   Click "Volumes" tab and add two volume mappings:

   | Container Path | Volume/Host Path | Type |
   |---------------|------------------|------|
   | `/app/data` | Create new volume: `tido-data` | Volume |
   | `/app/uploads` | Create new volume: `tido-uploads` | Volume |

   **For bind mounts** (if you prefer host paths):

   | Container Path | Host Path |
   |---------------|-----------|
   | `/app/data` | `/your/host/path/tido/data` |
   | `/app/uploads` | `/your/host/path/tido/uploads` |

5. **Environment Variables**

   Add these in the "Env" tab:

   ```
   NODE_ENV=production
   PORT=3000
   DB_PATH=/app/data/todos.db
   COOKIE_SECURE=false
   PUID=1000
   PGID=1000
   ```

6. **Restart Policy**
   - Set to "Unless stopped"

7. **Deploy**
   - Click "Deploy the container"

### Verifying Database is on Volume

After deployment, verify the database is properly stored on the volume:

1. **Check Container Logs**
   ```bash
   docker logs tido-app
   ```

   You should see:
   ```
   Starting Tido with PUID=1000 and PGID=1000
   Database path: /app/data/todos.db
   ```

2. **Inspect Volume**

   In Portainer:
   - Go to "Volumes"
   - Click on `tido-data` volume
   - Click "Browse" to see the volume contents
   - You should see `todos.db` file

   Via CLI:
   ```bash
   docker volume inspect tido_tido-data
   # Note the Mountpoint

   sudo ls -lh /var/lib/docker/volumes/tido_tido-data/_data/
   # Should show todos.db
   ```

3. **Test Data Persistence**
   - Create a user account and some tasks
   - Stop and remove the container
   - Redeploy the container
   - Your data should still be there

## Docker Compose

The included `docker-compose.yml` file provides a complete setup with proper volume configuration.

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Sky-dev-24/tido.git
cd tido

# Start the stack
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the stack
docker-compose down
```

### Custom Configuration

Create a `.env` file in the project root:

```env
# User/Group IDs (for Unraid compatibility)
PUID=1000
PGID=1000

# Cookie security (set to true if using HTTPS)
COOKIE_SECURE=false
```

### Volume Management

List volumes:
```bash
docker-compose ps -q | xargs docker inspect -f '{{ .Name }}: {{ range .Mounts }}{{ .Source }} -> {{ .Destination }} {{ end }}'
```

Backup database:
```bash
docker-compose exec tido cp /app/data/todos.db /app/data/todos.db.backup
docker cp tido-app:/app/data/todos.db.backup ./backup-$(date +%Y%m%d).db
```

## Docker CLI

For manual deployment without compose:

### Build the Image

```bash
docker build -t tido:latest .
```

### Create Volumes

```bash
docker volume create tido-data
docker volume create tido-uploads
```

### Run the Container

```bash
docker run -d \
  --name tido-app \
  -p 3000:3000 \
  -v tido-data:/app/data \
  -v tido-uploads:/app/uploads \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DB_PATH=/app/data/todos.db \
  -e COOKIE_SECURE=false \
  -e PUID=1000 \
  -e PGID=1000 \
  --restart unless-stopped \
  tido:latest
```

## Unraid

Tido is designed to work seamlessly with Unraid's Docker system.

### Using Community Applications

1. Search for "Tido" in Community Applications (coming soon)
2. Click Install
3. Configure paths:
   - `/app/data` → `/mnt/user/appdata/tido/data`
   - `/app/uploads` → `/mnt/user/appdata/tido/uploads`
4. Set PUID/PGID to match your Unraid user (typically `99:100`)

### Manual Template

Add a custom Docker template with these settings:

```xml
<Container>
  <Name>Tido</Name>
  <Repository>ghcr.io/sky-dev-24/tido:latest</Repository>
  <Network>bridge</Network>
  <Port>
    <HostPort>3000</HostPort>
    <ContainerPort>3000</ContainerPort>
    <Protocol>tcp</Protocol>
  </Port>
  <Volume>
    <HostDir>/mnt/user/appdata/tido/data</HostDir>
    <ContainerDir>/app/data</ContainerDir>
    <Mode>rw</Mode>
  </Volume>
  <Volume>
    <HostDir>/mnt/user/appdata/tido/uploads</HostDir>
    <ContainerDir>/app/uploads</ContainerDir>
    <Mode>rw</Mode>
  </Volume>
  <Environment>
    <Variable>
      <Name>PUID</Name>
      <Value>99</Value>
    </Variable>
    <Variable>
      <Name>PGID</Name>
      <Value>100</Value>
    </Variable>
    <Variable>
      <Name>DB_PATH</Name>
      <Value>/app/data/todos.db</Value>
    </Variable>
  </Environment>
</Container>
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node environment |
| `PORT` | `3000` | Port the server listens on |
| `DB_PATH` | `/app/data/todos.db` | Path to SQLite database file |
| `COOKIE_SECURE` | `false` | Set to `true` if using HTTPS |
| `PUID` | `1000` | User ID for file permissions |
| `PGID` | `1000` | Group ID for file permissions |

## Troubleshooting

### Database Not Persisting

**Symptom**: Data is lost when container is recreated.

**Cause**: Volume not properly mounted.

**Solution**:
1. Check volume configuration in Portainer or docker-compose
2. Verify volumes exist: `docker volume ls`
3. Check container mounts: `docker inspect tido-app | grep Mounts -A 20`
4. Look for this in logs:
   ```
   Database path: /app/data/todos.db
   ```

### Permission Errors

**Symptom**: Container logs show permission denied errors.

**Solution**:
1. Set correct PUID/PGID for your system
2. Find your user ID: `id -u` and group ID: `id -g`
3. Update environment variables in Portainer/compose
4. For Unraid, use `99:100`

### Container Won't Start

**Solution**:
1. Check container logs: `docker logs tido-app`
2. Verify port 3000 is not in use: `netstat -tlnp | grep 3000`
3. Ensure volumes are accessible
4. Check disk space: `df -h`

### Database Locked Errors

**Symptom**: "database is locked" errors in logs.

**Cause**: Multiple containers trying to access the same database.

**Solution**:
1. Ensure only ONE container is running
2. Stop all Tido containers: `docker stop $(docker ps -q --filter name=tido)`
3. Start only one instance

### Cannot Access Application

**Solution**:
1. Check container is running: `docker ps | grep tido`
2. Verify port mapping: `docker port tido-app`
3. Check firewall rules
4. Try accessing from host: `curl http://localhost:3000`

### Backup and Restore

**Backup**:
```bash
# Create backup
docker exec tido-app sqlite3 /app/data/todos.db ".backup /app/data/backup.db"
docker cp tido-app:/app/data/backup.db ./tido-backup-$(date +%Y%m%d).db

# Or backup entire volume
docker run --rm -v tido-data:/data -v $(pwd):/backup alpine tar czf /backup/tido-data-backup.tar.gz -C /data .
```

**Restore**:
```bash
# Stop the container
docker stop tido-app

# Restore database
docker cp ./tido-backup.db tido-app:/app/data/todos.db

# Or restore entire volume
docker run --rm -v tido-data:/data -v $(pwd):/backup alpine tar xzf /backup/tido-data-backup.tar.gz -C /data

# Start the container
docker start tido-app
```

## Updating Tido

### With Portainer (Stack)

1. Go to "Stacks" → Select "tido"
2. Click "Pull and redeploy"
3. Select "Re-pull image and redeploy"

### With Docker Compose

```bash
cd tido
git pull
docker-compose pull
docker-compose up -d
```

### With Docker CLI

```bash
docker pull ghcr.io/sky-dev-24/tido:latest
docker stop tido-app
docker rm tido-app
# Run the container again with same volume mounts
```

## Security Considerations

1. **HTTPS**: Use a reverse proxy (nginx, Traefik, Caddy) for HTTPS
2. **Firewall**: Don't expose port 3000 directly to the internet
3. **Backups**: Regular automated backups of the database volume
4. **Updates**: Keep the container updated for security patches

## Next Steps

After deployment:

1. Navigate to `http://your-server-ip:3000`
2. Register the first user account (automatically becomes admin)
3. Create your first list
4. Configure user preferences and theme
5. Invite team members (they need admin approval)

## Support

- GitHub Issues: https://github.com/Sky-dev-24/tido/issues
- Documentation: See README.md and CLAUDE.md
