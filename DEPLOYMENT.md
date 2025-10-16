# Deployment Guide - Portainer from GitHub

## Prerequisites
- Docker and Docker Compose installed on your server
- Portainer installed and running
- GitHub repository with this code

## Deployment Steps

### 1. Push Code to GitHub
Make sure all your code is committed and pushed to your GitHub repository.

### 2. Deploy via Portainer

#### Option A: Using Portainer Stacks (Recommended)

1. **Log into Portainer**
2. **Navigate to Stacks** → Click "Add stack"
3. **Configure the stack:**
   - **Name**: `tido` (or any name you prefer)
   - **Build method**: Select "Repository"
   - **Repository URL**: `https://github.com/YOUR_USERNAME/YOUR_REPO.git`
   - **Repository reference**: `refs/heads/main` (or your branch name)
   - **Compose path**: `docker-compose.yml`

4. **Environment variables** (optional):
   - You can add custom environment variables here if needed
   - Example:
     - `PORT=3000`
     - `NODE_ENV=production`

5. **Enable automatic updates** (optional):
   - Toggle "Enable webhook" if you want to trigger rebuilds via GitHub webhooks
   - Enable "Pull latest image" if you want Portainer to check for updates

6. **Click "Deploy the stack"**

#### Option B: Using Git Repository

1. **Navigate to Stacks** → Click "Add stack"
2. **Build method**: Select "Git Repository"
3. **Repository URL**: Enter your GitHub repo URL
4. **Reference**: Enter branch name (e.g., `main`)
5. **Compose path**: `docker-compose.yml`
6. **Additional authentication** (if private repo):
   - Add GitHub personal access token or SSH key
7. **Click "Deploy the stack"**

### 3. Configure Port Mapping

If port 3000 is already in use, you can change it in the docker-compose.yml ports section:
```yaml
ports:
  - "8080:3000"  # Change 8080 to any available port
```

### 4. Access Your Application

Once deployed, access your application at:
- `http://YOUR_SERVER_IP:3000`
- Or `http://localhost:3000` if running locally

### 5. First Time Setup

1. Navigate to the application URL
2. Register the first user account (will be automatically set as admin)
3. Approve additional users from the admin dashboard

## Updating the Application

### Manual Update via Portainer:
1. Go to **Stacks**
2. Select your `tido` stack
3. Click **Pull and redeploy**
4. Or click **Editor** to modify the compose file, then **Update the stack**

### Automatic Updates with Webhooks:
1. In Portainer stack settings, enable webhook
2. Copy the webhook URL
3. In GitHub, go to **Settings** → **Webhooks** → **Add webhook**
4. Paste the Portainer webhook URL
5. Set content type to `application/json`
6. Select "Just the push event"
7. Save webhook
8. Now every push to the repository will trigger a redeploy

## Data Persistence

Your data is stored in Docker named volumes:
- `tido-db`: Contains the SQLite database
- `tido-uploads`: Contains task attachment files

### Backup Volumes

To backup your data:
```bash
# Backup database
docker run --rm -v tido-db:/data -v $(pwd):/backup alpine tar czf /backup/tido-db-backup.tar.gz -C /data .

# Backup uploads
docker run --rm -v tido-uploads:/data -v $(pwd):/backup alpine tar czf /backup/tido-uploads-backup.tar.gz -C /data .
```

### Restore Volumes

To restore backups:
```bash
# Restore database
docker run --rm -v tido-db:/data -v $(pwd):/backup alpine tar xzf /backup/tido-db-backup.tar.gz -C /data

# Restore uploads
docker run --rm -v tido-uploads:/data -v $(pwd):/backup alpine tar xzf /backup/tido-uploads-backup.tar.gz -C /data
```

## Troubleshooting

### View Logs
1. In Portainer, go to **Containers**
2. Click on `tido-app`
3. Click **Logs**

Or via command line:
```bash
docker logs tido-app
```

### Container Won't Start
- Check logs for errors
- Verify port 3000 is not in use: `netstat -tulpn | grep 3000`
- Ensure volumes are properly mounted

### Database Issues
- The database is automatically created on first run
- Check volume permissions if database won't create
- Verify the database volume is mounted correctly

### WebSocket Connection Issues
If real-time features aren't working:
- Ensure WebSocket connections aren't blocked by firewall
- Check reverse proxy configuration (if using one)
- Verify the PORT environment variable matches the exposed port

## Production Recommendations

### 1. Use Reverse Proxy (NGINX/Traefik)
Add a reverse proxy for HTTPS support:
- Install nginx or use Traefik in Portainer
- Configure SSL certificates (Let's Encrypt recommended)
- Update port mappings to route through proxy

### 2. Regular Backups
- Schedule automated backups of the volumes
- Store backups off-server
- Test restore procedures regularly

### 3. Security
- Change default ports
- Enable firewall rules
- Use strong passwords for admin account
- Keep Docker and Portainer updated

### 4. Monitoring
- Set up container health checks
- Monitor resource usage in Portainer
- Set up alerts for container failures

## Support

For issues or questions:
- Check application logs in Portainer
- Review this deployment guide
- Check the main README.md for application features
