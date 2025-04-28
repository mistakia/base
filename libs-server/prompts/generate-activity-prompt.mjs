import debug from 'debug'
import fs from 'fs/promises'
import { parse_markdown_content } from '#libs-server/markdown/processor/markdown-parser.mjs'
import { resolve_activity_path } from '#libs-server/activities/index.mjs'

const log = debug('prompts:activity')

/**
 * Generate an activity prompt component from an activity file
 *
 * @param {Object} params Parameters
 * @param {string} params.activity_id Activity ID in format [system|user]/<file_path>.md
 * @param {string} [params.system_base_directory] System base directory
 * @param {string} [params.user_base_directory] User base directory
 * @returns {Promise<Object>} Object containing prompt text and guideline IDs
 */
export default async function generate_activity_prompt({
  activity_id,
  system_base_directory,
  user_base_directory
}) {
  if (!activity_id) {
    throw new Error('activity_id is required')
  }

  log(`Generating activity prompt for activity ${activity_id}`)

  try {
    // Get the file path using the shared activity path resolver
    const { file_path } = resolve_activity_path({
      activity_id,
      system_base_directory,
      user_base_directory
    })

    // Read and parse the activity markdown file
    const activity_content = await fs.readFile(file_path, 'utf-8')
    const parsed_markdown = await parse_markdown_content({
      content: activity_content,
      file_path
    })

    // Extract activity frontmatter and content
    const { frontmatter, content } = parsed_markdown

    // Format as a structured activity prompt
    let prompt = `Role: ${frontmatter.title}\n\n`
    prompt += `<role>\n${content}</role>`

    return {
      prompt: prompt.trim(),
      guideline_ids: frontmatter.guidelines || []
    }
  } catch (error) {
    console.log(error)
    log(`Error generating activity prompt: ${error.message}`)
    throw new Error(`Failed to generate activity prompt: ${error.message}`)
  }
}
