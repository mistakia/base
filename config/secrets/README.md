# Sensitive Configuration

This directory contains sensitive configuration files that are encrypted using [@tsmx/secure-config](https://github.com/tsmx/secure-config).

## File Naming Convention

- `config.json` - Default configuration for development environment
- `config-{environment}.json` - Environment-specific configuration (e.g., `config-production.json`)

## Security Notes

- Files in this directory should **not** be committed to version control
- The encryption key should be set in the `ENCRYPTION_KEY` environment variable
- Make sure to add this directory to your `.gitignore` file

## Example Configuration

```json
{
  "database": {
    "password": "your-secure-password",
    "username": "db-user"
  },
  "api_keys": {
    "service_name": "your-api-key"
  }
}
```

## Usage

The sensitive configuration is automatically loaded by the main configuration module and made available under the `secure` key in the configuration object:

```javascript
import { get_config } from '../config/index.mjs'

const config = get_config()
const db_password = config.secure.database.password
``` 