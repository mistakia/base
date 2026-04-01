#!/bin/bash
set -e

# Require USER_BASE_DIRECTORY to be set (from docker-compose environment)
if [ -z "$USER_BASE_DIRECTORY" ]; then
    echo "Error: USER_BASE_DIRECTORY is not set" >&2
    exit 1
fi

BASE_SUBMODULE="$USER_BASE_DIRECTORY/repository/active/base"
CONTAINER_MODE="${CONTAINER_MODE:-admin}"

# Helper to run commands as node user if we're root
run_as_node() {
    if [ "$(id -u)" = "0" ]; then
        gosu node "$@"
    else
        "$@"
    fi
}

# =============================================================================
# User container mode (CONTAINER_MODE=user)
# =============================================================================
if [ "$CONTAINER_MODE" = "user" ]; then
    echo "Starting in user container mode..."

    # Set environment variables for user containers
    export DISABLE_AUTOUPDATER=1
    export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

    # Configure generic git identity
    run_as_node git config --global user.name "base-user"
    run_as_node git config --global user.email "noreply@base.local"
    run_as_node git config --global protocol.file.allow always

    # Verify claude-home directory structure exists (bootstrapper creates it)
    if [ ! -d "/home/node/.claude" ]; then
        echo "WARNING: Claude home directory not found -- bootstrapper may not have run" >&2
        run_as_node mkdir -p /home/node/.claude/projects /home/node/.claude/cache /home/node/.claude/todos /home/node/.claude/plans
    fi

    # Initialize per-account Claude directories (for account rotation)
    for account_dir in /home/node/.claude-*/; do
        [ -d "$account_dir" ] || continue
        run_as_node mkdir -p "$account_dir/projects" "$account_dir/cache" "$account_dir/todos" "$account_dir/plans"
    done

    # Verify credentials exist
    if [ ! -f "/home/node/.claude/.credentials.json" ]; then
        echo "ERROR: .credentials.json not found in claude-home -- user container cannot authenticate" >&2
    fi

    # Verify settings.json exists
    if [ ! -f "/home/node/.claude/settings.json" ]; then
        echo "WARNING: settings.json not found in claude-home -- bootstrapper may not have run" >&2
    fi

    # Add base CLI to PATH if node_modules are available (shared volume)
    if [ -d "$BASE_SUBMODULE/node_modules/.bin" ]; then
        export PATH="$BASE_SUBMODULE/node_modules/.bin:$PATH"
        echo "export PATH=\"$BASE_SUBMODULE/node_modules/.bin:\$PATH\"" > /etc/profile.d/base-cli.sh
        ln -sf "$BASE_SUBMODULE/node_modules/.bin/base" /usr/local/bin/base 2>/dev/null || true
    fi

    # Configure ripgrep if config available
    RIPGREPRC="$USER_BASE_DIRECTORY/config/ripgreprc"
    if [ -f "$RIPGREPRC" ]; then
        export RIPGREP_CONFIG_PATH="$RIPGREPRC"
        echo "export RIPGREP_CONFIG_PATH=\"$RIPGREPRC\"" >> /etc/profile.d/base-cli.sh
    fi

    # Write readiness marker
    touch /tmp/entrypoint-ready

    echo "---"
    echo "User Container ready"
    echo "  Working directory: $(pwd)"
    echo "  Node: $(node --version)"
    echo "  Bun: $(bun --version 2>/dev/null || echo 'not available')"
    echo "  Claude Code: $(claude --version 2>/dev/null || echo 'not available')"
    echo "  Base CLI: $(base --version 2>/dev/null || echo 'not available')"
    echo "---"

    # Drop privileges and execute
    if [ "$(id -u)" = "0" ]; then
        exec gosu node "$@"
    else
        exec "$@"
    fi
fi

# =============================================================================
# Admin container mode (CONTAINER_MODE=admin, default)
# =============================================================================

SSH_PROXY_SOCK="/var/run/ssh-agent-proxy.sock"
DOCKER_SSH_SOCK="/run/host-services/ssh-auth.sock"

