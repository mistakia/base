#!/bin/bash

# Setup PM2 log rotation
# Idempotent - safe to run multiple times on any machine
# Works on macOS and Linux

set -e

# Configuration
MAX_SIZE="${PM2_LOGROTATE_MAX_SIZE:-50M}"
RETAIN="${PM2_LOGROTATE_RETAIN:-7}"
COMPRESS="${PM2_LOGROTATE_COMPRESS:-true}"
ROTATE_INTERVAL="${PM2_LOGROTATE_INTERVAL:-0 0 * * *}"

echo "Setting up PM2 log rotation..."
echo "  Max size: $MAX_SIZE"
echo "  Retain: $RETAIN files"
echo "  Compress: $COMPRESS"
echo "  Interval: $ROTATE_INTERVAL"
echo ""

# Check if PM2 is available
if ! command -v pm2 &> /dev/null; then
    echo "Error: pm2 is not installed or not in PATH"
    exit 1
fi

# Check if pm2-logrotate is already installed
if pm2 describe pm2-logrotate &> /dev/null; then
    echo "pm2-logrotate is already installed, updating configuration..."
else
    echo "Installing pm2-logrotate..."
    pm2 install pm2-logrotate
fi

# Configure pm2-logrotate (idempotent - just sets values)
echo "Configuring pm2-logrotate..."
pm2 set pm2-logrotate:max_size "$MAX_SIZE"
pm2 set pm2-logrotate:retain "$RETAIN"
pm2 set pm2-logrotate:compress "$COMPRESS"
pm2 set pm2-logrotate:rotateInterval "$ROTATE_INTERVAL"
pm2 set pm2-logrotate:workerInterval 30
pm2 set pm2-logrotate:rotateModule true

# Save PM2 configuration
echo "Saving PM2 configuration..."
pm2 save

# Show current configuration
echo ""
echo "Current pm2-logrotate configuration:"
pm2 conf pm2-logrotate

echo ""
echo "PM2 log rotation setup complete."
echo "Logs will be rotated when they exceed $MAX_SIZE or at interval $ROTATE_INTERVAL"
