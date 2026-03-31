---
title: Configuration System
type: text
description: >-
  Reference for the two-tier config loading strategy covering base defaults, user-base overlay with
  encrypted values, machine registry, and environment variable injection
created_at: '2026-03-02T06:34:24.590Z'
entity_id: cdf927d9-909d-442f-a539-ae55c714b397
base_uri: sys:system/text/configuration-system.md
public_read: true
relations:
  - relates_to [[sys:system/text/system-design.md]]
  - relates_to [[sys:system/text/background-services.md]]
updated_at: '2026-03-02T06:34:24.590Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Configuration System

The configuration system uses a two-tier loading strategy to separate generic defaults from deployment-specific settings. Base defaults ship with the repository; user-base overlays provide secrets, machine identity, and environment-specific values.

## Loading Strategy

### Layer 1: Base Defaults

File: `config/config.json` in the base repository.

- Always loaded first
- Contains only non-secret default values with empty strings for credentials
- Designed for installability: anyone can clone the repo and provide their own user-base config

### Layer 2: User-Base Overlay

File: `{USER_BASE_DIRECTORY}/config/config.json`.

- Loaded via `@tsmx/secure-config` (supports `ENCRYPTED|...` values)
- Deep-merged over base defaults (nested objects merged recursively, scalars overwritten)
- Contains secrets, machine_registry, deployment-specific values, API tokens

### Test Mode

When `NODE_ENV=test`:

- Uses `config/config-test.json` directly via `secure_config`
- Bypasses user-base config entirely
- Sets `user_base_directory` to a random temporary path for isolation

### Loading Flow

```
if NODE_ENV === 'test':
config = secure_config(config-test.json)
else if user-base config exists:
config = deep_merge(base_defaults, secure_config(user_config))
else:
config = base_defaults (with warning)
```

## Encrypted Values

The `@tsmx/secure-config` library provides transparent encryption/decryption:

- Values prefixed with `ENCRYPTED|...` are automatically decrypted on load
- Raw values (no prefix) pass through unchanged
- Decryption key provided via `CONFIG_ENCRYPTION_KEY` environment variable
- Typically encrypted: `jwt.secret`, `github_access_token`, `github.webhook_secret`, API tokens

## Machine Registry

The `machine_registry` object in user-base config maps machine identifiers to their properties:

```json
{
  "machine_registry": {
    "laptop": {
      "hostname": "my-laptop.local",
      "platform": "darwin",
      "server_port": 8081,
      "ssl_key_path": "/path/to/key.pem",
      "ssl_cert_path": "/path/to/cert.pem",
      "transcription_args": "--port 8089 --model base.en"
    },
    "server": {
      "hostname": "my-server",
      "platform": "linux",
      "server_port": 8080
    }
  }
}
```

### Machine Identity Resolution

The `get_current_machine_id()` function determines which machine is running:

1. **Exact hostname match**: Compare `os.hostname()` against all registry entries
2. **Platform fallback**: If only one machine shares `os.platform()`, use it
3. **Unknown**: Return null if ambiguous or no match

Machine identity is used by the schedule processor for machine-specific schedule filtering and by PM2 for environment injection.

## Environment Variable Injection

`pm2.config.js` auto-detects the current machine and injects environment variables before services start:

### User-Base Directory Resolution

Priority order:

1. `process.env.USER_BASE_DIRECTORY`
2. `~/.pm2/pm2.env` file (for non-login SSH sessions)
3. Default: `~/user-base`

### SSL Configuration

If the machine registry entry has SSL paths:

```
SSL_ENABLED=true
SSL_KEY_PATH=/path/to/key.pem
SSL_CERT_PATH=/path/to/cert.pem
SERVER_PORT=8081
```

### Common Environment Variables

Set for all PM2 services:

| Variable                   | Source           | Purpose                                |
| -------------------------- | ---------------- | -------------------------------------- |
| `USER_BASE_DIRECTORY`      | Resolution chain | User data directory path               |
| `CONFIG_ENCRYPTION_KEY`    | process.env      | Decryption key for config values       |
| `CONTAINER_USER_BASE_PATH` | pm2.config.js    | User-base path inside Docker container |
| `GIT_SSH_COMMAND`          | Computed         | SSH command with user config file      |
| `DEBUG_COLORS`             | Hardcoded        | Disabled for log readability           |

## System Base Directory

The system base directory is automatically derived from the config module location:

```javascript
// config/index.mjs derives its own parent directory
const system_base_directory = dirname(dirname(fileURLToPath(import.meta.url)))
```

This ensures the base repo works correctly regardless of installation path. Can be overridden via `SYSTEM_BASE_DIRECTORY` environment variable.

## Config Access Patterns

### Application Code

```javascript
import config from '#config'

const redis_url = config.threads?.queue?.redis_url || 'redis://localhost:6379'
const jwt_secret = config.jwt.secret
```

### Base Directory Registry

```javascript
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'
const user_base = get_user_base_directory()
```

Directories from config are automatically registered on module load, enabling base_uri resolution without passing directory parameters.

### Environment Variable Overrides

Specific fields support runtime overrides:

- `BASE_PUBLIC_URL` sets `production_url` and `public_url`
- `BASE_PUBLIC_WSS` sets `production_wss`
- `SSL_ENABLED`, `SSL_KEY_PATH`, `SSL_CERT_PATH`, `SERVER_PORT` set SSL and port config

## Core vs Extension Boundary

The base repo must not contain user-specific values (paths, IPs, repo names, git identity). All customization lives in user-base:

| Layer      | Base Repo                       | User-Base                       |
| ---------- | ------------------------------- | ------------------------------- |
| Config     | `config/config.json` (defaults) | `config/config.json` (overlay)  |
| Workflows  | `system/workflow/` (core)       | `workflow/` (extensions)        |
| Guidelines | `system/guideline/` (core)      | `guideline/` (extensions)       |
| CLI        | `cli/` (core tools)             | `cli/` (user scripts)           |
| Extensions | -                               | `extension/` (convention-based) |

## Debug Logging

Enable config loader debug output:

```bash
DEBUG=config:loader node ...
```

## Key Modules

| Module                                      | Purpose                                    |
| ------------------------------------------- | ------------------------------------------ |
| `config/index.mjs`                          | Config loading, merging, and export        |
| `config/config.json`                        | Base defaults                              |
| `config/config-test.json`                   | Test mode config                           |
| `pm2.config.js`                             | PM2 service definitions with env injection |
| `libs-server/schedule/machine-identity.mjs` | Machine identity resolution                |
