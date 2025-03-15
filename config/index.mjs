/**
 * Unified Configuration Module
 * 
 * Provides a consolidated configuration system that merges:
 * - Non-sensitive config from config/*.json files (tracked by git)
 * - Sensitive config from config/secrets/*.json files (not tracked by git, encrypted)
 * - Environment variable overrides
 * 
 * Directory structure:
 * - config/
 *   - *.json - Environment-specific configuration files (base.json, development.json, etc.)
 *   - secrets/ - Directory for sensitive configuration (encrypted with @tsmx/secure-config)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import secure_config from '@tsmx/secure-config'

// Load environment variables from .env file
dotenv.config()

// Get directory paths
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const NODE_ENV = process.env.NODE_ENV || 'development'
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY

// Paths for configuration files
const CONFIG_DIR = __dirname
const SECRETS_DIR = path.join(CONFIG_DIR, 'secrets')

/**
 * Load non-sensitive configuration from config directory
 * @returns {Object} The loaded configuration object
 */
function load_regular_config() {
  const base_config_path = path.join(CONFIG_DIR, 'base.json')
  const env_config_path = path.join(CONFIG_DIR, `${NODE_ENV}.json`)
  
  // Load base configuration
  let config = {}
  if (fs.existsSync(base_config_path)) {
    const base_config = JSON.parse(fs.readFileSync(base_config_path, 'utf8'))
    config = { ...base_config }
  }
  
  // Load environment-specific configuration
  if (fs.existsSync(env_config_path)) {
    const env_config = JSON.parse(fs.readFileSync(env_config_path, 'utf8'))
    config = deep_merge(config, env_config)
  }
  
  return config
}

/**
 * Load sensitive configuration from secrets directory
 * @returns {Object} The loaded secure configuration object
 */
function load_secure_config() {
  if (!ENCRYPTION_KEY) {
    console.warn('Warning: ENCRYPTION_KEY not set. Secure configuration will not be loaded.')
    return {}
  }
  
  try {
    // Configure secure-config options
    const secure_config_options = {
      directory: SECRETS_DIR,
      hmacValidation: true,
      keyVariable: 'ENCRYPTION_KEY'
    }
    
    // Load secure configuration based on environment
    const config_prefix = NODE_ENV === 'development' ? 'config' : `config-${NODE_ENV}`
    const secure_conf = secure_config({
      ...secure_config_options,
      prefix: config_prefix
    })
    
    return secure_conf || {}
  } catch (error) {
    console.warn(`Error loading secure configuration: ${error.message}`)
    console.warn('Continuing with non-sensitive configuration only')
    return {}
  }
}

/**
 * Apply environment variable overrides to configuration
 * @param {Object} config - The configuration object to override
 * @returns {Object} The configuration with environment variable overrides applied
 */
function apply_env_overrides(config) {
  const result = { ...config }
  const prefix = 'CONFIG_'
  
  // Process environment variables that start with CONFIG_
  Object.keys(process.env)
    .filter(key => key.startsWith(prefix) && key !== 'ENCRYPTION_KEY')
    .forEach(key => {
      const config_path = key.substring(prefix.length).toLowerCase().split('_')
      
      // Convert value to appropriate type
      let value = process.env[key]
      if (value.toLowerCase() === 'true') value = true
      else if (value.toLowerCase() === 'false') value = false
      else if (!isNaN(value) && value.trim() !== '') value = Number(value)
      
      // Set value in config
      set_nested_property(result, config_path, value)
    })
  
  return result
}

/**
 * Set a nested property in an object
 * @param {Object} obj - Object to modify
 * @param {Array<string>} path_parts - Path parts
 * @param {*} value - Value to set
 */
function set_nested_property(obj, path_parts, value) {
  let current = obj
  
  for (let i = 0; i < path_parts.length - 1; i++) {
    const part = path_parts[i]
    if (!current[part]) {
      current[part] = {}
    }
    current = current[part]
  }
  
  current[path_parts[path_parts.length - 1]] = value
}

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} - Merged object
 */
function deep_merge(target, source) {
  const output = { ...target }
  
  if (is_object(target) && is_object(source)) {
    Object.keys(source).forEach(key => {
      if (is_object(source[key])) {
        if (!(key in target)) {
          output[key] = source[key]
        } else {
          output[key] = deep_merge(target[key], source[key])
        }
      } else {
        output[key] = source[key]
      }
    })
  }
  
  return output
}

/**
 * Check if value is an object
 * @param {*} item - Item to check
 * @returns {boolean} - True if object
 */
function is_object(item) {
  return (item && typeof item === 'object' && !Array.isArray(item))
}

/**
 * Get the complete configuration by combining regular and secure configs
 * @returns {Object} The complete configuration object
 */
export function get_config() {
  // Load configurations
  const regular_config = load_regular_config()
  const secure_config_data = load_secure_config()
  
  // Merge configurations
  let config = { ...regular_config }
  
  // Add secure configuration under the 'secure' key
  if (Object.keys(secure_config_data).length > 0) {
    config.secure = secure_config_data
  }
  
  // Apply environment variable overrides
  config = apply_env_overrides(config)
  
  // Add environment information
  config.environment = {
    node_env: NODE_ENV,
    is_production: NODE_ENV === 'production',
    is_development: NODE_ENV === 'development',
    is_test: NODE_ENV === 'test'
  }
  
  return config
}

/**
 * Get a nested property from a configuration object
 * @param {Object} config - Configuration object
 * @param {string} path - Dot-separated path
 * @param {*} default_value - Default value if not found
 * @returns {*} - Value or default
 */
export function get_config_value(config, path, default_value = undefined) {
  const path_parts = path.split('.')
  let current = config
  
  for (const part of path_parts) {
    if (current === undefined || current === null || !(part in current)) {
      return default_value
    }
    current = current[part]
  }
  
  return current
}

export default {
  get_config,
  get_config_value
} 