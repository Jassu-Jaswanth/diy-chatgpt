# DIY ChatGPT - Deployment Guide

This guide covers deploying DIY ChatGPT on Linux, macOS, Windows, and Docker.

## Quick Start

### Option 1: Docker (Recommended - All Platforms)

```bash
# Clone and configure
git clone <repo-url> && cd diy-chatgpt
cp .env.example .env
# Edit .env and add OPENAI_API_KEY

# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Access at http://localhost:3001
```

### Option 2: Native Installation

#### Linux
```bash
chmod +x scripts/setup-linux.sh
./scripts/setup-linux.sh

# Optional: Install as systemd service
./scripts/setup-linux.sh --systemd
```

#### macOS
```bash
chmod +x scripts/setup-macos.sh
./scripts/setup-macos.sh

# Optional: Install as launchd service
./scripts/setup-macos.sh --launchd
```

#### Windows (PowerShell as Administrator)
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\setup-windows.ps1

# Optional: Install as Windows Service
.\scripts\setup-windows.ps1 -InstallService
```

---

## Detailed Setup

### Prerequisites

| Component | Version | Purpose |
|-----------|---------|---------|
| Node.js | 18+ | Runtime |
| PostgreSQL | 14+ | Session metadata |
| OpenAI API Key | - | LLM access |

### Environment Variables

Create `.env` from `.env.example`:

```env
# Required
OPENAI_API_KEY=sk-your-key-here

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=diy_chatgpt
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-secure-password

# Models (optional - defaults shown)
OPENAI_MODEL=gpt-4o-mini
PLANNER_MODEL=gpt-4o-mini
REASONING_MODEL=gpt-4o
CREATIVE_MODEL=gpt-4o-mini
CODE_MODEL=gpt-4o-mini

# Server
PORT=3001
NODE_ENV=production
```

---

## Docker Deployment

### Development
```bash
docker-compose up
```

### Production
```bash
docker-compose -f docker-compose.yml up -d
```

### Custom Configuration
```bash
# Use environment variables
OPENAI_API_KEY=sk-xxx POSTGRES_PASSWORD=secure docker-compose up -d

# Or create .env file (recommended)
cp .env.example .env
# Edit .env with your values
docker-compose up -d
```

### Docker Commands
```bash
# View status
docker-compose ps

# View logs
docker-compose logs -f app

# Restart
docker-compose restart app

# Stop
docker-compose down

# Stop and remove volumes (CAUTION: deletes data)
docker-compose down -v

# Rebuild after code changes
docker-compose build --no-cache
docker-compose up -d
```

---

## Linux Deployment

### Manual Installation

```bash
# 1. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql

# 3. Create database
sudo -u postgres createdb diy_chatgpt

# 4. Clone and setup
git clone <repo> && cd diy-chatgpt
npm ci
cp .env.example .env
# Edit .env

# 5. Run
node backend/server.js
```

### Systemd Service

```bash
# Create service file
sudo tee /etc/systemd/system/diy-chatgpt.service << EOF
[Unit]
Description=DIY ChatGPT
After=network.target postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node backend/server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable diy-chatgpt
sudo systemctl start diy-chatgpt

# Check status
sudo systemctl status diy-chatgpt
journalctl -u diy-chatgpt -f
```

---

## macOS Deployment

### Manual Installation

```bash
# 1. Install Homebrew (if needed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install dependencies
brew install node@20 postgresql@16
brew services start postgresql@16

# 3. Create database
createdb diy_chatgpt

# 4. Clone and setup
git clone <repo> && cd diy-chatgpt
npm ci
cp .env.example .env
# Edit .env - set POSTGRES_USER to your macOS username

# 5. Run
node backend/server.js
```

### Launchd Service (Auto-start on boot)

The setup script can create this for you with `--launchd` flag.

```bash
# Manual creation
cat > ~/Library/LaunchAgents/com.diy-chatgpt.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.diy-chatgpt</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>$(pwd)/backend/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$(pwd)</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.diy-chatgpt.plist
```

---

## Windows Deployment

### Manual Installation

1. **Install Node.js**: Download from https://nodejs.org (LTS version)

2. **Install PostgreSQL**: Download from https://www.postgresql.org/download/windows/
   - Remember the password you set for postgres user
   - Add `C:\Program Files\PostgreSQL\16\bin` to PATH

3. **Create Database**:
   ```cmd
   psql -U postgres -c "CREATE DATABASE diy_chatgpt"
   ```

4. **Setup Application**:
   ```cmd
   git clone <repo>
   cd diy-chatgpt
   npm ci
   copy .env.example .env
   # Edit .env with notepad
   ```

5. **Run**:
   ```cmd
   node backend\server.js
   ```

### Windows Service (using NSSM)

```powershell
# Install NSSM
choco install nssm -y

# Install service
nssm install diy-chatgpt "C:\Program Files\nodejs\node.exe" "C:\path\to\diy-chatgpt\backend\server.js"
nssm set diy-chatgpt AppDirectory "C:\path\to\diy-chatgpt"
nssm set diy-chatgpt AppEnvironmentExtra NODE_ENV=production

# Start service
nssm start diy-chatgpt

# Manage
nssm status diy-chatgpt
nssm stop diy-chatgpt
nssm restart diy-chatgpt
```

---

## Reverse Proxy Setup

### Nginx

```nginx
server {
    listen 80;
    server_name chat.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### With SSL (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d chat.yourdomain.com
```

---

## Backup & Restore

### Backup

```bash
# Backup PostgreSQL
pg_dump -U postgres diy_chatgpt > backup_$(date +%Y%m%d).sql

# Backup session files
tar -czf sessions_$(date +%Y%m%d).tar.gz data/sessions/
```

### Restore

```bash
# Restore PostgreSQL
psql -U postgres diy_chatgpt < backup_20241126.sql

# Restore session files
tar -xzf sessions_20241126.tar.gz
```

---

## Troubleshooting

### Port Already in Use
```bash
# Linux/macOS
lsof -i :3001
kill -9 <PID>

# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

### Database Connection Failed
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql  # Linux
brew services list                # macOS
Get-Service postgresql*           # Windows

# Test connection
psql -U postgres -h localhost -d diy_chatgpt
```

### Permission Denied on data/sessions
```bash
chmod -R 755 data/sessions
chown -R $USER:$USER data/sessions
```

---

## Health Check

```bash
curl http://localhost:3001/health
# Should return: {"status":"ok",...}
```

---

## Security Recommendations

1. **Never commit `.env`** - It's in `.gitignore`
2. **Use strong PostgreSQL passwords** in production
3. **Enable HTTPS** via reverse proxy
4. **Restrict database access** to localhost only
5. **Regular backups** of database and session files
6. **Keep dependencies updated**: `npm audit fix`
