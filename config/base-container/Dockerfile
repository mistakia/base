FROM node:22-slim

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
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/validate-user-command.sh /usr/local/bin/validate-file-access.sh /usr/local/bin/user-active-session-hook.sh /usr/local/bin/user-sync-session-hook.sh

# Install gosu for dropping privileges in entrypoint
RUN curl -fsSL "https://github.com/tianon/gosu/releases/download/1.17/gosu-$(dpkg --print-architecture)" -o /usr/local/bin/gosu \
    && chmod +x /usr/local/bin/gosu

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["tail", "-f", "/dev/null"]