# Setup SSH agent proxy if Docker socket exists (macOS Docker for Mac)
# This must run as root to access the Docker-owned socket
if [ -S "$DOCKER_SSH_SOCK" ] && [ "$(id -u)" = "0" ]; then
    rm -f "$SSH_PROXY_SOCK"
    # Start socat proxy in background, then fix permissions
    socat UNIX-LISTEN:"$SSH_PROXY_SOCK",fork UNIX-CONNECT:"$DOCKER_SSH_SOCK" &
    SOCAT_PID=$!
    # Wait for socket to be created
    for i in 1 2 3 4 5; do
        [ -S "$SSH_PROXY_SOCK" ] && break
        sleep 0.1
    done
    if [ -S "$SSH_PROXY_SOCK" ]; then
        chown node:node "$SSH_PROXY_SOCK"
        chmod 0600 "$SSH_PROXY_SOCK"
    else
        echo "WARNING: SSH proxy socket not created" >&2
        kill $SOCAT_PID 2>/dev/null || true
    fi
    export SSH_AUTH_SOCK="$SSH_PROXY_SOCK"
    echo "SSH agent proxy configured at $SSH_PROXY_SOCK"
fi

# Setup SSH config for node user
# Mounted .ssh directory is read-only with root ownership, so SSH ignores the config.
# Copy essential files to a node-owned location with proper permissions.
# Use SSH_CONFIG environment variable to point SSH to the node-owned config.
MOUNTED_SSH_DIR="/home/node/.ssh"
NODE_SSH_DIR="/home/node/.ssh-local"
if [ -d "$MOUNTED_SSH_DIR" ] && [ -f "$MOUNTED_SSH_DIR/config" ]; then
    echo "Setting up SSH config for node user..."
    run_as_node mkdir -p "$NODE_SSH_DIR"
    run_as_node chmod 700 "$NODE_SSH_DIR"
    # Copy config and known_hosts with proper ownership
    for file in config known_hosts; do
        if [ -f "$MOUNTED_SSH_DIR/$file" ]; then
            cp "$MOUNTED_SSH_DIR/$file" "$NODE_SSH_DIR/$file"
            chown node:node "$NODE_SSH_DIR/$file"
            chmod 600 "$NODE_SSH_DIR/$file"
        fi
    done
    # Create wrapper script that uses node-owned config and known_hosts
    cat > /usr/local/bin/ssh-wrapper << 'SSHEOF'
#!/bin/bash
exec /usr/bin/ssh -F /home/node/.ssh-local/config -o UserKnownHostsFile=/home/node/.ssh-local/known_hosts "$@"
SSHEOF
    chmod +x /usr/local/bin/ssh-wrapper
    # Override ssh command for all users
    ln -sf /usr/local/bin/ssh-wrapper /usr/local/bin/ssh
    echo "SSH config copied to node-owned directory (/home/node/.ssh-local)"
fi

# Create Claude home directory structure if missing (as node user)
run_as_node mkdir -p /home/node/.claude/projects /home/node/.claude/cache /home/node/.claude/todos /home/node/.claude/plans

# Initialize per-account Claude directories (for account rotation)
# Each mounted account directory needs the same subdirectory structure
for account_dir in /home/node/.claude-*/; do
    [ -d "$account_dir" ] || continue
    run_as_node mkdir -p "$account_dir/projects" "$account_dir/cache" "$account_dir/todos" "$account_dir/plans"
    echo "Initialized account directory: $account_dir"
done

# Initialize settings.json from template if not exists
SETTINGS_TEMPLATE="$USER_BASE_DIRECTORY/config/base-container/settings.container.json"
SETTINGS_FILE="/home/node/.claude/settings.json"
if [ ! -f "$SETTINGS_FILE" ] && [ -f "$SETTINGS_TEMPLATE" ]; then
    echo "Initializing container settings.json from template..."
    cp "$SETTINGS_TEMPLATE" "$SETTINGS_FILE"
    chown node:node "$SETTINGS_FILE"
fi

# Setup GitHub CLI config directory (persistent volume mount)
GH_CONFIG_DIR="/home/node/.config/gh"
if [ -d "$GH_CONFIG_DIR" ]; then
    # Ensure ownership on mounted volume
    chown -R node:node "$GH_CONFIG_DIR" 2>/dev/null || true
    # If GITHUB_TOKEN is set and gh is not yet authenticated, bootstrap auth
    if [ -n "${GITHUB_TOKEN:-}" ] && [ ! -f "$GH_CONFIG_DIR/hosts.yml" ]; then
        echo "Bootstrapping gh CLI authentication from GITHUB_TOKEN..."
        run_as_node mkdir -p "$GH_CONFIG_DIR"
        cat > "$GH_CONFIG_DIR/hosts.yml" << GHEOF
