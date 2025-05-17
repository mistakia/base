import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/index.mjs'
import { 
  format_entity_absolute_path_for_github_issue,
  format_entity_directory_for_github_issue 
} from './format-task-path-for-github-issue.mjs'

const log = debug('github:task')

/**
 * Finds a task associated with a GitHub issue
 *
 * @param {Object} options - Function options
 * @param {string} options.external_id - The external ID of the task
 * @param {number} options.github_issue_number - The GitHub issue number
 * @param {string} options.github_repository_owner - The owner of the GitHub repository
 * @param {string} options.github_repository_name - The name of the GitHub repository
 * @param {string} options.github_issue_title - The title of the GitHub issue (for direct path lookup)
 * @param {string} options.user_base_directory - Base directory for user data
 * @param {Object} [options.trx=null] - Optional database transaction (not used in this function)
 * @returns {Promise<Object|null>} - Task information or null if not found
 */
export async function find_entity_for_github_issue({
  external_id,
  github_issue_number,
  github_repository_owner,
  github_repository_name,
  github_issue_title,
  user_base_directory,
  trx = null
}) {
  try {
    log(`Finding task for GitHub issue #${github_issue_number}`)

    if (!external_id) {
      throw new Error('Missing required parameter: external_id')
    }

    if (!github_issue_number) {
      throw new Error('Missing required parameter: github_issue_number')
    }

    if (!github_repository_owner) {
      throw new Error('Missing required parameter: github_repository_owner')
    }

    if (!github_repository_name) {
      throw new Error('Missing required parameter: github_repository_name')
    }

    if (!user_base_directory) {
      throw new Error('Missing required parameter: user_base_directory')
    }

    // Approach 1: Try direct path lookup if we have title
    if (github_issue_title) {
      const absolute_path = format_entity_absolute_path_for_github_issue({
        github_repository_owner,
        github_repository_name,
        github_issue_number,
        user_base_directory,
        github_issue_title
      })

      log(`Attempting direct file lookup at ${absolute_path}`)
      
      const result = await read_entity_from_filesystem({
        absolute_path
      })
      
      if (result.success) {
        return {
          entity_id: result.entity_properties.entity_id,
          absolute_path,
          task_properties: result.entity_properties
        }
      }
    }

    // Approach 2: Search in repository directory for file with matching external_id
    const directory_path = format_entity_directory_for_github_issue({
      github_repository_owner,
      github_repository_name,
      user_base_directory
    })
    
    log(`Searching for files in ${directory_path}`)
    
    try {
      // Check if directory exists
      try {
        await fs.access(directory_path)
      } catch (error) {
        log(`Repository directory does not exist: ${directory_path}`)
        return null
      }

      const files = await fs.readdir(directory_path)
      
      // Find markdown files starting with the issue number
      const potential_files = files.filter(file => 
        file.startsWith(`${github_issue_number}-`) && file.endsWith('.md')
      )
      
      // Check each potential file
      for (const file of potential_files) {
        const absolute_path = path.join(directory_path, file)
        
        const result = await read_entity_from_filesystem({
          absolute_path
        })
        
        // Check if this file has the external_id we're looking for
        if (result.success && result.entity_properties.external_id === external_id) {
          return {
            entity_id: result.entity_properties.entity_id,
            absolute_path,
            task_properties: result.entity_properties
          }
        }
      }
      
      // If we didn't find by issue number prefix, check all markdown files
      const all_markdown_files = files.filter(file => file.endsWith('.md'))
      
      for (const file of all_markdown_files) {
        // Skip files we already checked
        if (potential_files.includes(file)) continue
        
        const absolute_path = path.join(directory_path, file)
        
        const result = await read_entity_from_filesystem({
          absolute_path
        })
        
        // Check if this file has the external_id we're looking for
        if (result.success && result.entity_properties.external_id === external_id) {
          return {
            entity_id: result.entity_properties.entity_id,
            absolute_path,
            task_properties: result.entity_properties
          }
        }
      }
    } catch (error) {
      log(`Error searching repository directory: ${error.message}`)
      // Continue to try fallback approach
    }

    log(`No task found for GitHub issue #${github_issue_number}`)
    return null
  } catch (error) {
    log(`Error finding task by GitHub issue: ${error.message}`)
    throw error
  }
}
