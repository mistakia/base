import debug from 'debug'
import fs from 'fs/promises'
import Twig from 'twig'
import { format_document_from_file_content } from '#libs-server/markdown/format-document-from-file-content.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'
// Tool registration happens at thread creation time

const log = debug('prompts:workflow')

/**
 * Generate a workflow prompt component from a workflow file
 *
 * @param {Object} params Parameters
 * @param {string} params.base_uri URI identifying the workflow (e.g., 'sys:workflow/name.md', 'user:workflow/name.md')
 * @param {Object} [params.prompt_properties] Properties to inject into the workflow template
 * @param {Array} [params.timeline_entries] Timeline entries to make available in the template
 * @returns {Promise<Object>} Object containing prompt text and guideline paths
 */
export default async function generate_workflow_prompt({
  base_uri,
  prompt_properties = {},
  timeline_entries = []
}) {
  if (!base_uri) {
    throw new Error('base_uri is required')
  }

  log(`Generating workflow prompt for workflow ${base_uri}`)

  try {
    // Resolve absolute path using registry
    const absolute_path = resolve_base_uri_from_registry(base_uri)

    // Read and parse the workflow markdown file
    const workflow_content = await fs.readFile(absolute_path, 'utf-8')
    const { document_properties, document_content } =
      format_document_from_file_content({
        file_content: workflow_content,
        file_path: absolute_path
      })

    // Prepare template context with prompt properties and timeline data
    const prompt_properties_with_timeline = {
      ...prompt_properties,
      timeline: timeline_entries || []
    }

    // Render the document content using Twig with template context
    const rendered_content = await render_template({
      document_content,
      prompt_properties: prompt_properties_with_timeline
    })

    // Format as a structured workflow prompt
    let prompt = `Role: ${document_properties.title}\n\n`
    prompt += `<role>\n${rendered_content}\n</role>`

    return {
      prompt: prompt.trim(),
      guideline_base_uris: document_properties.guidelines || []
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
 * @param {Object} prompt_properties - The prompt properties to render with
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
