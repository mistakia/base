import path from 'path'

import { format_github_task_path } from '../github-constants.mjs'

/**
 * Format the task path for a GitHub issue
 * @param {Object} options - Function options
 * @param {string} options.github_repository_owner - The owner of the GitHub repository
 * @param {string} options.github_repository_name - The name of the GitHub repository
 * @param {string} options.github_issue_number - The number of the GitHub issue
 * @param {string} options.user_base_directory - The base directory of the user
 * @param {string} options.task_filename_slug - The slug of the task filename
 * @returns {string} The formatted absolute path to the task file
 */
export function format_task_path_for_github_issue({
  github_repository_owner,
  github_repository_name,
  github_issue_number,
  user_base_directory,
  task_filename_slug
}) {
  const github_task_directory = format_github_task_path({
    user_base_directory
  })
  return path.join(
    github_task_directory,
    `${github_repository_owner}/${github_repository_name}/${github_issue_number}-${task_filename_slug}.md`
  )
}
