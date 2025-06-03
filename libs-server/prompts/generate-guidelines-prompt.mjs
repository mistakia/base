import debug from 'debug'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import config from '#config'

const log = debug('prompts:guidelines')

/**
 * Generate a guidelines prompt component
 *
 * @param {Object} params Parameters
 * @param {Array<string>} [params.guideline_base_relative_paths] Array of guideline paths relative to Base root
 * @param {string} [params.root_base_directory] Custom root base directory
 * @returns {Promise<string>} Generated guidelines prompt component
 */
export default async function generate_guidelines_prompt({
  guideline_base_relative_paths = [],
  root_base_directory = config.root_base_directory
}) {
  log('Generating guidelines prompt')

  // Array to hold all guidelines content
  const guidelines_content = []

  // Keep track of processed paths to prevent duplicates
  const processed_paths = new Set()

  // Process explicitly specified guideline paths
  if (guideline_base_relative_paths.length > 0) {
    log(
      `Processing ${guideline_base_relative_paths.length} explicit guideline paths`
    )
    for (const base_relative_path of guideline_base_relative_paths) {
      try {
        // Skip if we've already processed this path
        if (processed_paths.has(base_relative_path)) {
          log(`Skipping duplicate guideline path: ${base_relative_path}`)
          continue
        }

        // Get the file path using the shared helper
        const { absolute_path } = await get_base_file_info({
          base_relative_path,
          root_base_directory
        })

        // Read the entity from filesystem
        const entity_result = await read_entity_from_filesystem({
          absolute_path
        })

        if (!entity_result.success) {
          log(
            `Error reading guideline at ${base_relative_path}: ${entity_result.error}`
          )
          continue
        }

        // Only include if it's a guideline type
        if (entity_result.entity_properties.type === 'guideline') {
          // Store the path with the parsed content for reference
          entity_result.base_relative_path = base_relative_path
          guidelines_content.push(entity_result)
          processed_paths.add(base_relative_path)
        } else {
          log(`Skipping non-guideline file: ${base_relative_path}`)
        }
      } catch (error) {
        log(
          `Error loading guideline at ${base_relative_path}: ${error.message}`
        )
        // Continue with other guidelines even if one fails
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
    const { entity_content, base_relative_path } = guideline

    // Extract the filename without extension from the path
    let guideline_name = 'untitled'
    if (base_relative_path) {
      // Example: system/guideline/write-workflow.md -> write-workflow -> create_workflow
      const path_parts = base_relative_path.split('/')
      const filename = path_parts[path_parts.length - 1]
      if (filename) {
        guideline_name = filename.replace(/\.md$/, '').replace(/-/g, '_')
      }
    }

    // Opening tag with guideline name
    prompt += `<${guideline_name}_rules>\n\n`

    // Add the raw content
    prompt += `${entity_content}\n\n`

    // Closing tag with guideline name
    prompt += `</${guideline_name}_rules>\n\n`
  }

  return prompt.trim()
}
