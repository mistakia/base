/**
 * Test fixtures for GitHub webhook payloads.
 */

// ============================================================================
// Base Objects
// ============================================================================

export const base_repository = {
  id: 123456789,
  name: 'test-repo',
  full_name: 'test-org/test-repo',
  private: false,
  owner: {
    login: 'test-org',
    id: 98765,
    node_id: 'MDEyOk9yZ2FuaXphdGlvbjE=',
    avatar_url: 'https://avatars.githubusercontent.com/u/98765?v=4',
    url: 'https://api.github.com/users/test-org',
    html_url: 'https://github.com/test-org',
    type: 'Organization'
  },
  html_url: 'https://github.com/test-org/test-repo',
  description: 'Test repository for webhook handling',
  fork: false,
  url: 'https://api.github.com/repos/test-org/test-repo',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  pushed_at: '2024-01-01T00:00:00Z',
  git_url: 'git://github.com/test-org/test-repo.git',
  ssh_url: 'git@github.com:test-org/test-repo.git',
  clone_url: 'https://github.com/test-org/test-repo.git',
  size: 1000,
  stargazers_count: 0,
  watchers_count: 0,
  language: 'JavaScript',
  has_issues: true,
  has_projects: true,
  has_downloads: true,
  has_wiki: true,
  has_pages: false,
  has_discussions: false,
  forks_count: 0,
  archived: false,
  disabled: false,
  open_issues_count: 1,
  license: null,
  allow_forking: true,
  is_template: false,
  web_commit_signoff_required: false,
  topics: [],
  visibility: 'public',
  forks: 0,
  open_issues: 1,
  watchers: 0,
  default_branch: 'main'
}

export const base_sender = {
  login: 'test-user',
  id: 12345,
  node_id: 'MDQ6VXNlcjE=',
  avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
  url: 'https://api.github.com/users/test-user',
  html_url: 'https://github.com/test-user',
  type: 'User',
  site_admin: false
}

export const base_issue = {
  id: 1234567890,
  node_id: 'I_kwDOBxxxxxx',
  number: 42,
  title: 'Test GitHub Issue',
  body: 'This is a test GitHub issue for webhook testing.\n\n## Details\n- Point 1\n- Point 2',
  state: 'open',
  html_url: 'https://github.com/test-org/test-repo/issues/42',
  url: 'https://api.github.com/repos/test-org/test-repo/issues/42',
  created_at: '2024-01-02T12:00:00Z',
  updated_at: '2024-01-03T14:30:00Z',
  closed_at: null,
  labels: [
    {
      id: 'label1',
      name: 'bug',
      color: 'ff0000'
    },
    {
      id: 'label2',
      name: 'priority:high',
      color: '00ff00'
    }
  ],
  user: {
    login: 'test-user',
    id: 12345,
    node_id: 'MDQ6VXNlcjE=',
    avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
    url: 'https://api.github.com/users/test-user',
    html_url: 'https://github.com/test-user',
    type: 'User'
  },
  assignees: [],
  milestone: null,
  comments: 0,
  locked: false
}

// ============================================================================
// Issue Webhook Payloads
// ============================================================================

export const issue_opened_webhook = {
  action: 'opened',
  issue: base_issue,
  repository: base_repository,
  sender: base_sender
}

export const issue_closed_webhook = {
  action: 'closed',
  issue: {
    ...base_issue,
    state: 'closed',
    closed_at: '2024-01-04T10:00:00Z'
  },
  repository: base_repository,
  sender: base_sender
}

export const issue_edited_webhook = {
  action: 'edited',
  issue: {
    ...base_issue,
    title: 'Updated Test GitHub Issue',
    body: 'This issue has been edited.\n\n## Updated Details\n- New point 1\n- New point 2',
    updated_at: '2024-01-05T16:00:00Z'
  },
  changes: {
    title: {
      from: 'Test GitHub Issue'
    },
    body: {
      from: 'This is a test GitHub issue for webhook testing.\n\n## Details\n- Point 1\n- Point 2'
    }
  },
  repository: base_repository,
  sender: base_sender
}

export const issue_reopened_webhook = {
  action: 'reopened',
  issue: {
    ...base_issue,
    state: 'open',
    closed_at: null,
    updated_at: '2024-01-06T09:00:00Z'
  },
  repository: base_repository,
  sender: base_sender
}

/**
 * Helper function to create a customized issue webhook payload
 *
 * @param {object} params - Custom parameters for the webhook
 * @param {string} params.action - Webhook action (opened, closed, edited, etc.)
 * @param {number} params.issue_number - Issue number
 * @param {string} params.repo - Repository name (e.g., 'owner/repo')
 * @param {string} params.title - Issue title
 * @param {string} params.body - Issue body
 * @param {string} params.state - Issue state (open, closed)
 * @param {Array} params.labels - Issue labels
 * @returns {object} Customized webhook payload
 */
