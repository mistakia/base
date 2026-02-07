import debug from 'debug'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { read_entity_from_git } from '#libs-server/entity/git/read-entity-from-git.mjs'
import { entity_exists_in_git } from '#libs-server/entity/git/entity-exists-in-git.mjs'
import {
  resolve_base_uri_from_registry,
  get_git_info_from_registry
} from '#libs-server/base-uri/index.mjs'

/**
 * Factory function to create entity accessor functions for a specific entity type.
 * Generates standardized exists_in_filesystem, read_from_filesystem, and read_from_git functions.
 *
 * @param {Object} options - Configuration options
 * @param {string} options.entity_type - Entity type name for error messages (e.g., 'task', 'workflow')
 * @param {string} options.debug_namespace - Debug namespace (e.g., 'task', 'workflow:accessor')
 * @returns {Object} Object containing accessor functions
 */
export function create_entity_accessors({ entity_type, debug_namespace }) {
  const log = debug(debug_namespace)

  /**
   * Check if an entity file exists in the filesystem
   *
   * @param {Object} params - Parameters
   * @param {string} params.base_uri - URI identifying the entity
   * @returns {Promise<boolean>} - True if entity exists, false otherwise
   */
  async function exists_in_filesystem({ base_uri }) {
    try {
      log(`Checking if ${entity_type} exists in filesystem: ${base_uri}`)

      const absolute_path = resolve_base_uri_from_registry(base_uri)
      log(`Checking ${entity_type} at path: ${absolute_path}`)

      return await file_exists_in_filesystem({ absolute_path })
    } catch (error) {
      log(`Error checking if ${entity_type} exists: ${error.message}`)
      return false
    }
  }

  /**
   * Read an entity from the filesystem
   *
   * @param {Object} params - Parameters
   * @param {string} params.base_uri - URI identifying the entity
   * @returns {Promise<Object>} - Entity file contents and metadata
   */
  async function read_from_filesystem({ base_uri }) {
    try {
      log(`Reading ${entity_type} file from filesystem: ${base_uri}`)

      const absolute_path = resolve_base_uri_from_registry(base_uri)
      log(`Reading ${entity_type} entity from path: ${absolute_path}`)

      const entity_file_exists = await file_exists_in_filesystem({
        absolute_path
      })

      if (!entity_file_exists) {
        return {
          success: false,
          error: `${entity_type} '${base_uri}' does not exist`,
          base_uri
        }
      }

      const entity_result = await read_entity_from_filesystem({ absolute_path })

      if (!entity_result.success) {
        return {
          success: false,
          error:
            entity_result.error ||
            `Failed to read ${entity_type} '${base_uri}'`,
          base_uri,
          absolute_path
        }
      }

      return {
        success: true,
        base_uri,
        absolute_path,
        entity_properties: entity_result.entity_properties,
        entity_content: entity_result.entity_content,
        raw_content: entity_result.raw_content
      }
    } catch (error) {
      log(`Error reading ${entity_type} file: ${error.message}`)
      return {
        success: false,
        error: `Failed to read ${entity_type} file: ${error.message}`,
        base_uri
      }
    }
  }

  /**
   * Read an entity from a git branch
   *
   * @param {Object} params - Parameters
   * @param {string} params.base_uri - Entity ID in URI format
   * @param {string} params.branch - Git branch to read from
   * @returns {Promise<Object>} - Entity file contents and metadata
   */
  async function read_from_git({ base_uri, branch }) {
    try {
      log(
        `Reading ${entity_type} file from git: ${base_uri} (branch: ${branch})`
      )

      if (!base_uri) {
        return {
          success: false,
          error: `${entity_type} base_uri is required`,
          base_uri,
          branch
        }
      }

      if (!branch) {
        return {
          success: false,
          error: 'Branch name is required',
          base_uri
        }
      }

      const exists_result = await entity_exists_in_git({ base_uri, branch })

      if (!exists_result.success) {
        return {
          success: false,
          error:
            exists_result.error ||
            `Failed to check if ${entity_type} exists in git`,
          base_uri,
          branch
        }
      }

      if (!exists_result.exists) {
        return {
          success: false,
          error: `${entity_type} '${base_uri}' does not exist in branch '${branch}'`,
          base_uri,
          branch
        }
      }

      const { git_relative_path, repo_path } =
        get_git_info_from_registry(base_uri)

      log(
        `Reading ${entity_type} from git at path: ${git_relative_path} in repo: ${repo_path}`
      )

      const entity_result = await read_entity_from_git({
        repo_path,
        git_relative_path,
        branch
      })

      if (!entity_result.success) {
        return {
          success: false,
          error:
            entity_result.error ||
            `Failed to read ${entity_type} '${base_uri}'`,
          base_uri,
          branch
        }
      }

      return {
        success: true,
        base_uri,
        branch,
        entity_properties: entity_result.entity_properties,
        entity_content: entity_result.entity_content,
        raw_content: entity_result.raw_content
      }
    } catch (error) {
      log(`Error reading ${entity_type} file from git: ${error.message}`)
      return {
        success: false,
        error: `Failed to read ${entity_type} file from git: ${error.message}`,
        base_uri,
        branch
      }
    }
  }

  return {
    exists_in_filesystem,
    read_from_filesystem,
    read_from_git
  }
}
