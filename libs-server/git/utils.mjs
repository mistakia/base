/**
 * Git utility functions shared across git operations modules
 */

/**
 * Quote a shell argument using single quotes
 * Preserves special characters like $ for regex patterns
 * Single quotes prevent all shell interpretation except for single quotes themselves
 * @param {String} arg Argument to quote
 * @returns {String} Quoted argument safe for shell
 */
export function quote_arg(arg) {
  // Replace single quotes with: end quote, escaped single quote, start quote
  const escaped = arg.replace(/'/g, "'\\''")
  return `'${escaped}'`
}

/**
 * Quote a file path for safe shell usage
 * Wraps path in double quotes and escapes special characters
 * Use this for file paths where $ and backticks should be escaped
 * @param {String} file_path File path to quote
 * @returns {String} Quoted file path safe for shell
 */
export function quote_path(file_path) {
  // Escape backslashes, double quotes, dollar signs, and backticks
  const escaped = file_path
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
  return `"${escaped}"`
}

/**
 * Convert file paths to a quoted string for shell commands
 * @param {Array<String>|String} files File path(s)
 * @returns {String} Space-separated quoted file paths
 */
export function quote_files(files) {
  const file_array = Array.isArray(files) ? files : [files]
  return file_array.map(quote_path).join(' ')
}
