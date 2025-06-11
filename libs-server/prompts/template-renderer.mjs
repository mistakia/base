import debug from 'debug'
import Twig from 'twig'

const log = debug('prompts:template-renderer')

/**
 * Render a template string using Twig
 *
 * @param {Object} params Parameters
 * @param {string} params.document_content - The document content to render
 * @param {Object} params.template_context - The template context to render with
 * @param {string} [params.context_name] - Optional context name for better error messages
 * @returns {Promise<string>} - The rendered template string
 */
export async function render_template({
  document_content,
  template_context,
  context_name = 'unknown'
}) {
  try {
    // Create a temporary template
    const template = Twig.twig({
      data: document_content
    })

    // Render the template with the provided context
    return template.render(template_context)
  } catch (error) {
    log(`Template rendering error for ${context_name}: ${error.message}`)
    throw new Error(`Failed to render template for ${context_name}: ${error.message}`)
  }
}

/**
 * Prepare template context by merging provided properties with timeline data
 *
 * @param {Object} params Parameters
 * @param {Object} [params.prompt_properties={}] - Properties to inject into templates
 * @param {Array} [params.timeline_entries=[]] - Timeline entries to make available in templates
 * @returns {Object} - Merged template context
 */
export function prepare_template_context({
  prompt_properties = {},
  timeline_entries = []
}) {
  return {
    ...prompt_properties,
    timeline: timeline_entries || []
  }
}

/**
 * Merge default values from entity properties with provided context
 *
 * @param {Object} params Parameters
 * @param {Object} params.base_context - Base template context
 * @param {Object} [params.entity_properties] - Entity properties that may contain prompt_properties with defaults
 * @returns {Object} - Final context with defaults applied
 */
export function merge_default_values({
  base_context,
  entity_properties
}) {
  let final_context = { ...base_context }
  
  if (entity_properties?.prompt_properties) {
    // Apply default values from entity prompt_properties
    for (const prop of entity_properties.prompt_properties) {
      if (prop.default !== undefined && final_context[prop.name] === undefined) {
        final_context[prop.name] = prop.default
      }
    }
  }

  return final_context
}

/**
 * Extract a clean name from a base URI for use in template contexts
 *
 * @param {string} base_uri - The base URI to extract name from
 * @param {string} [fallback='untitled'] - Fallback name if extraction fails
 * @returns {string} - Clean name suitable for use in templates
 */
export function extract_name_from_uri(base_uri, fallback = 'untitled') {
  if (!base_uri) {
    return fallback
  }

  try {
    // Example: system/guideline/write-workflow.md -> write-workflow -> write_workflow
    const path_parts = base_uri.split('/')
    const filename = path_parts[path_parts.length - 1]
    if (filename) {
      return filename.replace(/\.md$/, '').replace(/-/g, '_')
    }
  } catch (error) {
    log(`Error extracting name from URI ${base_uri}: ${error.message}`)
  }

  return fallback
} 