/**
 * Metadata analysis library
 *
 * Provides functions for generating thread metadata using OpenCode CLI
 * with local Ollama models.
 */

export {
  run_opencode,
  strip_ansi_codes,
  extract_model_response
} from './run-opencode-analysis.mjs'

export {
  parse_metadata_response,
  extract_json_from_response,
  generate_analysis_prompt
} from './parse-analysis-output.mjs'

export { analyze_thread_for_metadata } from './analyze-thread.mjs'
