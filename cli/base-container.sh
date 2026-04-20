#!/bin/bash
set -e

# Base Service and Container Management Script
# Services (base-api, metadata-queue-processor, cli-queue-worker) run via PM2
# Interactive container (base-container) runs via Docker

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
USER_BASE_DIR="${USER_BASE_DIRECTORY:-$(cd "$BASE_DIR/../.." && pwd)}"
BASE_COMPOSE_DIR="$BASE_DIR/config/base-container"
USER_COMPOSE_DIR="$USER_BASE_DIR/config/base-container"
PM2_CONFIG="$BASE_DIR/pm2.config.mjs"

# Auto-detect machine
detect_machine() {
    if [ "$(uname)" = "Darwin" ]; then
        echo "macbook"
    else
        echo "storage"
    fi
}

MACHINE=$(detect_machine)

compose_cmd() {
    CONFIG_ENCRYPTION_KEY="${CONFIG_ENCRYPTION_KEY}" docker compose \
        -f "$BASE_COMPOSE_DIR/docker-compose.yml" \
        -f "$USER_COMPOSE_DIR/docker-compose.${MACHINE}.yml" \
        "$@"
}

# PM2 service names
PM2_SERVICES="base-api metadata-queue-processor cli-queue-worker"

is_pm2_service() {
    case "$1" in
        base-api|metadata-queue-processor|cli-queue-worker) return 0 ;;
        *) return 1 ;;
    esac
}

CONTAINER_NAME="base-container"
WAIT_TIMEOUT=300  # 5 minutes
WAIT_POLL_INTERVAL=10  # seconds

# Check for active Claude CLI sessions inside the container
# Returns 0 if sessions found, 1 if no sessions
check_container_sessions() {
    local sessions
    sessions=$(docker top "$CONTAINER_NAME" -o pid,args 2>/dev/null | grep -v "^PID" | grep "claude" || true)

    if [ -z "$sessions" ]; then
        return 1
    fi

    local count
    count=$(echo "$sessions" | wc -l | tr -d ' ')
    echo "Active Claude CLI sessions ($count):"
    echo "$sessions" | while IFS= read -r line; do
        echo "  $line"
    done
    return 0
}

# Safe container stop with session detection
# Usage: safe_container_stop [--force] [--wait]
safe_container_stop() {
    local force=false
    local wait=false

    while [ $# -gt 0 ]; do
        case "$1" in
            --force) force=true ;;
            --wait) wait=true ;;
            *) echo "Unknown flag: $1"; exit 1 ;;
        esac
        shift
    done

    if check_container_sessions; then
        if [ "$force" = true ]; then
            echo ""
            echo "WARNING: Force stopping container despite active sessions"
            compose_cmd down
        elif [ "$wait" = true ]; then
            echo ""
            echo "Waiting for sessions to complete (timeout: ${WAIT_TIMEOUT}s)..."
            local elapsed=0
            while [ $elapsed -lt $WAIT_TIMEOUT ]; do
                sleep $WAIT_POLL_INTERVAL
                elapsed=$((elapsed + WAIT_POLL_INTERVAL))
                if ! check_container_sessions; then
                    echo "All sessions completed after ${elapsed}s"
                    compose_cmd down
                    return 0
                fi
                echo "  Still waiting... (${elapsed}s / ${WAIT_TIMEOUT}s)"
            done
            echo "ERROR: Timeout exceeded (${WAIT_TIMEOUT}s). Sessions still active."
            echo "Use --force to stop anyway."
            exit 1
        else
            echo ""
            echo "ERROR: Cannot stop container -- active sessions would be killed."
            echo "Options:"
            echo "  --force  Stop anyway (kills active sessions)"
            echo "  --wait   Wait for sessions to finish, then stop"
            exit 1
        fi
    else
        echo "No active sessions detected."
        compose_cmd down
    fi
}

