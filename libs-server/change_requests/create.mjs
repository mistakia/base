import { v4 as uuidv4 } from 'uuid'
import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import db from '#db'
import * as git_ops from '#libs-server/git/git_operations.mjs'
import * as github_integration from '#libs-server/integrations/github/index.mjs'
import config from '#config'
import { write_markdown_entity } from '#libs-server/markdown/index.mjs'
import { CHANGE_REQUEST_DIR } from './constants.mjs'

const log = debug('change-requests')

/**
 * Creates a new change request.
 *
 * @param {object} params - Parameters for creating the change request.
 * @param {string} params.title - The title of the change request.
 * @param {string} params.description - The description of the change request.
 * @param {string} params.creator_id - The ID of the user or system entity creating the request.
 * @param {string} params.target_branch - The target branch for the changes (e.g., 'main').
 * @param {Array<{path: string, content: string}>} params.file_changes - Array of file modifications.
 * @param {boolean} [params.create_github_pr=false] - Whether to create a GitHub PR.
 * @param {string} [params.github_repo] - Required if create_github_pr is true (format: 'owner/repo').
 * @param {string} [params.related_thread_id] - Optional ID of the related worker thread.
 * @param {Array<string>} [params.tags] - Optional tags.
 * @returns {Promise<string>} The ID of the newly created change request.
 */
export async function create_change_request({
  title,
  description,
  creator_id,
  target_branch,
  file_changes = [],
  create_github_pr = false,
  github_repo,
  related_thread_id,
  tags = []
}) {
  const change_request_id = uuidv4()
  const feature_branch = `cr/${change_request_id}`
  const now = new Date()
  const repo_path = '.' // Assuming operations run from the root of the repo
  let worktree_path = null
  let github_pr_url = null
  let github_pr_number = null

  try {
    // --- Git Operations ---
    log(`Starting Git operations for change request ${change_request_id}`)

    await git_ops.create_branch({
      repo_path,
      branch_name: feature_branch,
      base_branch: target_branch
    })
    log(`Created branch ${feature_branch}`)

    worktree_path = await git_ops.create_worktree({
      repo_path,
      branch_name: feature_branch
    })
    log(`Created or found worktree at ${worktree_path}`)

    if (file_changes.length > 0) {
      await apply_file_changes({
        worktree_path,
        file_changes,
        change_request_id,
        title
      })
    } else {
      log('No file changes provided, skipping git add/commit.')
    }

    // --- GitHub Integration (Optional) ---
    if (create_github_pr) {
      const github_result = await create_github_pull_request({
        github_repo,
        title,
        feature_branch,
        target_branch,
        description,
        worktree_path
      })

      github_pr_url = github_result?.pr_url
      github_pr_number = github_result?.pr_number
    }

    // --- Database and File Operations (Transaction) ---
    log(`Starting DB transaction for change request ${change_request_id}`)
    await db.transaction(async (trx) => {
      await save_to_database({
        trx,
        change_request_id,
        status: 'PendingReview',
        title,
        creator_id,
        now,
        target_branch,
        feature_branch,
        github_pr_url,
        github_pr_number,
        github_repo,
        related_thread_id
      })

      await create_markdown_file({
        change_request_id,
        title,
        description,
        creator_id,
        now,
        target_branch,
        feature_branch,
        status: 'PendingReview',
        github_pr_url,
        github_pr_number,
        github_repo,
        related_thread_id,
        tags
      })
    })

    log(`Change request ${change_request_id} created successfully.`)
    return change_request_id
  } catch (error) {
    log(`Error creating change request ${change_request_id}:`, error)
    throw error
  } finally {
    if (worktree_path) {
      log(`Cleaning up worktree ${worktree_path}`)
      await git_ops.remove_worktree({
        repo_path,
        worktree_path
      })
    }
  }
}

// Helper function to apply file changes to the worktree
async function apply_file_changes({
  worktree_path,
  file_changes,
  change_request_id,
  title
}) {
  const changed_file_paths = []

  for (const change of file_changes) {
    const full_file_path = path.resolve(worktree_path, change.path)
    const dir_name = path.dirname(full_file_path)

    await fs.mkdir(dir_name, { recursive: true })
    await fs.writeFile(full_file_path, change.content)
    changed_file_paths.push(change.path)
    log(`Wrote file ${change.path} in worktree`)
  }

  await git_ops.add_files({
    worktree_path,
    files_to_add: changed_file_paths
  })
  log(`Staged ${changed_file_paths.length} files`)

  const commit_message = `feat: Apply changes for change request ${change_request_id}\n\n${title}`
  await git_ops.commit_changes({ worktree_path, commit_message })
  log('Committed changes to feature branch')
}

// Helper function to create a GitHub PR
async function create_github_pull_request({
  github_repo,
  title,
  feature_branch,
  target_branch,
  description,
  worktree_path
}) {
  if (!github_repo) {
    throw new Error('github_repo is required when create_github_pr is true.')
  }

  log(`Pushing branch ${feature_branch} to GitHub for PR creation`)
  try {
    await git_ops.push_branch({
      repo_path: worktree_path,
      branch_name: feature_branch
    })

    const github_token = config.github_access_token
    if (!github_token) {
      log(
        'Warning: GITHUB_TOKEN not found in environment, skipping PR creation'
      )
      return {}
    }

    log(`Creating GitHub PR in ${github_repo}`)
    const pr_result = await github_integration.create_pull_request({
      repo: github_repo,
      title,
      head: feature_branch,
      base: target_branch,
      body: description || '',
      github_token
    })

    log(`Created GitHub PR #${pr_result.number}: ${pr_result.html_url}`)
    return {
      pr_url: pr_result.html_url,
      pr_number: pr_result.number
    }
  } catch (github_error) {
    log(`Warning: GitHub integration error: ${github_error.message}`)
    return {}
  }
}

// Helper function to save change request to database
async function save_to_database({
  trx,
  change_request_id,
  status,
  title,
  creator_id,
  now,
  target_branch,
  feature_branch,
  github_pr_url,
  github_pr_number,
  github_repo,
  related_thread_id
}) {
  const [inserted_record] = await trx('change_requests')
    .insert({
      change_request_id,
      status,
      title,
      creator_id,
      created_at: now,
      updated_at: now,
      target_branch,
      feature_branch,
      github_pr_url,
      github_pr_number,
      github_repo,
      related_thread_id
    })
    .returning('change_request_id')

  if (!inserted_record || !inserted_record.change_request_id) {
    throw new Error('Failed to insert change request into database.')
  }

  log(`Inserted DB record for ${change_request_id}`)
}

// Helper function to create markdown file for change request
async function create_markdown_file({
  change_request_id,
  title,
  description,
  creator_id,
  now,
  target_branch,
  feature_branch,
  status,
  github_pr_url,
  github_pr_number,
  github_repo,
  related_thread_id,
  tags
}) {
  const frontmatter = {
    change_request_id,
    title,
    description: description || '',
    creator_id,
    created_at: now.toISOString(),
    target_branch,
    feature_branch,
    status,
    github_pr_url,
    github_pr_number,
    github_repo,
    related_thread_id,
    tags,
    type: 'change_request'
  }

  const file_path = `${CHANGE_REQUEST_DIR}/${change_request_id}.md`
  await write_markdown_entity(file_path, frontmatter, description || '')
  log(`Created markdown file ${file_path}`)
}
