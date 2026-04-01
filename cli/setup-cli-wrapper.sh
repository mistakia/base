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

# Resolve Bun binary
BUN_BIN="\${BUN_INSTALL:-\$HOME/.bun}/bin/bun"
if [ ! -x "\$BUN_BIN" ]; then
  BUN_BIN="bun"
fi

exec "\$BUN_BIN" "\$BASE_DIR/cli/base.mjs" "\$@"
WRAPPER

chmod +x "$WRAPPER_PATH"
echo "Installed base CLI wrapper to $WRAPPER_PATH"
