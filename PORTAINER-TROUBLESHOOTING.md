# Portainer Deployment Troubleshooting

## Critical Issue: SMTP Variables Appearing

If you see errors like:
```
level=warning msg="The \"SMTP_HOST\" variable is not set. Defaulting to a blank string."
```

**This means you are NOT deploying the Tido application!**

Tido has ZERO references to SMTP variables. You are either:
1. Deploying from the wrong repository
2. Have SMTP environment variables configured in Portainer

## Verification Steps

### 1. Verify Repository URL

In Portainer, check your stack configuration:

**Repository URL must be EXACTLY:**
```
https://github.com/Sky-dev-24/tido
```

**NOT:**
- Any other GitHub repository
- A fork with different code
- A local git URL

### 2. Verify Branch

Use one of:
- `main` (recommended - has all latest fixes)
- `refs/heads/main` (explicit reference)
- `claude/fix-portainer-deployment-011CUsj2Qi5yx9RMhxLoxRFa` (development branch)

### 3. Check Environment Variables

In Portainer Stack Settings, **Environment Variables** section should ONLY have:

```env
PUID=1000
PGID=1000
COOKIE_SECURE=false
```

**Delete these if present:**
- SMTP_HOST
- SMTP_USER
- SMTP_PASS
- SMTP_FROM
- Any other SMTP-related variables

### 4. Verify Compose File Path

**Compose path must be:**
```
docker-compose.yml
```

## Current Build Error: npm run build

The latest error shows the Vite build is failing. With the latest changes, the build will now show the actual error message.

### Common Causes:

1. **Out of Memory**
   - Solution: Increased to 2GB in latest Dockerfile

2. **Missing Dependencies**
   - Solution: Added fallback to `npm install` if `npm ci` fails

3. **Build Tools Missing**
   - Solution: Added python3, make, g++ to builder stage

### Next Steps:

1. **Pull the latest code** - Commit `ff321e4` has debugging improvements
2. **Redeploy in Portainer**
3. **Check the build logs** - You'll now see the actual error message
4. **Report back** with the actual build error (after "Build failed! Showing last 50 lines of output:")

## How to Deploy Correctly

### Method 1: Repository Deployment (Recommended)

1. Portainer → **Stacks** → **Add Stack**
2. Name: `tido`
3. Build method: **Repository**
4. Repository URL: `https://github.com/Sky-dev-24/tido`
5. Repository reference: `refs/heads/main`
6. Compose path: `docker-compose.yml`
7. Environment variables:
   ```
   PUID=1000
   PGID=1000
   COOKIE_SECURE=false
   ```
8. Enable: ✅ **Build** (to build from Dockerfile)
9. Click **Deploy the stack**

### Method 2: Web Editor

If repository deployment isn't working:

1. Portainer → **Stacks** → **Add Stack**
2. Name: `tido`
3. Build method: **Web editor**
4. Paste the contents of `docker-compose.yml` from this repository
5. Set environment variables as above
6. Deploy

**Note:** Web editor requires you to manually update the stack when code changes.

## Verifying You're Deploying Tido

The correct Tido docker-compose.yml has:
- ✅ Container name: `tido-app`
- ✅ Volumes: `tido-data`, `tido-uploads`
- ✅ Port: `3000:3000`
- ✅ Environment variables: `NODE_ENV`, `PORT`, `COOKIE_SECURE`, `PUID`, `PGID`
- ❌ NO SMTP variables anywhere

If your compose file has SMTP variables, you're deploying the wrong application.

## Getting More Help

When asking for help, please provide:

1. **Repository URL** you're using in Portainer
2. **Full build logs** from Portainer (especially after "Build failed!" message)
3. **Environment variables** you have configured
4. **Screenshot** of your Portainer stack configuration (optional)

## Quick Test: Local Build

To verify the code builds correctly locally:

```bash
# Clone the repository
git clone https://github.com/Sky-dev-24/tido.git
cd tido

# Install dependencies
npm install

# Try building
npm run build

# If this succeeds, the issue is with Portainer configuration
```

## Latest Changes

**Commit `ff321e4`** (latest):
- Added verbose build output
- Increased Node memory to 2GB
- Will show actual build error messages

**Commit `e203e6a`**:
- Added npm ci fallback to npm install
- Added .npmrc with network timeouts
- Added build tools to production stage

**Commit `93e08da`**:
- Simplified entrypoint script
- Removed problematic volume detection

**Commit `4e9ee5e`**:
- Added VOLUME declarations
- Created DEPLOYMENT.md guide
- Enhanced startup logging
