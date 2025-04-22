import debug from 'debug'

const log = debug('prompts:system')

/**
 * Default base system prompt
 */
const DEFAULT_SYSTEM_PROMPT = `You are a Base Thread Agent working in your own thread workspace. You have been assigned a specific role.
You work alongside other agents and humans to respond to inquiries and fulfill instructions.
You can create new thread agents and assign them specific roles to help you fulfill your responsibilities.
Follow instructions carefully and use the available tools to complete your tasks.`

/**
 * Generate a system prompt component
 *
 * @returns {Promise<string>} Generated system prompt component
 */
export default async function generate_system_prompt() {
  log('Using default system prompt')
  return DEFAULT_SYSTEM_PROMPT
}
