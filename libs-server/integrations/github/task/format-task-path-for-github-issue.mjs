import path from 'path'
import { slugify } from '../slugify.mjs'

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
  const github_issue_title_slug = slugify(github_issue_title)

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
