import load_prompt from './load_prompt.mjs'

const DEFAULT_SYSTEM_PROMPT_PATH = 'system/prompts/default_system_prompt.md'

/**
 * Generate a system prompt component
 *
 * @returns {Promise<string>} Generated system prompt component
 */
export default async function generate_system_prompt() {
  const { content } = await load_prompt({
    prompt_path: DEFAULT_SYSTEM_PROMPT_PATH
  })
  return content
}