github.com:
    oauth_token: ${GITHUB_TOKEN}
    user: ${GIT_AUTHOR_NAME:-base-user}
    git_protocol: ssh
GHEOF
        chown node:node "$GH_CONFIG_DIR/hosts.yml"
        chmod 600 "$GH_CONFIG_DIR/hosts.yml"
    fi
fi

# Configure git identity from environment variables (as node user)
if [ -n "$GIT_AUTHOR_NAME" ]; then
    run_as_node git config --global user.name "$GIT_AUTHOR_NAME"
fi
if [ -n "$GIT_AUTHOR_EMAIL" ]; then
    run_as_node git config --global user.email "$GIT_AUTHOR_EMAIL"
fi

# Allow local file protocol for submodule operations (as node user)
run_as_node git config --global protocol.file.allow always

# Install base submodule dependencies if missing or outdated (needed for hook scripts)
# A named volume overlays node_modules so the container gets its own Linux-native binaries
# without corrupting the host's node_modules (needed on both macOS and storage)
if [ -d "$BASE_SUBMODULE" ]; then
    # Ensure node user owns the node_modules directory (Docker creates named volumes as root)
    if [ -d "$BASE_SUBMODULE/node_modules" ] && [ "$(stat -c '%u' "$BASE_SUBMODULE/node_modules" 2>/dev/null)" != "$(id -u node)" ]; then
        chown node:node "$BASE_SUBMODULE/node_modules"
    fi
    LOCKFILE_HASH=""
    INSTALLED_HASH=""
    if [ -f "$BASE_SUBMODULE/bun.lock" ]; then
        LOCKFILE_HASH=$(md5sum "$BASE_SUBMODULE/bun.lock" 2>/dev/null | cut -d' ' -f1)
    fi
    if [ -f "$BASE_SUBMODULE/node_modules/.lockfile-hash" ]; then
        INSTALLED_HASH=$(cat "$BASE_SUBMODULE/node_modules/.lockfile-hash")
    fi

    if [ ! -d "$BASE_SUBMODULE/node_modules/.bin" ] || [ "$LOCKFILE_HASH" != "$INSTALLED_HASH" ]; then
        echo "Installing base submodule dependencies..."
        if run_as_node bash -c "cd '$BASE_SUBMODULE' && bun install --frozen-lockfile"; then
            echo "Base submodule dependencies installed."
        else
            echo "WARNING: bun install exited with errors (optional native modules may have failed to build)." >&2
        fi
        # Record which bun.lock was used for this install
        if [ -d "$BASE_SUBMODULE/node_modules/.bin" ] && [ -n "$LOCKFILE_HASH" ]; then
            run_as_node bash -c "echo '$LOCKFILE_HASH' > '$BASE_SUBMODULE/node_modules/.lockfile-hash'"
        fi
    fi
fi

# Add base CLI to PATH (defined as bin in base package.json)
# Write to .bashrc so it persists for all shells (docker exec, claude code bash, etc.)
if [ -d "$BASE_SUBMODULE/node_modules/.bin" ]; then
    export PATH="$BASE_SUBMODULE/node_modules/.bin:$PATH"
    # Persist PATH for new shells
    BASHRC_PATH="export PATH=\"$BASE_SUBMODULE/node_modules/.bin:\$PATH\""
    if ! grep -q "base/node_modules/.bin" /home/node/.bashrc 2>/dev/null; then
        run_as_node bash -c "echo '$BASHRC_PATH' >> /home/node/.bashrc"
    fi
    # Also add to /etc/profile.d for non-interactive shells
    echo "$BASHRC_PATH" > /etc/profile.d/base-cli.sh
    # Symlink base CLI into /usr/local/bin so it is available in non-login,
    # non-interactive shells (docker exec, Claude Code Bash tool, etc.)
    ln -sf "$BASE_SUBMODULE/node_modules/.bin/base" /usr/local/bin/base
fi

