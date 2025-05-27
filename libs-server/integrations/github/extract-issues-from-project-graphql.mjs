/**
 * Extract and normalize GitHub issue data from GraphQL response
 * @param {Object} project_data - Project data from GraphQL response
 * @returns {Object} Extracted issues and mapping from issues to project items
 */
export const extract_issues_from_project_graphql = (project_data) => {
  const issues = []
  const project_items_by_issue = {}

  if (!project_data?.data?.user?.projectV2?.items?.nodes) {
    return { issues, project_items_by_issue }
  }

  const project_items = project_data.data.user.projectV2.items.nodes

  for (const item of project_items) {
    // Skip items that aren't issues
    if (!item.content || item.content.__typename !== 'Issue') {
      continue
    }

    const issue = item.content
    const github_repository_owner = issue.repository.owner.login
    const github_repository_name = issue.repository.name
    const issue_number = issue.number
    const repo_full_name = `${github_repository_owner}/${github_repository_name}`

    // Convert GraphQL issue format to REST API format for compatibility
    const normalized_issue = {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body || issue.bodyText,
      state: issue.state.toLowerCase(),
      url: issue.url,
      html_url: issue.url,
      created_at: issue.createdAt,
      updated_at: issue.updatedAt,
      closed_at: issue.closedAt,
      labels:
        issue.labels?.nodes?.map((label) => ({
          id: label.id,
          name: label.name,
          color: label.color
        })) || [],
      repository: {
        name: github_repository_name,
        owner: {
          login: github_repository_owner
        }
      }
    }

    issues.push(normalized_issue)

    // Store the mapping from issue to project item for metadata extraction
    if (!project_items_by_issue[repo_full_name]) {
      project_items_by_issue[repo_full_name] = {}
    }

    project_items_by_issue[repo_full_name][issue_number] = item
  }

  return { issues, project_items_by_issue }
}
