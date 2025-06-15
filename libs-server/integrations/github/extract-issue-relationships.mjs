import debug from 'debug'

const log = debug('github:extract-relationships')

/**
 * Creates a slug from a string by converting to lowercase, replacing spaces with hyphens,
 * and removing special characters
 *
 * @param {string} text - The text to slugify
 * @param {Object} options - Slugify options
 * @param {boolean} [options.lower=true] - Convert to lowercase
 * @param {RegExp} [options.remove=/[*+~.()'"!:@]/g] - Characters to remove
 * @returns {string} - Slugified string
 */
function slugify(text, options = {}) {
  const { lower = true, remove = /[*+~.()'"!:@]/g } = options

  let result = text.toString()

  // Remove specified characters
  if (remove) {
    result = result.replace(remove, '')
  }

  // Convert to lowercase if option is enabled
  if (lower) {
    result = result.toLowerCase()
  }

  // Replace spaces and other characters with hyphens
  result = result
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/&/g, '-and-') // Replace & with 'and'
    .replace(/[^\w-]+/g, '') // Remove all non-word characters except hyphens
    .replace(/--+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+/, '') // Trim hyphens from start
    .replace(/-+$/, '') // Trim hyphens from end

  return result
}

/**
 * Generate base_uri for a GitHub issue task
 * @param {Object} issue - GitHub issue object
 * @param {string} issue.number - Issue number
 * @param {string} issue.title - Issue title
 * @param {Object} issue.repository - Repository information
 * @param {string} issue.repository.name - Repository name
 * @param {Object} issue.repository.owner - Repository owner
 * @param {string} issue.repository.owner.login - Repository owner login
 * @returns {string} Base URI for the task
 */
export function generate_github_issue_task_base_uri(issue) {
  if (!issue || !issue.repository) {
    return null
  }

  const owner = issue.repository.owner.login
  const repo = issue.repository.name
  const number = issue.number
  const title_slug = slugify(issue.title, {
    lower: true,
    remove: /[*+~.()'"!:@]/g
  })

  return `user:task/github/${owner}/${repo}/${number}-${title_slug}.md`
}

/**
 * Extract parent/child relationships from GitHub issue data
 * @param {Object} issue - GitHub issue object with parent and subIssues fields
 * @returns {Array<string>} Array of relation strings
 */
export function extract_parent_child_relationships(issue) {
  const relations = []

  try {
    // Handle parent relationship (this issue is a subtask)
    if (issue.parent) {
      const parent_base_uri = generate_github_issue_task_base_uri(issue.parent)
      if (parent_base_uri) {
        relations.push(`subtask_of [[${parent_base_uri}]]`)
        log(`Added subtask_of relation to parent issue #${issue.parent.number}`)
      }
    }

    // Handle child relationships (this issue has subtasks)
    if (issue.subIssues && issue.subIssues.nodes) {
      for (const subIssue of issue.subIssues.nodes) {
        const child_base_uri = generate_github_issue_task_base_uri(subIssue)
        if (child_base_uri) {
          relations.push(`has_subtask [[${child_base_uri}]]`)
          log(`Added has_subtask relation to child issue #${subIssue.number}`)
        }
      }
    }
  } catch (error) {
    log(`Error extracting parent/child relationships: ${error.message}`)
  }

  return relations
}

/**
 * Extract cross-reference relationships from GitHub timeline events
 * @param {Object} issue - GitHub issue object
 * @param {Array} issue.timelineItems.nodes - Timeline items with CrossReferencedEvent
 * @returns {Array<string>} Array of relation strings
 */
export function extract_cross_reference_relationships(issue) {
  const relations = []

  try {
    if (!issue.timelineItems || !issue.timelineItems.nodes) {
      return relations
    }

    for (const timelineItem of issue.timelineItems.nodes) {
      if (timelineItem.__typename === 'CrossReferencedEvent') {
        // Check if this issue is the source (it referenced another issue)
        if (
          timelineItem.source &&
          timelineItem.source.id === issue.id &&
          timelineItem.target
        ) {
          const target_base_uri = generate_github_issue_task_base_uri(
            timelineItem.target
          )
          if (target_base_uri) {
            relations.push(`relates_to [[${target_base_uri}]]`)
            log(
              `Added relates_to relation to referenced issue #${timelineItem.target.number}`
            )
          }
        }

        // Check if this issue is the target (another issue referenced it)
        if (
          timelineItem.target &&
          timelineItem.target.id === issue.id &&
          timelineItem.source
        ) {
          const source_base_uri = generate_github_issue_task_base_uri(
            timelineItem.source
          )
          if (source_base_uri) {
            relations.push(`relates_to [[${source_base_uri}]]`)
            log(
              `Added relates_to relation from referencing issue #${timelineItem.source.number}`
            )
          }
        }
      }
    }
  } catch (error) {
    log(`Error extracting cross-reference relationships: ${error.message}`)
  }

  return relations
}

/**
 * Extract all relationships from a GitHub issue
 * @param {Object} issue - GitHub issue object with relationship data
 * @returns {Array<string>} Array of relation strings in entity format
 */
export function extract_issue_relationships(issue) {
  if (!issue) {
    return []
  }

  log(`Extracting relationships for issue #${issue.number}: ${issue.title}`)

  const relations = []

  // Extract parent/child relationships
  const parent_child_relations = extract_parent_child_relationships(issue)
  relations.push(...parent_child_relations)

  // Extract cross-reference relationships
  const cross_reference_relations = extract_cross_reference_relationships(issue)
  relations.push(...cross_reference_relations)

  // Remove duplicates while preserving order
  const unique_relations = [...new Set(relations)]

  log(
    `Extracted ${unique_relations.length} unique relationships for issue #${issue.number}`
  )

  return unique_relations
}
