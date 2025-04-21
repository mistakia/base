import { v4 as uuidv4 } from 'uuid'
import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import db from '#db'
import { build_change_request_from_git } from './utils.mjs'
import * as github_integration from '#libs-server/integrations/github/index.mjs'
import config from '#config'
import { write_markdown_entity } from '#libs-server/markdown/index.mjs'
import { CHANGE_REQUEST_DIR } from './constants.mjs'

const log = debug('change-requests')

/**
 * Creates a new change request based on an existing Git branch.
 *
 * @param {object} params - Parameters for creating the change request.
 * @param {string} params.title - The title of the change request.
 * @param {string} params.description - The description of the change request.
 * @param {string} params.creator_id - The ID of the user or system entity creating the request.
 * @param {string} params.target_branch - The target branch for the changes (e.g., 'main').
 * @param {string} params.feature_branch - The branch containing the commits.
 * @param {boolean} [params.create_github_pr=false] - Whether to create a GitHub PR.
 * @param {string} [params.github_repo] - Required if create_github_pr is true (format: 'owner/repo').
 * @param {string} [params.github_pr_number] - Optional GitHub PR number if PR already exists.
 * @param {string} [params.github_pr_url] - Optional GitHub PR URL if PR already exists.
 * @param {string} [params.thread_id] - Optional ID of the related thread.
 * @param {Array<string>} [params.tags] - Optional tags.
 * @param {string} [params.repo_path] - Path to the repository. Defaults to config.user_base_directory.
 * @returns {Promise<string>} The ID of the newly created change request.
 */
export async function create_change_request({
  title,
  description,
  creator_id,
  target_branch,
  feature_branch,
  create_github_pr = false,
  github_repo,
  github_pr_number,
  github_pr_url,
  thread_id,
  tags = [],
  repo_path = config.user_base_directory
}) {
  const change_request_id = uuidv4()
  const now = new Date()

  // Initialize GitHub PR variables, may be provided or created
  let pr_number = github_pr_number
  let pr_url = github_pr_url

  try {
    // --- Validate Git Branch Exists ---
    log(
      `Creating change request ${change_request_id} from branch ${feature_branch}`
    )

    // Extract Git data to build the change request
    const git_data = await build_change_request_from_git({
      feature_branch,
      target_branch,
      repo_path
    })

    if (!git_data || !git_data.exists) {
      throw new Error(
        git_data?.error || `Branch ${feature_branch} doesn't exist`
      )
    }

    // --- GitHub Integration (Optional) ---
    if (create_github_pr) {
      const github_result = await create_github_pull_request({
        github_repo,
        title,
        feature_branch,
        target_branch,
        description,
        repo_path
      })

      pr_url = github_result?.pr_url
      pr_number = github_result?.pr_number
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
        github_pr_url: pr_url,
        github_pr_number: pr_number,
        github_repo,
        thread_id
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
        github_pr_url: pr_url,
        github_pr_number: pr_number,
        github_repo,
        thread_id,
        tags
      })
    })

    log(`Change request ${change_request_id} created successfully.`)
    return change_request_id
  } catch (error) {
    log(`Error creating change request ${change_request_id}:`, error)
    throw error
  }
}

// Helper function to create a GitHub PR
async function create_github_pull_request({
  github_repo,
  title,
  feature_branch,
  target_branch,
  description,
  repo_path = config.user_base_directory
}) {
  if (!github_repo) {
    throw new Error('github_repo is required when create_github_pr is true.')
  }

  log(`Creating PR for branch ${feature_branch} on GitHub`)
  try {
    const github_token = config.github_access_token
    if (!github_token) {
      log(
        'Warning: GITHUB_TOKEN not found in environment, skipping PR creation'
      )
      return {}
    }

    const pr_result = await github_integration.create_pull_request({
      token: github_token,
      repo: github_repo,
      title,
      head: feature_branch,
      base: target_branch,
      body: description,
      repo_path
    })

    return {
      pr_url: pr_result.html_url,
      pr_number: pr_result.number
    }
  } catch (error) {
    log(`Error creating GitHub PR: ${error.message}`)
    // Don't throw here, PR creation is optional
    return {}
  }
}

// Helper function to save to database
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
  thread_id
}) {
  await trx('change_requests').insert({
    change_request_id,
    title,
    creator_id,
    created_at: now,
    updated_at: now,
    status,
    target_branch,
    feature_branch,
    github_pr_url,
    github_pr_number,
    github_repo,
    thread_id
  })
}

// Helper function to create markdown file
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
  thread_id,
  tags
}) {
  const file_path = `${CHANGE_REQUEST_DIR}/${change_request_id}.md`
  const iso_date = now.toISOString()

  // Create the frontmatter
  const frontmatter = {
    change_request_id,
    title,
    description,
    creator_id,
    created_at: iso_date,
    updated_at: iso_date,
    status,
    target_branch,
    feature_branch,
    github_pr_url,
    github_pr_number,
    github_repo,
    thread_id,
    tags,
    type: 'change_request'
  }

  // Create the content
  const content = `# ${title}\n\n${description || ''}`

  // Ensure directory exists
  const dir_path = path.dirname(file_path)
  await fs.mkdir(dir_path, { recursive: true })

  // Write the file
  await write_markdown_entity({ file_path, frontmatter, content })
}
