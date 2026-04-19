import { existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'

import frontMatter from 'front-matter'

/**
 * Build the standard extension directory paths from config.
 *
 * @param {Object} config - Application config with user_base_directory and system_base_directory
 * @returns {string[]} Array of extension directory paths
 */
export function get_extension_paths(config) {
  const paths = []
  if (config.user_base_directory) {
    paths.push(path.join(config.user_base_directory, 'extension'))
  }
  if (config.system_base_directory) {
    paths.push(path.join(config.system_base_directory, 'system', 'extension'))
  }
  return paths
}

/**
 * Discover extensions from an array of extension directory paths.
 *
 * Each extension is a subdirectory containing an extension.md manifest.
 * First-match-wins for duplicate extension names (earlier paths take priority).
 *
 * @param {string[]} extension_paths - Array of directory paths to scan
 * @returns {Object[]} Array of extension metadata objects
 */
export function discover_extensions(extension_paths) {
  const extensions = []
  const seen_names = new Set()

  for (const extension_dir of extension_paths) {
    if (!extension_dir || !existsSync(extension_dir)) continue

    let entries
    try {
      entries = readdirSync(extension_dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const extension_name = entry.name
      if (seen_names.has(extension_name)) continue

      const extension_path = path.join(extension_dir, extension_name)
      const manifest_path = path.join(extension_path, 'extension.md')

      const metadata = parse_extension_manifest(
        extension_name,
        extension_path,
        manifest_path
      )

      if (metadata) {
        seen_names.add(extension_name)
        extensions.push(metadata)
      }
    }
  }

  return extensions
}

/**
 * Parse an extension manifest (extension.md) and detect capabilities.
 *
 * @param {string} extension_name - Directory name of the extension
 * @param {string} extension_path - Absolute path to the extension directory
 * @param {string} manifest_path - Absolute path to extension.md
 * @returns {Object|null} Extension metadata or null if manifest missing/invalid
 */
function parse_extension_manifest(
  extension_name,
  extension_path,
  manifest_path
) {
  let attributes = {}

  if (existsSync(manifest_path)) {
    try {
      const content = readFileSync(manifest_path, 'utf-8')
      const parsed = frontMatter(content)
      attributes = parsed.attributes || {}
    } catch {
      // Malformed frontmatter -- use defaults
    }
  } else {
    // No manifest -- still register if command.mjs exists
    const has_command = existsSync(path.join(extension_path, 'command.mjs'))
    if (!has_command) return null
  }

  const has_commands = existsSync(path.join(extension_path, 'command.mjs'))
  const has_skills =
    existsSync(path.join(extension_path, 'skill')) ||
    existsSync(path.join(extension_path, 'SKILL.md'))

  // Detect provided capabilities from provide/ directory
  const provide_dir = path.join(extension_path, 'provide')
  let provided_capabilities = []
  if (existsSync(provide_dir)) {
    try {
      const provide_entries = readdirSync(provide_dir, { withFileTypes: true })
      provided_capabilities = provide_entries
        .filter((e) => e.isFile() && e.name.endsWith('.mjs'))
        .map((e) => e.name.replace(/\.mjs$/, ''))
    } catch {
      // Failed to read provide/ directory -- skip
    }
  }

  return {
    name: attributes.name || extension_name,
    description: attributes.description || '',
    requires: attributes.requires || [],
    optional: attributes.optional || [],
    provided_capabilities,
    subcommand_of: attributes.subcommand_of || null,
    has_commands,
    has_skills,
    extension_path,
    manifest_path: existsSync(manifest_path) ? manifest_path : null
  }
}