usage() {
    echo "Usage: $(basename "$0") <command> [service]"
    echo ""
    echo "Service Commands (PM2):"
    echo "  start [service]  Start all services or a specific service"
    echo "  stop [service]   Stop all services or a specific service"
    echo "  restart [svc]    Restart all services or a specific service"
    echo "  status           Show PM2 service status and Docker container status"
    echo "  logs [service]   Tail PM2 logs (all services or specific service)"
    echo "  setup            Initial setup: pm2 startup, start services, pm2 save"
    echo ""
    echo "Container Commands (Docker):"
    echo "  shell              Open a shell in the base-container"
    echo "  claude             Run Claude CLI in the base-container"
    echo "  opencode           Run OpenCode in the base-container"
    echo "  container-start    Start the interactive Docker container"
    echo "  container-stop     Stop the interactive Docker container"
    echo "    --force          Stop even if active Claude sessions are running"
    echo "    --wait           Wait for active sessions to finish, then stop"
    echo "  container-restart  Restart the interactive Docker container"
    echo "    --force          Stop even if active Claude sessions are running"
    echo "    --wait           Wait for active sessions to finish, then stop"
    echo "  build              Build the Docker container image"
    echo "  rebuild            Rebuild Docker image from scratch (no cache)"
    echo ""
    echo "PM2 services: $PM2_SERVICES"
    echo "Detected machine: $MACHINE"
}

case "${1:-}" in
    start)
        shift
        if [ $# -eq 0 ]; then
            echo "Starting all PM2 services ($MACHINE)..."
            pm2 start "$PM2_CONFIG"
        elif is_pm2_service "$1"; then
            echo "Starting $1..."
            pm2 start "$PM2_CONFIG" --only "$1"
        else
            echo "Unknown service: $1"
            echo "PM2 services: $PM2_SERVICES"
            exit 1
        fi
        ;;
    stop)
        shift
        if [ $# -eq 0 ]; then
            echo "Stopping all PM2 services..."
            pm2 stop all
        elif is_pm2_service "$1"; then
            echo "Stopping $1..."
            pm2 stop "$1"
        else
            echo "Unknown service: $1"
            exit 1
        fi
        ;;
    restart)
        shift
        if [ $# -eq 0 ]; then
            echo "Restarting all PM2 services ($MACHINE)..."
            pm2 restart all
        elif is_pm2_service "$1"; then
            echo "Restarting $1..."
            pm2 restart "$1"
        else
            echo "Unknown service: $1"
            exit 1
        fi
        ;;
    status)
        echo "=== PM2 Services ==="
        pm2 list
        echo ""
        echo "=== Docker Container ==="
        compose_cmd ps 2>/dev/null || echo "Docker container not running"
        ;;
    logs)
        shift
        if [ $# -eq 0 ]; then
            pm2 logs
        else
            pm2 logs "$1"
        fi
        ;;
    setup)
        echo "Setting up PM2 services ($MACHINE)..."
        mkdir -p "$(pm2 env 0 2>/dev/null | grep PM2_LOG_DIR | cut -d= -f2 || echo "$HOME/logs")"
        pm2 start "$PM2_CONFIG"
        pm2 save
        echo ""
        echo "Run 'pm2 startup' and follow instructions for boot persistence."
        ;;
    container-start)
        echo "Starting interactive container ($MACHINE)..."
        compose_cmd up -d base-container
        ;;
    container-stop)
        shift
        echo "Stopping interactive container..."
        safe_container_stop "$@"
        ;;
    container-restart)
        shift
        echo "Restarting interactive container ($MACHINE)..."
        safe_container_stop "$@"
        echo "Starting interactive container..."
        compose_cmd up -d base-container
        ;;
    shell)
        docker exec -u node -it base-container bash
        ;;
    build)
        echo "Building container image ($MACHINE)..."
        # Export host UID/GID so compose can pass them as build args to the
        # Dockerfile, ensuring the node user inside the container matches the
        # host user and avoids bind-mount ownership mismatches.
        export HOST_UID="${HOST_UID:-$(id -u)}"
        export HOST_GID="${HOST_GID:-$(id -g)}"
        echo "  HOST_UID=$HOST_UID HOST_GID=$HOST_GID"
        compose_cmd build
        ;;
    rebuild)
        echo "Rebuilding container image from scratch ($MACHINE)..."
        export HOST_UID="${HOST_UID:-$(id -u)}"
        export HOST_GID="${HOST_GID:-$(id -g)}"
        echo "  HOST_UID=$HOST_UID HOST_GID=$HOST_GID"
        compose_cmd build --no-cache
        ;;
    claude)
        shift
        docker exec -u node -it base-container claude-container "$@"
        ;;
    opencode)
        shift
        docker exec -u node -it base-container opencode "$@"
        ;;
    *)
        usage
        exit 1
        ;;
esac
