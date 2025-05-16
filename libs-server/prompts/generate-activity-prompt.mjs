import debug from 'debug'
import fs from 'fs/promises'
import { format_document_from_file_content } from '#libs-server/markdown/format-document-from-file-content.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

const log = debug('prompts:activity')

/**
 * Generate an activity prompt component from an activity file
 *
 * @param {Object} params Parameters
 * @param {string} params.base_relative_path Activity path relative to Base root, e.g., 'system/activity/<file_path>.md' or 'user/activity/<file_path>.md'
 * @param {string} [params.root_base_directory] Custom root base directory
 * @returns {Promise<Object>} Object containing prompt text and guideline paths
 */
export default async function generate_activity_prompt({
  base_relative_path,
  root_base_directory = config.root_base_directory
}) {
  if (!base_relative_path) {
    throw new Error('base_relative_path is required')
  }

  log(`Generating activity prompt for activity ${base_relative_path}`)

  try {
    // Get the file path using the shared helper
    const { absolute_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    // Read and parse the activity markdown file
    const activity_content = await fs.readFile(absolute_path, 'utf-8')
    const { document_properties, document_content } =
      format_document_from_file_content({
        file_content: activity_content,
        file_path: absolute_path
      })

    // Format as a structured activity prompt
    let prompt = `Role: ${document_properties.title}\n\n`
    prompt += `<role>\n${document_content}</role>`

    return {
      prompt: prompt.trim(),
      guideline_base_relative_paths: document_properties.guidelines || []
    }
  } catch (error) {
    console.log(error)
    log(`Error generating activity prompt: ${error.message}`)
    throw new Error(`Failed to generate activity prompt: ${error.message}`)
  }
}
