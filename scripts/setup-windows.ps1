# DIY ChatGPT - Windows Setup Script
# Run as Administrator: powershell -ExecutionPolicy Bypass -File setup-windows.ps1

param(
    [switch]$InstallService
)

$ErrorActionPreference = "Stop"

# Colors
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Blue }
function Write-Success { Write-Host "[SUCCESS] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "[ERROR] $args" -ForegroundColor Red }

# Check if running as admin
function Test-Admin {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Install Chocolatey
function Install-Chocolatey {
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-Success "Chocolatey already installed"
        return
    }
    
    Write-Info "Installing Chocolatey..."
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    
    Write-Success "Chocolatey installed"
}

# Install Node.js
function Install-NodeJS {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        $version = (node -v) -replace 'v', '' -split '\.' | Select-Object -First 1
        if ([int]$version -ge 18) {
            Write-Success "Node.js $(node -v) already installed"
            return
        }
    }
    
    Write-Info "Installing Node.js..."
    choco install nodejs-lts -y
    
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    
    Write-Success "Node.js installed"
}

# Install PostgreSQL
function Install-PostgreSQL {
    $psql = Get-Command psql -ErrorAction SilentlyContinue
    if ($psql) {
        Write-Success "PostgreSQL already installed"
        return
    }
    
    Write-Info "Installing PostgreSQL..."
    choco install postgresql16 --params '/Password:postgres' -y
    
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    
    # Start service
    Start-Service postgresql-x64-16 -ErrorAction SilentlyContinue
    
    Write-Success "PostgreSQL installed and started"
}

# Setup database
function Setup-Database {
    Write-Info "Setting up database..."
    
    $dbName = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "diy_chatgpt" }
    $dbUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "postgres" }
    $dbPass = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "postgres" }
    
    $env:PGPASSWORD = $dbPass
    
    # Check if database exists
    $dbExists = & psql -U $dbUser -h localhost -tc "SELECT 1 FROM pg_database WHERE datname = '$dbName'" 2>$null
    
    if (-not $dbExists -or $dbExists.Trim() -ne "1") {
        & psql -U $dbUser -h localhost -c "CREATE DATABASE $dbName" 2>$null
    }
    
    Write-Success "Database '$dbName' ready"
}

# Install dependencies
function Install-Dependencies {
    Write-Info "Installing Node.js dependencies..."
    npm ci
    Write-Success "Dependencies installed"
}

# Setup environment
function Setup-Environment {
    if (-not (Test-Path ".env")) {
        Write-Info "Creating .env file from template..."
        Copy-Item ".env.example" ".env"
        Write-Warn "Please edit .env and add your OPENAI_API_KEY"
    } else {
        Write-Success ".env file already exists"
    }
    
    # Create data directory
    New-Item -ItemType Directory -Path "data\sessions" -Force | Out-Null
    Write-Success "Data directory created"
}

# Create Windows Service using NSSM
function Install-WindowsService {
    if (-not $InstallService) { return }
    
    Write-Info "Installing Windows Service..."
    
    # Install NSSM if not present
    if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
        choco install nssm -y
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    }
    
    $scriptDir = Split-Path -Parent $PSScriptRoot
    $nodePath = (Get-Command node).Source
    
    # Remove existing service if present
    nssm stop diy-chatgpt 2>$null
    nssm remove diy-chatgpt confirm 2>$null
    
    # Install new service
    nssm install diy-chatgpt $nodePath "$scriptDir\backend\server.js"
    nssm set diy-chatgpt AppDirectory $scriptDir
    nssm set diy-chatgpt AppEnvironmentExtra NODE_ENV=production
    nssm set diy-chatgpt DisplayName "DIY ChatGPT"
    nssm set diy-chatgpt Description "DIY ChatGPT Server"
    nssm set diy-chatgpt Start SERVICE_AUTO_START
    
    # Start the service
    nssm start diy-chatgpt
    
    Write-Success "Windows Service installed and started"
    Write-Info "Manage with: nssm start/stop/restart diy-chatgpt"
}

# Main
function Main {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "   DIY ChatGPT - Windows Setup         " -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Change to project directory
    $scriptDir = Split-Path -Parent $PSScriptRoot
    Set-Location $scriptDir
    
    if (-not (Test-Admin)) {
        Write-Warn "Running without administrator privileges."
        Write-Warn "Some features may not work. Run as Administrator for full setup."
    }
    
    Install-Chocolatey
    Install-NodeJS
    Install-PostgreSQL
    Setup-Database
    Install-Dependencies
    Setup-Environment
    Install-WindowsService
    
    Write-Host ""
    Write-Success "Setup complete!"
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Edit .env and add your OPENAI_API_KEY"
    Write-Host "  2. Run: node backend\server.js"
    Write-Host "  3. Open: http://localhost:3001"
    Write-Host ""
}

Main
