import debug from 'debug'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import {
  render_template,
  prepare_template_context,
  merge_default_values,
  extract_name_from_uri
} from './template-renderer.mjs'

const log = debug('prompts:guidelines')

/**
 * Generate a guidelines prompt component
 *
 * @param {Object} params Parameters
 * @param {Array<string>} [params.guideline_base_uris] Array of guideline URIs (e.g., 'sys:guideline/name.md')
 * @param {Object} [params.prompt_properties] Properties to inject into guideline templates
 * @param {Array} [params.timeline_entries] Timeline entries to make available in templates
 * @returns {Promise<string>} Generated guidelines prompt component
 */
export default async function generate_guidelines_prompt({
  guideline_base_uris = [],
  prompt_properties = {},
  timeline_entries = []
}) {
  log('Generating guidelines prompt')

  // Array to hold all guidelines content
  const guidelines_content = []

  // Keep track of processed paths to prevent duplicates
  const processed_paths = new Set()

  // Process explicitly specified guideline paths
  if (guideline_base_uris.length > 0) {
    log(`Processing ${guideline_base_uris.length} explicit guideline paths`)
    for (const base_uri of guideline_base_uris) {
      try {
        // Skip if we've already processed this path
        if (processed_paths.has(base_uri)) {
          log(`Skipping duplicate guideline path: ${base_uri}`)
          continue
        }

        // Resolve absolute path using registry
        const absolute_path = resolve_base_uri_from_registry(base_uri)

        // Read the entity from filesystem
        const entity_result = await read_entity_from_filesystem({
          absolute_path
        })

        if (!entity_result.success) {
          log(`Error reading guideline at ${base_uri}: ${entity_result.error}`)
          continue
        }

        // Only include if it's a guideline type
        if (entity_result.entity_properties.type === 'guideline') {
          // Store the path with the parsed content for reference
          entity_result.base_uri = base_uri
          guidelines_content.push(entity_result)
          processed_paths.add(base_uri)
        } else {
          log(`Skipping non-guideline file: ${base_uri}`)
        }
      } catch (error) {
        log(`Error loading guideline at ${base_uri}: ${error.message}`)
        // Continue with other guidelines even if one fails
      }
    }
  }

  // Format all guidelines into a single prompt
  let prompt = ''

  if (guidelines_content.length === 0) {
    return prompt
  }

  // Prepare template context with prompt properties and timeline data
  const base_context = prepare_template_context({
    prompt_properties,
    timeline_entries
  })

  // Add each guideline in a structured format
  for (const guideline of guidelines_content) {
    const { entity_content, entity_properties, base_uri } = guideline

    // Extract the filename without extension from the path
    const guideline_name = extract_name_from_uri(base_uri)

    // Merge default values from guideline properties with provided context
    const final_context = merge_default_values({
      base_context,
      entity_properties
    })

    // Render the guideline content using Twig template
    let rendered_content
    try {
      rendered_content = await render_template({
        document_content: entity_content,
        template_context: final_context,
        context_name: base_uri
      })
    } catch (error) {
      log(`Template rendering error for ${base_uri}: ${error.message}`)
      // Fall back to original content if template rendering fails
      rendered_content = entity_content
    }

    // Opening tag with guideline name
    prompt += `<${guideline_name}_rules>\n\n`

    // Add the rendered content
    prompt += `${rendered_content}\n\n`

    // Closing tag with guideline name
    prompt += `</${guideline_name}_rules>\n\n`
  }

  return prompt.trim()
}
