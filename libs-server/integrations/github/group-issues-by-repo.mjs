/**
 * Group issues by repository
 * @param {Array<Object>} issues - List of GitHub issues
 * @returns {Object} Issues grouped by repository
 */
export const group_issues_by_repo = (issues) => {
  const issues_by_repo = {}

  for (const issue of issues) {
    const github_repository_owner = issue.repository.owner.login
    const github_repository_name = issue.repository.name
    const repo_full_name = `${github_repository_owner}/${github_repository_name}`

    if (!issues_by_repo[repo_full_name]) {
      issues_by_repo[repo_full_name] = {
        github_repository_owner,
        github_repository_name,
        issues: []
      }
    }

    issues_by_repo[repo_full_name].issues.push(issue)
  }

  return issues_by_repo
}