# Persist MCP environment variables for Claude Code subprocesses
MCP_ENV_FILE="/etc/profile.d/mcp-env.sh"
{
    for var in MCP_LEAGUE_DATABASE_URL MCP_PARCELS_DATABASE_URL MCP_FINANCE_DATABASE_URL \
               MCP_EPSTEIN_DATABASE_URL MCP_GITHUB_GRAPHQL_HEADERS MCP_NOTION_HEADERS; do
        [ -n "${!var:-}" ] && echo "export $var='${!var}'"
    done
} > "$MCP_ENV_FILE"

# Configure ripgrep and grep exclusions for large directories
# Uses shared config from user-base (mounted in container at same path as host)
RIPGREPRC="$USER_BASE_DIRECTORY/config/ripgreprc"
if [ -f "$RIPGREPRC" ]; then
    export RIPGREP_CONFIG_PATH="$RIPGREPRC"
    if ! grep -q "RIPGREP_CONFIG_PATH" /home/node/.bashrc 2>/dev/null; then
        run_as_node bash -c "echo 'export RIPGREP_CONFIG_PATH=\"$RIPGREPRC\"' >> /home/node/.bashrc"
        run_as_node bash -c "cat >> /home/node/.bashrc << 'GREPEOF'
function grep {
    command grep --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=transparency-act --exclude-dir=embedded-database-index --exclude-dir=archive \"\$@\"
}
GREPEOF"
    fi
    echo "export RIPGREP_CONFIG_PATH=\"$RIPGREPRC\"" >> /etc/profile.d/base-cli.sh
fi

# Generate container context file for Claude Code system prompt
MACHINE_NAME="${BASE_CONTAINER_MACHINE:-unknown}"
CONTEXT_FILE="/tmp/container-context.txt"
rm -f "$CONTEXT_FILE"
cat > "$CONTEXT_FILE" << EOF
## Container Environment

This session is running inside a Docker container on the **$MACHINE_NAME** machine.

### Container Context
- **Host Machine**: $MACHINE_NAME (storage server or macbook)
- **Container**: base-container (Node.js 22, Bun, Debian)
- **Working Directory**: $USER_BASE_DIRECTORY
- **User**: node (UID 1000)

### SSH Configuration
SSH host aliases from the host machine's ~/.ssh/config are available. Use the alias names directly (e.g., \`ssh storage\`, \`ssh league\`).

### Machine-specific Notes
$(if [ "$MACHINE_NAME" = "storage" ]; then
    echo "- Running on the storage server (${STORAGE_IP:-local network})"
    echo "- network_mode: host (direct network access)"
    echo "- Local PostgreSQL, Redis, and NFS services available"
    echo "- Git bare repos for submodules at ${GIT_BARE_REPO_DIR:-<not configured>}"
elif [ "$MACHINE_NAME" = "macbook" ]; then
    echo "- Running on the MacBook (development machine)"
    echo "- Host services accessible via host.docker.internal"
    echo "- SSH agent forwarded from macOS"
    echo "- Named volume for node_modules (Linux-native binaries)"
fi)
EOF
chown node:node "$CONTEXT_FILE"
chmod 644 "$CONTEXT_FILE"

# Create claude wrapper that includes container context
CLAUDE_WRAPPER="/usr/local/bin/claude-container"
cat > "$CLAUDE_WRAPPER" << 'WRAPPER_EOF'
#!/bin/bash
exec /usr/local/bin/claude --append-system-prompt-file /tmp/container-context.txt "$@"
WRAPPER_EOF
chmod +x "$CLAUDE_WRAPPER"

# Display startup info
echo "---"
echo "Base Container ready (machine: $MACHINE_NAME)"
echo "  Working directory: $(pwd)"
echo "  Node: $(node --version)"
echo "  Bun: $(bun --version 2>/dev/null || echo 'not available')"
echo "  Claude Code: $(claude --version 2>/dev/null || echo 'not available')"
echo "  Base CLI: $(base --version 2>/dev/null || echo 'not available')"
echo "  Git user: $(run_as_node git config user.name 2>/dev/null || echo 'not set')"
echo "  SSH agent: $(run_as_node ssh-add -l 2>/dev/null | head -1 || echo 'not available')"
echo "  SSH hosts: $(grep '^Host ' /home/node/.ssh/config 2>/dev/null | wc -l | tr -d ' ') configured"
echo "  Context file: $CONTEXT_FILE"
echo "---"

# Execute passed command as node user (drop privileges if running as root)
if [ "$(id -u)" = "0" ]; then
    exec gosu node "$@"
else
    exec "$@"
fi
