FROM node:22-slim

# Build args for UID/GID alignment with the host user.
# The upstream node:22-slim image ships the "node" user at UID/GID 1000.
# Accept overrides so the container user matches the invoking host user,
# avoiding ownership mismatches on bind-mounted volumes.
ARG HOST_UID=1000
ARG HOST_GID=1000

# Remap the "node" user/group to HOST_UID/HOST_GID.
# Strategy:
#   1. If HOST_GID != 1000, rename group 1000 -> node-old to free the name,
#      then create group "node" at HOST_GID (or adopt it if it exists).
#   2. If HOST_UID != 1000, rename user 1000 -> node-old to free the name,
#      then create user "node" at HOST_UID in group "node".
#   3. Re-chown /home/node to the new IDs.
# When HOST_UID == 1000 this entire block is a no-op (no-op usermod/groupmod).
RUN set -eux; \
    CURRENT_GID=$(id -g node); \
    CURRENT_UID=$(id -u node); \
    TARGET_GID=${HOST_GID}; \
    TARGET_UID=${HOST_UID}; \
    if [ "$TARGET_GID" != "$CURRENT_GID" ]; then \
        groupmod -n node-old node; \
        if getent group "$TARGET_GID" > /dev/null 2>&1; then \
            EXISTING_GROUP=$(getent group "$TARGET_GID" | cut -d: -f1); \
            groupmod -n node "$EXISTING_GROUP"; \
        else \
            groupadd -g "$TARGET_GID" node; \
        fi; \
    fi; \
    if [ "$TARGET_UID" != "$CURRENT_UID" ]; then \
        usermod -l node-old node; \
        if getent passwd "$TARGET_UID" > /dev/null 2>&1; then \
            EXISTING_USER=$(getent passwd "$TARGET_UID" | cut -d: -f1); \
            userdel "$EXISTING_USER"; \
        fi; \
        useradd -u "$TARGET_UID" -g node -d /home/node -s /bin/bash -M node; \
    else \
        if [ "$TARGET_GID" != "$CURRENT_GID" ]; then \
            usermod -g node node; \
        fi; \
    fi; \
    chown -R node:node /home/node

# Install system packages and build tools
# python3, make, g++ needed by node-gyp for native modules (e.g. sharp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ripgrep \
    git \
    jq \
    curl \
    ca-certificates \
    openssh-client \
    rsync \
    socat \
    python3 \
    make \
    g++ \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install CloakBrowser native dependencies for the container's Python version.
# The mounted venv (Python 3.12) has pure-Python packages that work cross-version,
# but greenlet has C extensions tied to the build Python. Install it natively here
# so the container Python (3.11) can load it alongside the mounted venv's PYTHONPATH.
RUN apt-get update && apt-get install -y --no-install-recommends python3-pip \
    && python3 -m pip install --break-system-packages greenlet==3.3.2 \
    && apt-get purge -y python3-pip && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Install Chromium headless dependencies for CloakBrowser
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libexpat1 \
    libxcb1 \
    && rm -rf /var/lib/apt/lists/*

# Install Bun (required by base CLI -- all shebangs use #!/usr/bin/env bun)
# Copy binaries to /usr/local/bin instead of symlinking from /root/.bun/
# because /root/ is mode 700 and inaccessible to the node user via gosu
RUN curl -fsSL https://bun.sh/install | bash -s -- bun-v1.2.18 \
    && cp /root/.bun/bin/bun /usr/local/bin/bun \
    && cp /root/.bun/bin/bun /usr/local/bin/bunx

# Install GitHub CLI (binary from GitHub releases, avoids apt repo SSL issues)
RUN GH_ARCH=$(dpkg --print-architecture | sed 's/amd64/amd64/;s/arm64/arm64/') \
    && GH_VERSION=$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/') \
    && curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${GH_ARCH}.tar.gz" \
    | tar -xz --strip-components=1 -C /usr/local

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Install OpenCode CLI
RUN curl -fsSL https://opencode.ai/install | bash \
    && cp $(find / -name opencode -type f -executable 2>/dev/null | head -1) /usr/local/bin/opencode

ARG CONTAINER_WORKDIR=/home/node/user-base

# Create directory structure for workdir
RUN mkdir -p ${CONTAINER_WORKDIR} \
    && chown -R node:node ${CONTAINER_WORKDIR}

# Environment variables
ENV DISABLE_AUTOUPDATER=1
ENV CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

WORKDIR ${CONTAINER_WORKDIR}

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY validate-user-command.sh validate-file-access.sh user-active-session-hook.sh user-sync-session-hook.sh /usr/local/bin/
COPY --chmod=0755 claude-oauth-helper.sh /usr/local/bin/claude-oauth-helper
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/validate-user-command.sh /usr/local/bin/validate-file-access.sh /usr/local/bin/user-active-session-hook.sh /usr/local/bin/user-sync-session-hook.sh

# Install gosu for dropping privileges in entrypoint
RUN curl -fsSL "https://github.com/tianon/gosu/releases/download/1.17/gosu-$(dpkg --print-architecture)" -o /usr/local/bin/gosu \
    && chmod +x /usr/local/bin/gosu

# No USER directive: the entrypoint must run as root to write ssh-wrapper into
# /usr/local/bin/, chown credentials, and manage the SSH agent socket. It drops
# to node via `exec gosu node` at the end. Adding `USER node` causes the
# entrypoint to start as node and breaks those root-phase steps. The
# `docker exec` foot-gun (exec-as-root by default) is instead mitigated by
# explicit `-u node` on every call site plus a pre-commit hook guard.

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["tail", "-f", "/dev/null"]
