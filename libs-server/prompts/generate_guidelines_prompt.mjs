import debug from 'debug'
import fs from 'fs'
import { parse_markdown } from '#libs-server/markdown/index.mjs'
import {
  get_guideline_file,
  get_system_guidelines_directory,
  get_user_guidelines_directory
} from '#libs-server/guidelines/index.mjs'
import glob from 'glob'

const log = debug('prompts:guidelines')

/**
 * Generate a guidelines prompt component
 *
 * @param {Object} params Parameters
 * @param {Array<string>} [params.guideline_ids] Array of guideline IDs to include
 * @param {string} [params.file_path] Path to check against guideline globs
 * @param {string} [params.system_base_directory] System base directory
 * @param {string} [params.user_base_directory] User base directory
 * @returns {Promise<string>} Generated guidelines prompt component
 */
export default async function generate_guidelines_prompt({
  guideline_ids = [],
  file_path,
  system_base_directory,
  user_base_directory
}) {
  log('Generating guidelines prompt')

  // Array to hold all guidelines content
  const guidelines_content = []

  // Keep track of processed guideline IDs to prevent duplicates
  const processed_ids = new Set()

  // Process explicitly specified guideline IDs
  if (guideline_ids.length > 0) {
    log(`Processing ${guideline_ids.length} explicit guideline IDs`)
    for (const guideline_id of guideline_ids) {
      try {
        // Skip if we've already processed this guideline_id
        if (processed_ids.has(guideline_id)) {
          log(`Skipping duplicate guideline ID: ${guideline_id}`)
          continue
        }

        const guideline_file = await get_guideline_file({
          guideline_id,
          system_base_directory,
          user_base_directory
        })

        const parsed = await parse_markdown(guideline_file.content)

        // Store the original guideline_id with the parsed content for reference
        parsed.guideline_id = guideline_id

        guidelines_content.push(parsed)
        processed_ids.add(guideline_id)
      } catch (error) {
        log(`Error loading guideline ${guideline_id}: ${error.message}`)
        // Continue with other guidelines even if one fails
      }
    }
  }

  // If file_path is provided, find matching guidelines based on globs
  if (file_path) {
    log(`Finding guidelines matching file path: ${file_path}`)
    const matching_guidelines = await find_matching_guidelines({
      file_path,
      system_base_directory,
      user_base_directory
    })

    // Add unique matching guidelines
    for (const guideline of matching_guidelines) {
      // Skip if we've already processed this guideline_id
      if (guideline.guideline_id && processed_ids.has(guideline.guideline_id)) {
        log(`Skipping duplicate guideline ID: ${guideline.guideline_id}`)
        continue
      }

      guidelines_content.push(guideline)

      // Add to processed set if it has a guideline_id
      if (guideline.guideline_id) {
        processed_ids.add(guideline.guideline_id)
      }
    }
  }

  // Format all guidelines into a single prompt
  let prompt = ''

  if (guidelines_content.length === 0) {
    return prompt
  }

  // Add each guideline in a structured format
  for (const guideline of guidelines_content) {
    const { content, guideline_id } = guideline

    // Extract the filename without extension from the guideline_id
    let guideline_name = 'untitled'
    if (guideline_id) {
      // Example: system/path/to/create-activity.md -> create-activity
      const filename = guideline_id.split('/').pop()
      if (filename) {
        guideline_name = filename.replace(/\.md$/, '')
      }
    }

    // Opening tag with guideline name
    prompt += `<${guideline_name}_rules>\n\n`

    // Add the raw content
    prompt += `${content}\n\n`

    // Closing tag with guideline name
    prompt += `</${guideline_name}_rules>\n\n`
  }

  return prompt.trim()
}

/**
 * Find guidelines matching a file path based on globs
 *
 * @param {Object} params Parameters
 * @param {string} params.file_path File path to match against
 * @param {string} params.system_base_directory System base directory
 * @param {string} params.user_base_directory User base directory
 * @returns {Promise<Array>} Array of matching guidelines
 */
async function find_matching_guidelines({
  file_path,
  system_base_directory,
  user_base_directory
}) {
  const matching_guidelines = []

  // Get guidelines directories using the exported functions
  const system_guidelines_dir = get_system_guidelines_directory({
    system_base_directory
  })
  const user_guidelines_dir = get_user_guidelines_directory({
    user_base_directory
  })

  // Check if directories exist
  if (
    !fs.existsSync(system_guidelines_dir) ||
    !fs.existsSync(user_guidelines_dir)
  ) {
    log('Guidelines directories not found')
    return matching_guidelines
  }

  // Collect all guideline files
  const system_guideline_files = glob.sync('**/*.md', {
    cwd: system_guidelines_dir
  })
  const user_guideline_files = glob.sync('**/*.md', {
    cwd: user_guidelines_dir
  })

  // Process system guidelines
  for (const guideline_file of system_guideline_files) {
    const guideline_id = `system/${guideline_file}`
    try {
      const file_result = await get_guideline_file({
        guideline_id,
        system_base_directory,
        user_base_directory
      })

      const parsed = await parse_markdown(file_result.content)

      // Store the guideline_id for reference
      parsed.guideline_id = guideline_id

      // Check if this guideline applies to the file path
      if (
        parsed.frontmatter &&
        parsed.frontmatter.globs &&
        Array.isArray(parsed.frontmatter.globs)
      ) {
        for (const pattern of parsed.frontmatter.globs) {
          if (matches_glob(file_path, pattern)) {
            matching_guidelines.push(parsed)
            break
          }
        }
      }
    } catch (error) {
      log(`Error reading guideline ${guideline_id}: ${error.message}`)
      continue
    }
  }

  // Process user guidelines
  for (const guideline_file of user_guideline_files) {
    const guideline_id = `user/${guideline_file}`
    try {
      const file_result = await get_guideline_file({
        guideline_id,
        system_base_directory,
        user_base_directory
      })

      const parsed = await parse_markdown(file_result.content)

      // Store the guideline_id for reference
      parsed.guideline_id = guideline_id

      // Check if this guideline applies to the file path
      if (
        parsed.frontmatter &&
        parsed.frontmatter.globs &&
        Array.isArray(parsed.frontmatter.globs)
      ) {
        for (const pattern of parsed.frontmatter.globs) {
          if (matches_glob(file_path, pattern)) {
            matching_guidelines.push(parsed)
            break
          }
        }
      }
    } catch (error) {
      log(`Error reading guideline ${guideline_id}: ${error.message}`)
      continue
    }
  }

  return matching_guidelines
}

/**
 * Check if a file path matches a glob pattern
 *
 * @param {string} file_path File path to check
 * @param {string} pattern Glob pattern to match against
 * @returns {boolean} Whether the path matches the pattern
 */
function matches_glob(file_path, pattern) {
  // Simple glob matching, can be enhanced with a proper glob library
  if (pattern === '*') return true

  // Convert glob to regex pattern
  const regex_pattern = pattern
    .replace(/\./g, '\\.') // Escape dots
    .replace(/\*/g, '.*') // Convert * to .*
    .replace(/\?/g, '.') // Convert ? to .

  const regex = new RegExp(`^${regex_pattern}$`)
  return regex.test(file_path)
}
