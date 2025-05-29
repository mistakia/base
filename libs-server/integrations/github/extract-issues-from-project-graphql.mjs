/**
 * Extract and normalize GitHub issue data from GraphQL response
 * @param {Object} project_data - Project data from GraphQL response
 * @returns {Object} Extracted issues and mapping from issues to project items
 */
export const extract_issues_from_project_graphql = (project_data) => {
  const issues = []
  const project_items_by_issue = {}
  const comments_map = {}

  if (!project_data?.data?.user?.projectV2?.items?.nodes) {
    return { issues, project_items_by_issue, comments_map }
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

    // Extract comments if available
    if (issue.comments?.nodes?.length > 0) {
      // Create a unique key for this repo/issue combination
      const issue_key = `${repo_full_name}#${issue_number}`

      // Transform GraphQL comments to a consistent format matching REST API
      comments_map[issue_key] = issue.comments.nodes.map((comment) => ({
        user: {
          login: comment.author?.login || 'unknown'
        },
        created_at: comment.createdAt,
        body: comment.body,
        html_url: comment.url,
        id: comment.id
      }))
    }

    issues.push(normalized_issue)

    // Store the mapping from issue to project item for metadata extraction
    if (!project_items_by_issue[repo_full_name]) {
      project_items_by_issue[repo_full_name] = {}
    }

    project_items_by_issue[repo_full_name][issue_number] = item
  }

  return { issues, project_items_by_issue, comments_map }
}