export function create_issue_webhook({
  action = 'opened',
  issue_number = 42,
  repo = 'test-org/test-repo',
  title = 'Test GitHub Issue',
  body = 'This is a test GitHub issue.',
  state = 'open',
  labels = []
}) {
  const [github_repository_owner, github_repository_name] = repo.split('/')
  const custom_repository = {
    ...base_repository,
    name: github_repository_name,
    full_name: repo,
    owner: {
      ...base_repository.owner,
      login: github_repository_owner
    },
    html_url: `https://github.com/${repo}`,
    url: `https://api.github.com/repos/${repo}`,
    git_url: `git://github.com/${repo}.git`,
    ssh_url: `git@github.com:${repo}.git`,
    clone_url: `https://github.com/${repo}.git`
  }

  const custom_issue = {
    ...base_issue,
    number: issue_number,
    title,
    body,
    state,
    labels: labels.length > 0 ? labels : base_issue.labels,
    html_url: `https://github.com/${repo}/issues/${issue_number}`,
    url: `https://api.github.com/repos/${repo}/issues/${issue_number}`,
    closed_at: state === 'closed' ? '2024-01-04T10:00:00Z' : null
  }

  return {
    action,
    issue: custom_issue,
    repository: custom_repository,
    sender: base_sender
  }
}

// ============================================================================
// Pull Request Webhook Payloads
// ============================================================================

export const pr_merged_webhook = {
  action: 'closed',
  number: 123,
  pull_request: {
    number: 123,
    merged: true,
    title: 'Test Pull Request',
    html_url: 'https://github.com/test-org/test-repo/pull/123',
    body: 'This is a test PR for webhook handling',
    head: {
      ref: 'feature/test-branch'
    },
    base: {
      ref: 'main'
    },
    user: {
      login: 'test-user',
      id: 12345
    }
  },
  repository: base_repository,
  sender: base_sender
}

export const pr_closed_without_merging_webhook = {
  action: 'closed',
  number: 123,
  pull_request: {
    number: 123,
    merged: false,
    title: 'Test Pull Request',
    html_url: 'https://github.com/test-org/test-repo/pull/123',
    body: 'This is a test PR for webhook handling',
    head: {
      ref: 'feature/test-branch'
    },
    base: {
      ref: 'main'
    },
    user: {
      login: 'test-user',
      id: 12345
    }
  },
  repository: base_repository,
  sender: base_sender
}

export const pr_reopened_webhook = {
  action: 'reopened',
  number: 123,
  pull_request: {
    number: 123,
    merged: false,
    title: 'Test Pull Request',
    html_url: 'https://github.com/test-org/test-repo/pull/123',
    body: 'This is a test PR for webhook handling',
    head: {
      ref: 'feature/test-branch'
    },
    base: {
      ref: 'main'
    },
    user: {
      login: 'test-user',
      id: 12345
    }
  },
  repository: base_repository,
  sender: base_sender
}

export const pr_review_submitted_webhook = {
  action: 'submitted',
  number: 123,
  review: {
    state: 'approved',
    body: 'LGTM! 👍',
    user: {
      login: 'reviewer-user',
      id: 67890
    }
  },
  pull_request: {
    number: 123,
    merged: false,
    title: 'Test Pull Request',
    html_url: 'https://github.com/test-org/test-repo/pull/123',
    body: 'This is a test PR for webhook handling',
    head: {
      ref: 'feature/test-branch'
    },
    base: {
      ref: 'main'
    },
    user: {
      login: 'test-user',
      id: 12345
    }
  },
  repository: base_repository,
  sender: {
    ...base_sender,
    login: 'reviewer-user',
    id: 67890
  }
}

/**
 * Helper function to create a customized PR merged webhook payload
 *
 * @param {object} params - Custom parameters for the webhook
 * @param {number} params.pr_number - PR number
 * @param {string} params.repo - Repository name (e.g., 'owner/repo')
 * @param {string} params.title - PR title
 * @param {string} params.branch - Feature branch name
 * @returns {object} Customized webhook payload
 */
export function create_pr_merged_webhook({
  pr_number = 123,
  repo = 'test-org/test-repo',
  title = 'Test Pull Request',
  branch = 'feature/test-branch'
}) {
  const [github_repository_owner, github_repository_name] = repo.split('/')
  const custom_repository = {
    ...base_repository,
    name: github_repository_name,
    full_name: repo,
    owner: {
      ...base_repository.owner,
      login: github_repository_owner
    },
    html_url: `https://github.com/${repo}`,
    url: `https://api.github.com/repos/${repo}`,
    git_url: `git://github.com/${repo}.git`,
    ssh_url: `git@github.com:${repo}.git`,
    clone_url: `https://github.com/${repo}.git`
  }

  return {
    action: 'closed',
    number: pr_number,
    pull_request: {
      number: pr_number,
      merged: true,
      title,
      html_url: `https://github.com/${repo}/pull/${pr_number}`,
      body: `This is a test PR for webhook handling: ${title}`,
      head: {
        ref: branch
      },
      base: {
        ref: 'main'
      },
      user: {
        login: 'test-user',
        id: 12345
      }
    },
    repository: custom_repository,
    sender: base_sender
  }
}
