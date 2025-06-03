/**
 * @typedef {Object} PromptComponent
 * @property {string} type - The type of component
 * @property {boolean} required - Whether this component is required
 * @property {string} content - The content of the component
 */

/**
 * @typedef {Object} PromptStructure
 * @property {PromptComponent} system_prompt - Base system instructions
 * @property {PromptComponent} workflow_prompt - Workflow-specific instructions
 * @property {PromptComponent} guidelines_prompt - Relevant guidelines
 * @property {PromptComponent} tools - Tool definitions available to the thread
 * @property {PromptComponent} context - Thread memory, timeline and other context
 */

/**
 * Default prompt structure with required/optional flags
 * @type {Object.<string, {required: boolean, description: string}>}
 */
export const prompt_components = {
  system_prompt: {
    required: true,
    description:
      'Base system instructions defining the assistant capabilities and limitations'
  },
  workflow_prompt: {
    required: false,
    description: 'Instructions specific to the workflow being executed'
  },
  guidelines_prompt: {
    required: false,
    description: 'Relevant guidelines that apply to the current context'
  },
  tools: {
    required: false,
    description: 'Tool definitions available for use in the thread'
  },
  context: {
    required: false,
    description: 'Thread memory, timeline entries, and knowledge base context'
  }
}

/**
 * Validate if a prompt structure has all required components
 *
 * @param {Object} prompt_object - The prompt object to validate
 * @returns {boolean} - Whether the prompt is valid
 */
export function validate_prompt_structure(prompt_object) {
  if (!prompt_object) return false

  // Check that all required components are present
  for (const [component_name, config] of Object.entries(prompt_components)) {
    if (
      config.required &&
      (!prompt_object[component_name] || !prompt_object[component_name].content)
    ) {
      return false
    }
  }

  return true
}

export default {
  prompt_components,
  validate_prompt_structure
}
