import debug from 'debug'

const log = debug('metadata:title-prompt')

// Bump this when the title prompt template or analysis logic changes.
// Threads analyzed with an older version become re-eligible for re-analysis,
// mirroring the version-gating pattern used by tag classification.
// v1 (2026-04-12): initial extraction from parse-analysis-output.mjs with
// multi-message context support and Ollama JSON schema enforcement.
// v2 (2026-04-19): removed few-shot examples. Low-signal sessions (meta-only
// messages that slipped past the filter) were producing titles that echoed
// the example text (e.g. "Trey McBride Week 9") regardless of actual intent.
// Input filtering is now the first line of defense; the prompt describes
// constraints abstractly instead of demonstrating them with concrete names.
const TITLE_PROMPT_VERSION = 2

// Production model for title generation. Selected in the 2026-04-12 cross-
// model survey on the 25-case metadata benchmark: devstral-small-2:24b scored
// composite 0.755 (keyword_recall 0.857) at 7.5s avg latency, beating
// gemma4:26b (0.681 / 0.797 / 2.4s) and qwen2.5:72b (0.708 / 0.783 / 26.9s).
// Gemma4 wins on latency but loses on primary metric (keyword recall); 7.5s
// is well inside the budget for async queue processing, so we pick quality.
// Results artifact: config/metadata-benchmarks/results/title-survey-v1-2026-04-12.json
const TITLE_GENERATION_MODEL = 'ollama/devstral-small-2:24b'

// Ollama `format` schema for structured title generation output.
// `short_description` is optional so the model can return a title-only
// response when it cannot confidently summarize the session.
const TITLE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', maxLength: 100 },
    short_description: { type: 'string', maxLength: 200 }
  },
  required: ['title']
}

/**
 * Generate the title-analysis prompt for a thread.
 *
 * Accepts either a single user message (legacy) or a concatenated
 * multi-message block produced by `extract_user_messages` (messages joined
 * by `\n\n---\n\n`). The prompt template instructs the model to treat the
 * entire block as one coding-session request.
 *
 * @param {Object} params
 * @param {string} params.user_message - User message(s) from the thread
 * @returns {string} Prompt for the model
 */
export const generate_title_prompt = ({ user_message }) => {
  log(`Generating title prompt (${user_message?.length || 0} chars)`)

  return `Generate metadata for this coding session request. The block below may contain multiple user messages separated by \`---\`; treat them as one session and summarize the overall intent.

"""
${user_message}
"""

Rules for globally unique titles:
- Extract specific entities present in the input: names, URLs, dates, numbers, identifiers, file paths, workflow names.
- For workflow invocations, include the unique parameters that appear in the input (short IDs, names, numbers).
- Do not use generic titles like "Execute workflow", "Analyze thread", or "Run analysis".
- Include disambiguating context from the input that makes this instance unique.
- If the block contains multiple topics, pick the one that produces concrete work output.
- Only use entities that literally appear in the input. Do not invent names, numbers, or identifiers. If the input contains no substantive request, return a short, faithful summary of what it actually says rather than fabricating a topic.

JSON response:
- "title": Under 100 chars with specific identifiers drawn from the input.
- "short_description": 1-2 sentences under 200 chars.

\`\`\`json
{
  "title": "...",
  "short_description": "..."
}
\`\`\``
}

export { TITLE_PROMPT_VERSION, TITLE_OUTPUT_SCHEMA, TITLE_GENERATION_MODEL }
