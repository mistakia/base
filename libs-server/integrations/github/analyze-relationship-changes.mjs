import debug from 'debug'

const log = debug('github:analyze-relationships')

/**
 * Parse a relation string to extract type and target
 * @param {string} relation - Relation string like "subtask_of [[user:task/github/owner/repo/123-title]]"
 * @returns {Object|null} Parsed relation or null if invalid
 */
function parse_relation_string(relation) {
  if (!relation || typeof relation !== 'string') {
    return null
  }

  const match = relation.match(/^(\w+)\s*\[\[([^\]]+)\]\]/)
  if (!match) {
    return null
  }

  const [, type, target] = match
  return { type, target }
}

/**
 * Extract GitHub repository and issue information from a base_uri
 * @param {string} base_uri - Base URI like "user:task/github/owner/repo/123-title.md"
 * @returns {Object|null} GitHub info or null if not a GitHub task
 */
function extract_github_info_from_base_uri(base_uri) {
  if (!base_uri || typeof base_uri !== 'string') {
    return null
  }

  // Match pattern: user:task/github/{owner}/{repo}/{number}-{title}.md
  const match = base_uri.match(/^user:task\/github\/([^/]+)\/([^/]+)\/(\d+)-.*\.md$/)
  if (!match) {
    return null
  }

  const [, owner, repo, number] = match
  return {
    github_repository_owner: owner,
    github_repository_name: repo,
    github_issue_number: parseInt(number, 10)
  }
}

/**
 * Categorize a relation by type
 * @param {string} relation_type - The relation type (subtask_of, has_subtask, relates_to)
 * @returns {string} Category (parent_child or cross_reference)
 */
function categorize_relation_type(relation_type) {
  if (['subtask_of', 'has_subtask'].includes(relation_type)) {
    return 'parent_child'
  }
  if (relation_type === 'relates_to') {
    return 'cross_reference'
  }
  return 'unknown'
}

/**
 * Analyze relationship changes between old and new relations arrays
 * @param {Object} params - Parameters
 * @param {Array} params.from - Previous relations array
 * @param {Array} params.to - New relations array
 * @returns {Object} Categorized changes by relationship type
 */
export function analyze_relationship_changes({ from = [], to = [] }) {
  log('Analyzing relationship changes')
  log(`From: ${from.length} relations, To: ${to.length} relations`)

  const changes = {
    parent_child: [],
    cross_references: [],
    summary: {
      total_added: 0,
      total_removed: 0,
      parent_child_changes: 0,
      cross_reference_changes: 0
    }
  }

  // Find added relations
  const added_relations = to.filter(rel => !from.includes(rel))

  // Find removed relations
  const removed_relations = from.filter(rel => !to.includes(rel))

  log(`Added: ${added_relations.length}, Removed: ${removed_relations.length}`)

  // Process added relations
  for (const relation of added_relations) {
    const parsed = parse_relation_string(relation)
    if (!parsed) {
      log(`Skipping invalid relation format: ${relation}`)
      continue
    }

    const github_info = extract_github_info_from_base_uri(parsed.target)
    if (!github_info) {
      log(`Skipping non-GitHub relation: ${relation}`)
      continue
    }

    const category = categorize_relation_type(parsed.type)

    const change_entry = {
      action: 'add',
      relation_type: parsed.type,
      target_base_uri: parsed.target,
      ...github_info,
      original_relation: relation
    }

    if (category === 'parent_child') {
      changes.parent_child.push(change_entry)
      changes.summary.parent_child_changes++
    } else if (category === 'cross_reference') {
      changes.cross_references.push(change_entry)
      changes.summary.cross_reference_changes++
    }

    changes.summary.total_added++
  }

  // Process removed relations
  for (const relation of removed_relations) {
    const parsed = parse_relation_string(relation)
    if (!parsed) {
      log(`Skipping invalid relation format: ${relation}`)
      continue
    }

    const github_info = extract_github_info_from_base_uri(parsed.target)
    if (!github_info) {
      log(`Skipping non-GitHub relation: ${relation}`)
      continue
    }

    const category = categorize_relation_type(parsed.type)

    const change_entry = {
      action: 'remove',
      relation_type: parsed.type,
      target_base_uri: parsed.target,
      ...github_info,
      original_relation: relation
    }

    if (category === 'parent_child') {
      changes.parent_child.push(change_entry)
      changes.summary.parent_child_changes++
    } else if (category === 'cross_reference') {
      changes.cross_references.push(change_entry)
      changes.summary.cross_reference_changes++

      // Log warning about cross-reference removal limitation
      log(`Warning: Cross-reference removal not supported by GitHub API: ${relation}`)
    }

    changes.summary.total_removed++
  }

  log(`Analysis complete: ${changes.summary.total_added} added, ${changes.summary.total_removed} removed`)
  log(`Parent/child changes: ${changes.summary.parent_child_changes}, Cross-reference changes: ${changes.summary.cross_reference_changes}`)

  return changes
}

/**
 * Validate that a relationship change is actionable on GitHub
 * @param {Object} change - A relationship change object
 * @returns {Object} Validation result with success and reason
 */
export function validate_relationship_change(change) {
  if (!change || typeof change !== 'object') {
    return { valid: false, reason: 'Invalid change object' }
  }

  // Check required fields
  if (!change.action || !change.relation_type || !change.github_repository_owner ||
      !change.github_repository_name || !change.github_issue_number) {
    return { valid: false, reason: 'Missing required fields' }
  }

  // Validate GitHub info
  if (typeof change.github_issue_number !== 'number' || change.github_issue_number <= 0) {
    return { valid: false, reason: 'Invalid GitHub issue number' }
  }

  // Check for unsupported operations
  if (change.action === 'remove' && change.relation_type === 'relates_to') {
    return {
      valid: false,
      reason: 'Cross-reference removal not supported by GitHub API',
      warning: true
    }
  }

  return { valid: true }
}

/**
 * Filter relationship changes to only include those that can be synced to GitHub
 * @param {Object} changes - Result from analyze_relationship_changes
 * @returns {Object} Filtered changes with only actionable items
 */
export function filter_actionable_relationship_changes(changes) {
  const filtered = {
    parent_child: [],
    cross_references: [],
    summary: {
      total_actionable: 0,
      parent_child_actionable: 0,
      cross_reference_actionable: 0,
      skipped: 0
    }
  }

  // Filter parent/child changes
  for (const change of changes.parent_child) {
    const validation = validate_relationship_change(change)
    if (validation.valid) {
      filtered.parent_child.push(change)
      filtered.summary.parent_child_actionable++
      filtered.summary.total_actionable++
    } else {
      log(`Skipping parent/child change: ${validation.reason}`)
      filtered.summary.skipped++
    }
  }

  // Filter cross-reference changes
  for (const change of changes.cross_references) {
    const validation = validate_relationship_change(change)
    if (validation.valid) {
      filtered.cross_references.push(change)
      filtered.summary.cross_reference_actionable++
      filtered.summary.total_actionable++
    } else {
      if (validation.warning) {
        log(`Warning: ${validation.reason} - ${change.original_relation}`)
      } else {
        log(`Skipping cross-reference change: ${validation.reason}`)
      }
      filtered.summary.skipped++
    }
  }

  log(`Filtered to ${filtered.summary.total_actionable} actionable changes (${filtered.summary.skipped} skipped)`)

  return filtered
}
