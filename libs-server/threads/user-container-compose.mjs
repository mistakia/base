import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import debug from 'debug'
import YAML from 'yaml'

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
 * @param {string} [params.container_user_base_path] - Container-internal user-base path
 * @returns {Promise<string>} Path to generated docker-compose.yml
 */
export const generate_compose_config = async ({
  username,
  thread_config,
  user_base_directory,
  user_data_directory,
  container_user_base_path = '/home/node/user-base'
}) => {
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
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
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
    entrypoint: ['/usr/local/bin/entrypoint.sh'],
    command: ['tail', '-f', '/dev/null']
  }

  // Optional network configuration from thread_config.network_policy
  if (thread_config.network_policy?.allowed_domains?.length > 0) {
    // Network isolation can be configured via Docker networks
    // For now, hooks handle network tool blocking
    log(
      `Network policy configured for ${username} with ${thread_config.network_policy.allowed_domains.length} allowed domains`
    )
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
