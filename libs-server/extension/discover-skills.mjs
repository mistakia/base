import { existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'

import frontMatter from 'front-matter'

import { discover_extensions } from './discover-extensions.mjs'

/**
 * Discover skills from extension directories and workflow directories.
 *
 * Scans:
 * 1. Extension skill/ subdirectories
 * 2. SKILL.md at each extension root
 * 3. Workflow directories for entities with type: skill or type: workflow
 *
 * @param {Object} options
 * @param {string[]} options.extension_paths - Extension directory paths
 * @param {string[]} options.workflow_paths - Workflow directory paths
 * @returns {Object[]} Array of skill metadata objects
 */
export function discover_skills({ extension_paths = [], workflow_paths = [] }) {
  const skills = []

  const extensions = discover_extensions(extension_paths)
  for (const extension of extensions) {
    skills.push(...discover_extension_skills(extension))
  }

  for (const workflow_dir of workflow_paths) {
    skills.push(...discover_workflow_skills(workflow_dir))
  }

  return skills
}

/**
 * Discover skills within a single extension directory.
 *
 * @param {Object} extension - Extension metadata from discover_extensions
 * @returns {Object[]} Array of skill metadata
 */
function discover_extension_skills(extension) {
  const skills = []

  // Check skill/ subdirectory
  const skill_dir = path.join(extension.extension_path, 'skill')
  if (existsSync(skill_dir)) {
    try {
      const entries = readdirSync(skill_dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue
        const skill_path = path.join(skill_dir, entry.name)
        const metadata = parse_skill_file(skill_path, extension.name)
        if (metadata) skills.push(metadata)
      }
    } catch {
      // Skip unreadable skill directories
    }
  }

  // Check SKILL.md at extension root
  const skill_md_path = path.join(extension.extension_path, 'SKILL.md')
  if (existsSync(skill_md_path)) {
    const metadata = parse_skill_file(skill_md_path, extension.name)
    if (metadata) skills.push(metadata)
  }

  return skills
}

/**
 * Discover skills from a workflow directory.
 * Includes entities with type: skill or type: workflow.
 *
 * @param {string} workflow_dir - Absolute path to workflow directory
 * @returns {Object[]} Array of skill metadata
 */
function discover_workflow_skills(workflow_dir) {
  if (!workflow_dir || !existsSync(workflow_dir)) return []

  const skills = []
  try {
    const entries = readdirSync(workflow_dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const file_path = path.join(workflow_dir, entry.name)
      const metadata = parse_skill_file(file_path, null)
      if (metadata) skills.push(metadata)
    }
  } catch {
    // Skip unreadable workflow directories
  }

  return skills
}

/**
 * Parse a skill/workflow markdown file for metadata.
 *
 * @param {string} file_path - Absolute path to the markdown file
 * @param {string|null} extension_name - Source extension name, or null for workflows
 * @returns {Object|null} Skill metadata or null if invalid
 */
function parse_skill_file(file_path, extension_name) {
  try {
    const content = readFileSync(file_path, 'utf-8')
    const parsed = frontMatter(content)
    const attributes = parsed.attributes || {}
    const type = attributes.type || ''

    if (type && type !== 'skill' && type !== 'workflow') return null

    return {
      name:
        attributes.title || attributes.name || path.basename(file_path, '.md'),
      description: attributes.description || '',
      type: type || 'skill',
      extension: extension_name,
      file_path
    }
  } catch {
    return null
  }
}
