#!/bin/sh

# Setup script for the base CLI wrapper at ~/bin/base
# Idempotent - safe to run multiple times

set -e

WRAPPER_PATH="${HOME}/bin/base"

mkdir -p "${HOME}/bin"

cat > "$WRAPPER_PATH" <<WRAPPER
#!/bin/sh

# Resolve base directory
BASE_DIR="\${USER_BASE_DIRECTORY:-\$HOME/user-base}/repository/active/base"
NVM_DIR="\${NVM_DIR:-\$HOME/.nvm}"

# Resolve Node.js binary from .nvmrc (matching pm2.config.js strategy)
NODE_BIN="node"
NVMRC_FILE="\$BASE_DIR/.nvmrc"
if [ -f "\$NVMRC_FILE" ]; then
  NODE_VERSION=\$(cat "\$NVMRC_FILE" | tr -d '[:space:]')
  NVM_NODE="\$NVM_DIR/versions/node/\$NODE_VERSION/bin/node"
  if [ -x "\$NVM_NODE" ]; then
    NODE_BIN="\$NVM_NODE"
  fi
fi

exec "\$NODE_BIN" "\$BASE_DIR/cli/base.mjs" "\$@"
WRAPPER

chmod +x "$WRAPPER_PATH"
echo "Installed base CLI wrapper to $WRAPPER_PATH"
