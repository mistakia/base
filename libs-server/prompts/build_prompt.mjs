import debug from 'debug'
import {
  validate_prompt_structure,
  prompt_components
} from './prompt_structure.mjs'

const log = debug('prompts:build')

/**
 * Build a complete prompt from various components
 *
 * @param {Object} params Parameters
 * @param {Object} params.components Object containing prompt components
 * @param {string} [params.components.system_prompt] System instructions
 * @param {string} [params.components.activity_prompt] Activity-specific instructions
 * @param {string} [params.components.guidelines_prompt] Guidelines to include
 * @param {string} [params.components.tools] Tool definitions
 * @param {string} [params.components.context] Thread memory and context
 * @param {string} [params.components.main_request] Main query or instructions
 * @param {Object} [params.metadata] Additional metadata to include
 * @returns {Object} Complete prompt object with messages array for inference, prompt_text string,
 *                   and prompt_parts JSON representation of prompt components
 */
export default async function build_prompt({ components, metadata = {} }) {
  if (!components) {
    throw new Error('components object is required')
  }

  log('Building prompt from components')

  // Initialize structured prompt object
  const prompt_object = {}

  // Process each component
  for (const [component_name, config] of Object.entries(prompt_components)) {
    if (components[component_name]) {
      prompt_object[component_name] = {
        type: component_name,
        required: config.required,
        content: components[component_name]
      }
    } else if (config.required) {
      throw new Error(`Required component missing: ${component_name}`)
    }
  }

  // Validate the prompt structure
  const is_valid = validate_prompt_structure(prompt_object)
  if (!is_valid) {
    throw new Error('Invalid prompt structure - missing required components')
  }

  // Generate prompt text and parts
  const { prompt_text, prompt_parts } = format_prompt_text(prompt_object)

  // Add metadata
  const complete_prompt = {
    prompt_structure: prompt_object,
    metadata: {
      created_at: new Date().toISOString(),
      ...metadata
    }
  }

  return {
    ...complete_prompt,
    prompt_text,
    prompt_parts
  }
}

/**
 * Format the prompt structure as a text string and JSON parts
 *
 * @param {Object} prompt_object Structured prompt object
 * @returns {Object} Object containing prompt_text and prompt_parts
 */
function format_prompt_text(prompt_object) {
  const prompt_parts = {}
  let prompt_text = ''

  // System prompt
  if (prompt_object.system_prompt) {
    prompt_parts.system_prompt = prompt_object.system_prompt.content
    prompt_text += `${prompt_object.system_prompt.content}\n\n`
  }

  // Activity instructions
  if (prompt_object.activity_prompt) {
    prompt_parts.activity_prompt = prompt_object.activity_prompt.content
    prompt_text += `${prompt_object.activity_prompt.content}\n\n`
  }

  // Guidelines
  if (prompt_object.guidelines_prompt) {
    prompt_parts.guidelines_prompt = prompt_object.guidelines_prompt.content
    prompt_text += `${prompt_object.guidelines_prompt.content}\n\n`
  }

  // Tools
  if (prompt_object.tools) {
    prompt_parts.tools = prompt_object.tools.content
    prompt_text += `${prompt_object.tools.content}\n\n`
  }

  // Context
  if (prompt_object.context) {
    prompt_parts.context = prompt_object.context.content
    prompt_text += `${prompt_object.context.content}\n\n`
  }

  // Main request
  if (prompt_object.main_request) {
    prompt_parts.main_request = prompt_object.main_request.content
    prompt_text += `${prompt_object.main_request.content}\n\n`
  }

  return {
    prompt_text: prompt_text.trim(),
    prompt_parts
  }
}
