/**
 * Shared validation module for base_uri validation in relations.
 * Centralizes validation logic for reuse across extraction, parsing, and analysis.
 */

/**
 * Valid prefixes for base_uri values
 * These are the only valid schemes for entity references
 */
export const VALID_BASE_URI_PREFIXES = [
  'user:',
  'sys:',
  'ssh://',
  'git://',
  'https://',
  'http://'
]

/**
 * Invalid pseudo-schemes that look like valid URIs but are not supported
 */
export const INVALID_PSEUDO_SCHEMES = ['thread:', 'entity:', 'scheme:', 'github:']

/**
 * Regex pattern to detect template syntax: ${...}, $var, {{...}}
 */
const TEMPLATE_SYNTAX_REGEX = /\$\{|\$[a-zA-Z_]|\{\{/

/**
 * Regex pattern to detect ellipsis patterns
 */
const ELLIPSIS_REGEX = /\.\.\./

/**
 * Regex pattern to detect bash conditionals: [[ -n, [[ -z, etc.
 * These start with a dash after the opening brackets
 */
const BASH_CONDITIONAL_REGEX = /^\s*-[a-zA-Z]/

/**
 * Regex pattern to detect bare words without path structure
 * Valid base_uris should have either / or . (for extensions)
 */
const BARE_WORD_REGEX = /^[a-zA-Z_][a-zA-Z0-9_-]*$/

/**
 * Regex pattern to detect code expressions with commas, braces outside templates
 * Excludes cases already caught by template syntax
 */
const CODE_EXPRESSION_REGEX = /[,{}[\]]/

/**
 * Regex pattern to detect redacted content (block characters)
 */
const REDACTED_CONTENT_REGEX = /█/

/**
 * Regex pattern to detect known placeholder/example names
 * These are common patterns used in documentation examples
 * Only matches exact placeholder filenames (e.g., example.md, my-task.md)
 */
const PLACEHOLDER_PATTERN_REGEX =
  /^(user:|sys:)(task|guideline|workflow|schema|text)\/(base\/)?(task-name|example|foo|bar|test|sample|placeholder|my-task|your-task|new-task)\.md$/i

/**
 * Validation error reasons
 */
export const VALIDATION_ERRORS = {
  MISSING_PREFIX: 'missing_valid_prefix',
  INVALID_PSEUDO_SCHEME: 'invalid_pseudo_scheme',
  TEMPLATE_SYNTAX: 'template_syntax',
  ELLIPSIS_PATTERN: 'ellipsis_pattern',
  BASH_CONDITIONAL: 'bash_conditional',
  BARE_WORD: 'bare_word',
  CODE_EXPRESSION: 'code_expression',
  REDACTED_CONTENT: 'redacted_content',
  PLACEHOLDER_NAME: 'placeholder_name',
  EMPTY_OR_INVALID: 'empty_or_invalid'
}

/**
 * Check if a base_uri has a valid prefix
 * @param {string} base_uri - The base_uri to check
 * @returns {boolean} True if the base_uri starts with a valid prefix
 */
function has_valid_prefix(base_uri) {
  return VALID_BASE_URI_PREFIXES.some((prefix) => base_uri.startsWith(prefix))
}

/**
 * Check if a base_uri uses an invalid pseudo-scheme
 * @param {string} base_uri - The base_uri to check
 * @returns {boolean} True if the base_uri uses an invalid pseudo-scheme
 */
function has_invalid_pseudo_scheme(base_uri) {
  return INVALID_PSEUDO_SCHEMES.some((scheme) => base_uri.startsWith(scheme))
}

/**
 * Get a validation error reason for an invalid base_uri
 * @param {Object} params
 * @param {string} params.base_uri - The base_uri to validate
 * @returns {string|null} Error reason string, or null if valid
 */
export function get_validation_error({ base_uri }) {
  if (!base_uri || typeof base_uri !== 'string') {
    return VALIDATION_ERRORS.EMPTY_OR_INVALID
  }

  const trimmed = base_uri.trim()
  if (!trimmed) {
    return VALIDATION_ERRORS.EMPTY_OR_INVALID
  }

  // Check for redacted content
  if (REDACTED_CONTENT_REGEX.test(trimmed)) {
    return VALIDATION_ERRORS.REDACTED_CONTENT
  }

  // Check for template syntax
  if (TEMPLATE_SYNTAX_REGEX.test(trimmed)) {
    return VALIDATION_ERRORS.TEMPLATE_SYNTAX
  }

  // Check for ellipsis patterns
  if (ELLIPSIS_REGEX.test(trimmed)) {
    return VALIDATION_ERRORS.ELLIPSIS_PATTERN
  }

  // Check for bash conditionals
  if (BASH_CONDITIONAL_REGEX.test(trimmed)) {
    return VALIDATION_ERRORS.BASH_CONDITIONAL
  }

  // Check for invalid pseudo-schemes
  if (has_invalid_pseudo_scheme(trimmed)) {
    return VALIDATION_ERRORS.INVALID_PSEUDO_SCHEME
  }

  // Check for code expressions
  if (CODE_EXPRESSION_REGEX.test(trimmed)) {
    return VALIDATION_ERRORS.CODE_EXPRESSION
  }

  // Check for bare words
  if (BARE_WORD_REGEX.test(trimmed)) {
    return VALIDATION_ERRORS.BARE_WORD
  }

  // Check for placeholder names
  if (PLACEHOLDER_PATTERN_REGEX.test(trimmed)) {
    return VALIDATION_ERRORS.PLACEHOLDER_NAME
  }

  // Must have a valid prefix
  if (!has_valid_prefix(trimmed)) {
    return VALIDATION_ERRORS.MISSING_PREFIX
  }

  return null
}

/**
 * Validate a base_uri for use in relations
 * @param {Object} params
 * @param {string} params.base_uri - The base_uri to validate
 * @returns {boolean} True if the base_uri is valid for use in relations
 */
export function is_valid_base_uri({ base_uri }) {
  return get_validation_error({ base_uri }) === null
}
