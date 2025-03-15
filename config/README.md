# Configuration System

This directory contains the configuration system for the application.

## Directory Structure

- `*.json` - Non-sensitive configuration files (e.g., `base.json`, `development.json`)
- `secrets/` - Directory for sensitive configuration files (encrypted)
- `index.mjs` - Main configuration module that loads and merges all configuration sources

## Configuration Files

### Non-sensitive Configuration

- `base.json` - Base configuration that applies to all environments
- `{environment}.json` - Environment-specific configuration (e.g., `development.json`, `production.json`)

### Sensitive Configuration

Sensitive configuration is stored in the `secrets/` directory and is encrypted using [@tsmx/secure-config](https://github.com/tsmx/secure-config). See the README in that directory for more details.

## Environment Variables

Configuration can be overridden using environment variables with the `CONFIG_` prefix:

- `CONFIG_SERVER_PORT=3000` will set `config.server.port` to `3000`
- `CONFIG_DATABASE_HOST=localhost` will set `config.database.host` to `localhost`

## Usage

```javascript
import { get_config, get_config_value } from './config/index.mjs'

// Get the complete configuration
const config = get_config()

// Access configuration values
const port = config.server.port
const db_host = config.database.host
const api_key = config.secure.api_keys.service_name

// Or use the helper function
const port = get_config_value(config, 'server.port', 3000) // With default value
``` 