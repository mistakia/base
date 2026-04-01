import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import debug from 'debug'
import YAML from 'yaml'

import { homedir } from 'os'

import { generate_volume_mounts } from './volume-mount-generator.mjs'
import config from '#config'

const log = debug('threads:user-container-compose')

/**
 * Generate a docker-compose configuration for a user container
 *
 * @param {Object} params
 * @param {string} params.username - User's username
 * @param {Object} params.thread_config - User's thread configuration
 * @param {string} params.user_base_directory - Host path to user-base
 * @param {string} params.user_data_directory - Host path to user container data parent
 * @param {string} params.container_user_base_path - Container-internal user-base path
 * @param {string} [params.user_public_key] - User's public key for hook scripts
 * @returns {Promise<string>} Path to generated docker-compose.yml
 */
export const generate_compose_config = async ({
  username,
  thread_config,
  user_base_directory,
  user_data_directory,
  container_user_base_path,
  user_public_key = null
}) => {
  if (!container_user_base_path) {
    throw new Error(
      'container_user_base_path is required for compose config generation'
    )
  }

  const container_name = `base-user-${username}`
  const user_dir = join(user_data_directory, username)
  const compose_path = join(user_dir, 'docker-compose.yml')

  log(`Generating compose config for ${container_name}`)

  // Generate volume mounts
  const volume_mounts = await generate_volume_mounts({
    username,
    thread_config,
    user_base_directory,
    user_data_directory,
    container_user_base_path
  })

  // Build environment variables
  const environment = {
    USER_BASE_DIRECTORY: container_user_base_path,
    CONTAINER_MODE: 'user',
    CONTAINER_USERNAME: username,
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
  }

  if (user_public_key) {
    environment.USER_PUBLIC_KEY = user_public_key
  }

  // Add API connection env vars if available
  if (process.env.BASE_API_PROTO) {
    environment.BASE_API_PROTO = process.env.BASE_API_PROTO
  }
  if (process.env.BASE_API_PORT || config.server_port) {
    environment.BASE_API_PORT = String(
      process.env.BASE_API_PORT || config.server_port
    )
  }
  if (process.env.BASE_API_HOST) {
    environment.BASE_API_HOST = process.env.BASE_API_HOST
  }

  // CloakBrowser environment: CLOAKBROWSER_HOME tells cloak-browser.py where
  // to find profiles, daemon state, and venv. PYTHONPATH provides the mounted
  // venv packages with system greenlet (native C ext) taking precedence.
  if (thread_config.browser?.enabled) {
    const browser_home_config = (config.user_containers || {}).browser_home
    const host_home = browser_home_config || homedir()
    const browser_config = thread_config.browser
    const container_python_version = browser_config.container_python_version || '3.11'
    const venv_python_version = browser_config.venv_python_version || '3.12'
    environment.CLOAKBROWSER_HOME = host_home
    environment.PYTHONPATH = [
      `/usr/local/lib/python${container_python_version}/dist-packages`,
      `${host_home}/.local/share/cloakbrowser-venv/lib/python${venv_python_version}/site-packages`
    ].join(':')
  }

  // Resource limits
  const user_containers_config = config.user_containers || {}
  const resource_limits = user_containers_config.resource_limits || {}
  const memory = resource_limits.memory || '2g'
  const cpus = resource_limits.cpus || '1.0'

  // Build compose service definition
  const service = {
    container_name,
    image: 'base-container:latest',
    restart: 'unless-stopped',
    init: true,
    environment,
    volumes: volume_mounts,
    deploy: {
      resources: {
        limits: {
          memory,
          cpus: String(cpus)
        }
      }
    },
    network_mode: 'host',
    entrypoint: ['/usr/local/bin/entrypoint.sh'],
    command: ['tail', '-f', '/dev/null']
  }

  const compose = {
    services: {
      [container_name]: service
    }
  }

  // Write compose file
  await mkdir(user_dir, { recursive: true })
  await writeFile(compose_path, YAML.stringify(compose), 'utf-8')
  log(`Wrote compose config to ${compose_path}`)

  return compose_path
}

export default { generate_compose_config }
