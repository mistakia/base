#
# Base CLI Installer for Windows
#
# One-liner install (PowerShell):
#   irm https://base.tint.space/install.ps1 | iex
#
# What it does:
#   1. Downloads compiled binary from base.tint.space/releases/latest/
#   2. Places binary at ~/.base/bin/base.exe
#   3. Adds ~/.base/bin to user PATH
#   4. Verifies checksum integrity
#   5. Runs `base init` interactively
#
# Environment variables:
#   BASE_INSTALL_DIR  Override install directory (default: ~/.base)
#   BASE_VERSION      Override version (default: latest)
#   SKIP_INIT         Set to 1 to skip running `base init`

$ErrorActionPreference = "Stop"

$BaseUrl = if ($env:BASE_URL) { $env:BASE_URL } else { "https://base.tint.space" }
$InstallDir = if ($env:BASE_INSTALL_DIR) { $env:BASE_INSTALL_DIR } else { Join-Path $HOME ".base" }
$BinDir = Join-Path $InstallDir "bin"
$Version = if ($env:BASE_VERSION) { $env:BASE_VERSION } else { "latest" }

function Write-Info { param($Message) Write-Host $Message -ForegroundColor White }
function Write-Success { param($Message) Write-Host $Message -ForegroundColor Green }
function Write-Err { param($Message) Write-Host "error: $Message" -ForegroundColor Red }
function Write-Dim { param($Message) Write-Host $Message -ForegroundColor DarkGray }

Write-Info "Installing Base CLI..."
Write-Host ""

# Platform detection (Windows x64 only for now)
$Arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
if ($Arch -ne "X64") {
    Write-Err "Unsupported architecture: $Arch (only x64 is supported)"
    exit 1
}

$BinaryName = "base-windows-x64.exe"
$Platform = "windows-x64"
Write-Dim "Platform: $Platform"

# Create directories
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "system") | Out-Null

# Download binary
$DownloadUrl = "$BaseUrl/releases/$Version/$BinaryName"
$BinaryPath = Join-Path $BinDir "base.exe"
$TmpFile = Join-Path $env:TEMP "base-download-$([guid]::NewGuid()).exe"

Write-Info "Downloading base binary..."
Write-Dim "  $DownloadUrl"

try {
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $TmpFile -UseBasicParsing
} catch {
    Write-Err "Failed to download binary from $DownloadUrl"
    Write-Err "Check your internet connection and try again."
    exit 1
}

# Verify checksum
$ChecksumsUrl = "$BaseUrl/releases/$Version/checksums.sha256"
try {
    $ChecksumsContent = (Invoke-WebRequest -Uri $ChecksumsUrl -UseBasicParsing).Content
    $ExpectedLine = ($ChecksumsContent -split "`n") | Where-Object { $_ -match $BinaryName }
    if ($ExpectedLine) {
        $ExpectedHash = ($ExpectedLine -split "\s+")[0]
        $ActualHash = (Get-FileHash -Path $TmpFile -Algorithm SHA256).Hash.ToLower()
        if ($ActualHash -ne $ExpectedHash) {
            Remove-Item $TmpFile -Force
            Write-Err "Checksum verification failed!"
            Write-Err "  Expected: $ExpectedHash"
            Write-Err "  Actual:   $ActualHash"
            exit 1
        }
        Write-Dim "Checksum verified"
    }
} catch {
    Write-Dim "Checksums not available (skipping verification)"
}

# Install binary
Move-Item -Force $TmpFile $BinaryPath
Write-Success "Binary installed to $BinaryPath"

# Download version.json
$VersionUrl = "$BaseUrl/releases/$Version/version.json"
try {
    Invoke-WebRequest -Uri $VersionUrl -OutFile (Join-Path $InstallDir "version.json") -UseBasicParsing
} catch {
    # Non-fatal
}

# Add to user PATH if not already there
$CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($CurrentPath -notlike "*$BinDir*") {
    $NewPath = "$BinDir;$CurrentPath"
    [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
    $env:Path = "$BinDir;$env:Path"
    Write-Success "Added $BinDir to user PATH"
} else {
    Write-Dim "PATH already configured"
}

Write-Host ""
Write-Success "Base CLI installed successfully!"
Write-Host ""

# Show version
try {
    $VersionOutput = & $BinaryPath --version 2>&1
    Write-Dim "  Version: $VersionOutput"
} catch {
    Write-Dim "  Version: unknown"
}
Write-Dim "  Binary:  $BinaryPath"
Write-Host ""

# Run init unless skipped
if ($env:SKIP_INIT -ne "1") {
    Write-Info "Running initial setup..."
    Write-Host ""
    & $BinaryPath init
} else {
    Write-Dim "Skipping initial setup (SKIP_INIT=1)"
    Write-Host ""
    Write-Info "Run 'base init' to set up your user-base directory."
}
