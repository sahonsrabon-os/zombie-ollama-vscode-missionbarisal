# Mission Barisal — cPanel Deployment Guide

> শাওন ভাইয়ের মিশন বরিশাল — cPanel-এ কিভাবে ডিপ্লয় করবেন

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Requirements](#server-requirements)
3. [Step-by-Step Deployment](#step-by-step-deployment)
4. [Environment Configuration](#environment-configuration)
5. [Reverse Proxy Setup](#reverse-proxy-setup)
6. [SSL Configuration](#ssl-configuration)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- cPanel access with Node.js support (Phusion Passenger or similar)
- SSH access (optional but recommended)
- Domain or subdomain configured in cPanel
- Node.js 18+ available on server

---

## Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 512MB | 1GB+ |
| CPU | 1 core | 2+ cores |
| Storage | 500MB | 1GB+ |
| Node.js | 18.x | 20.x LTS |
| Port | 5000 (configurable) | Any available |

---

## Step-by-Step Deployment

### Step 1: Upload Project Files

1. Login to cPanel → **File Manager**
2. Navigate to your domain's root (e.g., `public_html/` or `public_html/api/`)
3. Upload the following files/folders:

```
api/
├── hamba.js          (main server — ~10K lines)
├── start.js          (entry point)
├── domain-config.js  (domain configuration)
├── PERSONAS.md       (agent persona definitions)
├── package.json      (dependencies)
├── .env              (environment variables — DO NOT upload secrets)
└── .zombiecoder/     (auto-generated SSOT, memory, etc.)
```

**Files NOT to upload:**
- `doc/` folder (documentation only)
- `logs/` folder (auto-created)
- `cache/` folder (auto-created)
- `data/sessions.json` (auto-created)
- `node_modules/` (install on server)
- Audio files (`.mp3`, `.wav`)
- Test files (`test-*.js`)

### Step 2: Install Dependencies

Via cPanel **Terminal** or SSH:

```bash
cd /home/username/public_html/api
npm install
```

### Step 3: Configure Environment

Create `.env` file in project root:

```bash
# Server Configuration
PORT=5000
NODE_ENV=production

# OpenCode API (required for agents)
OPENCODE_API_KEY=your_opencode_api_key_here

# Groq API (fallback provider)
GROQ_API_KEY=your_groq_api_key_here

# Gemini API (tertiary fallback)
GEMINI_API_KEY=your_gemini_api_key_here

# Pusher (real-time updates — optional)
PUSHER_APP_ID=your_pusher_app_id
PUSHER_KEY=your_pusher_key
PUSHER_SECRET=your_pusher_secret
PUSHER_CLUSTER=your_pusher_cluster

# Project directory (optional — auto-detected)
PROJECT_DIR=/home/username/public_html/api
```

### Step 4: Start the Server

**Option A: cPanel Node.js App**
1. cPanel → **Setup Node.js App**
2. Create new application:
   - Node.js version: 18.x or 20.x
   - Application mode: Production
   - Application root: `api` (relative to public_html)
   - Application startup file: `start.js`
3. Click "Create"
4. Click "Run NPM Install"
5. Click "Start App"

**Option B: SSH + PM2**
```bash
cd /home/username/public_html/api
npm install -g pm2
pm2 start start.js --name mission-barisal
pm2 save
pm2 startup
```

**Option C: SSH + Direct**
```bash
cd /home/username/public_html/api
PORT=5000 nohup node start.js > /dev/null 2>&1 &
```

### Step 5: Verify

```bash
curl https://yourdomain.com/api/health
```

Expected response:
```json
{
  "healthy": true,
  "version": "3.2.1",
  "domain": "yourdomain.com",
  "agents": 6,
  "models": 23
}
```

---

## Environment Configuration

### API Keys

| Key | Required | Source |
|-----|----------|--------|
| `OPENCODE_API_KEY` | Yes | https://opencode.ai |
| `GROQ_API_KEY` | No (fallback) | https://console.groq.com |
| `GEMINI_API_KEY` | No (tertiary) | https://aistudio.google.com |

### Domain Detection

Mission Barisal auto-detects the domain from:
1. `Host` header (primary)
2. `DOMAIN` env var (override)
3. `SERVER_NAME` env var (fallback)

---

## Reverse Proxy Setup

### Apache (.htaccess)

Add to `public_html/api/.htaccess`:

```apache
# Mission Barisal Reverse Proxy
RewriteEngine On

# Proxy API requests to Node.js
RewriteRule ^api/(.*)$ http://127.0.0.1:8080/$1 [P,L,QSA]

# WebSocket support
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteRule ^api/(.*)$ ws://127.0.0.1:8080/$1 [P,L]

# Proxy headers
RequestHeader set "X-Forwarded-Proto" "https"
RequestHeader set "X-Forwarded-For" "%{REMOTE_ADDR}s"
```

### Nginx (if available)

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8080/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

---

## SSL Configuration

1. cPanel → **SSL/TLS Status**
2. Select your domain
3. Click **Run AutoSSL**
4. Ensure HTTPS redirects are configured

---

## Troubleshooting

### Server Won't Start

```bash
# Check if port is in use
lsof -i :8080

# Check Node.js version
node --version

# Check for syntax errors
node -c hamba.js

# View error logs
tail -f logs/$(date +%Y-%m-%d).log
```

### 502 Bad Gateway

- Ensure Node.js app is running
- Check proxy configuration
- Verify port matches between proxy and Node.js

### Rate Limiting

Mission Barisal has built-in rate limiting. If hitting provider limits:

1. Check provider status pages
2. Add API keys for fallback providers (Groq, Gemini)
3. Restart server to clear rate limit state

### Model 502 Errors

If specific agents return 502:
- This is **upstream provider** issue, not a code bug
- The fallback chain (OpenCode → Groq → Gemini) should handle it
- If all providers are down, the agent will return a user-friendly error

---

## Health Check Endpoint

```bash
curl https://yourdomain.com/api/health
```

Returns:
```json
{
  "healthy": true,
  "version": "3.2.1",
  "domain": "yourdomain.com",
  "serverType": "production",
  "agents": 6,
  "models": 23,
  "pusher": true,
  "uptime": 3600,
  "session_count": 42
}
```

---

## Agent Endpoints

### List Agents
```
GET /v1/models
```

### Chat with Agent
```
POST /v1/chat/completions
{
  "model": "code-guru",
  "messages": [{"role": "user", "content": "আপনার প্রশ্ন"}],
  "stream": false
}
```

### Mission Mode (Multi-Agent Debate)
```
POST /v1/chat/completions
{
  "model": "mission",
  "messages": [{"role": "user", "content": "আপনার প্রশ্ন"}],
  "stream": false
}
```

---

> **শাওন ভাই সব জানে — ভুল প্রমাণ পেলে শাওন ভাইকে বলে দিবে!** 🧟
