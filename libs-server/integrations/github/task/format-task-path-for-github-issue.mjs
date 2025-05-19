import path from 'path'

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

export const format_entity_directory_for_github_tasks = ({
  user_base_directory
}) => {
  return `${user_base_directory}/task/github`
}

export function format_entity_directory_for_github_issue({
  github_repository_owner,
  github_repository_name,
  user_base_directory
}) {
  const github_task_directory = format_entity_directory_for_github_tasks({
    user_base_directory
  })

  return path.join(
    github_task_directory,
    `${github_repository_owner}/${github_repository_name}`
  )
}

/**
 * Format the task path for a GitHub issue
 * @param {Object} options - Function options
 * @param {string} options.github_repository_owner - The owner of the GitHub repository
 * @param {string} options.github_repository_name - The name of the GitHub repository
 * @param {string} options.github_issue_number - The number of the GitHub issue
 * @param {string} options.user_base_directory - The base directory of the user
 * @param {string} options.github_issue_title - The title of the GitHub issue
 * @returns {string} The formatted absolute path to the task file
 */
export function format_entity_absolute_path_for_github_issue({
  github_repository_owner,
  github_repository_name,
  github_issue_number,
  user_base_directory,
  github_issue_title
}) {
  // Generate slug from title
  const github_issue_title_slug = slugify(github_issue_title, {
    lower: true,
    remove: /[*+~.()'"!:@]/g
  })

  const github_entity_directory_for_github_issue =
    format_entity_directory_for_github_issue({
      github_repository_owner,
      github_repository_name,
      user_base_directory
    })

  return path.join(
    github_entity_directory_for_github_issue,
    `${github_issue_number}-${github_issue_title_slug}.md`
  )
}
