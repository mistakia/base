import debug from 'debug'
import fs from 'fs/promises'
import Twig from 'twig'
import { format_document_from_file_content } from '#libs-server/markdown/format-document-from-file-content.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

const log = debug('prompts:workflow')

/**
 * Generate a workflow prompt component from a workflow file
 *
 * @param {Object} params Parameters
 * @param {string} params.base_relative_path Workflow path relative to Base root, e.g., 'system/workflow/<file_path>.md' or 'user/workflow/<file_path>.md'
 * @param {Object} [params.prompt_properties] Properties to inject into the workflow template
 * @param {string} [params.root_base_directory] Custom root base directory
 * @returns {Promise<Object>} Object containing prompt text and guideline paths
 */
export default async function generate_workflow_prompt({
  base_relative_path,
  prompt_properties = {},
  root_base_directory = config.root_base_directory
}) {
  if (!base_relative_path) {
    throw new Error('base_relative_path is required')
  }

  log(`Generating workflow prompt for workflow ${base_relative_path}`)

  try {
    // Get the file path using the shared helper
    const { absolute_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    // Read and parse the workflow markdown file
    const workflow_content = await fs.readFile(absolute_path, 'utf-8')
    const { document_properties, document_content } =
      format_document_from_file_content({
        file_content: workflow_content,
        file_path: absolute_path
      })

    // Render the document content using Twig with prompt_properties
    const rendered_content = await render_template({
      document_content,
      prompt_properties
    })

    // Format as a structured workflow prompt
    let prompt = `Role: ${document_properties.title}\n\n`
    prompt += `<role>\n${rendered_content}\n</role>`

    return {
      prompt: prompt.trim(),
      guideline_base_relative_paths: document_properties.guidelines || []
    }
  } catch (error) {
    console.log(error)
    log(`Error generating workflow prompt: ${error.message}`)
    throw new Error(`Failed to generate workflow prompt: ${error.message}`)
  }
}

/**
 * Render a template string using Twig
 *
 * @param {string} document_content - The document content to render
 * @param {Object} prompt_properties - The prompt properties to render
 * @returns {Promise<string>} - The rendered template string
 */
async function render_template({ document_content, prompt_properties }) {
  try {
    // Create a temporary template
    const template = Twig.twig({
      data: document_content
    })

    // Render the template with the provided context
    return template.render(prompt_properties)
  } catch (error) {
    log(`Template rendering error: ${error.message}`)
    throw new Error(`Failed to render template: ${error.message}`)
  }
}
