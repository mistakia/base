# Configuration System

This document describes the configuration system and how to migrate from the old structure to the new structure.

## Overview

The configuration system provides a unified way to manage application settings from various sources:

1. Non-sensitive configuration files (JSON)
2. Sensitive configuration files (encrypted JSON)
3. Environment variables

## Directory Structure

The new configuration structure is organized as follows:

```
/config/
  ├── index.mjs         # Main configuration module
  ├── base.json         # Base configuration for all environments
  ├── development.json  # Environment-specific configuration
  ├── production.json   # Environment-specific configuration
  ├── test.json         # Environment-specific configuration
  ├── README.md         # Documentation for the config directory
  └── secrets/          # Directory for sensitive configuration
      ├── config.json             # Encrypted sensitive config for development
      ├── config-production.json  # Encrypted sensitive config for production
      ├── config-test.json        # Encrypted sensitive config for test
      └── README.md               # Documentation for the secrets directory
```

## Usage

```javascript
// Import the configuration module
import { get_config, get_config_value } from './config/index.mjs'

// Get the complete configuration
const config = get_config()

// Access configuration values
const server_port = config.server.port
const api_key = config.secure.api_keys.service_name

// Or use the helper function with a default value
const timeout = get_config_value(config, 'server.timeout', 30000)
```

## Environment Variables

You can override configuration values using environment variables with the `CONFIG_` prefix:

```
CONFIG_SERVER_PORT=3000
CONFIG_DATABASE_HOST=localhost
```

These will set `config.server.port` to `3000` and `config.database.host` to `localhost`.

## Sensitive Configuration

Sensitive configuration is stored in encrypted files in the `config/secrets/` directory using [@tsmx/secure-config](https://github.com/tsmx/secure-config).

To use sensitive configuration:

1. Set the `ENCRYPTION_KEY` environment variable
2. Create encrypted configuration files in the `config/secrets/` directory

## Environment Variables

The following environment variables are used by the configuration system:

- `NODE_ENV` - The current environment (development, production, test)
- `ENCRYPTION_KEY` - The key used to decrypt sensitive configuration files 