// Core logic for managing change requests will go here.
// This includes functions for creating, retrieving, updating, and merging change requests.

import { v4 as uuidv4 } from 'uuid'
import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import db from '#db'
import * as git_ops from '#libs-server/git/git_operations.mjs'
import * as github_integration from '#libs-server/integrations/github/index.mjs'
import config from '#config'
import {
  write_markdown_entity,
  read_markdown_entity
} from '#libs-server/markdown/index.mjs'

const log = debug('change-requests')
const CHANGE_REQUEST_DIR = 'data/change_requests'

/**
 * Creates a new change request.
 *
 * @param {object} params - Parameters for creating the change request.
 * @param {string} params.title - The title of the change request.
 * @param {string} params.description - The description of the change request.
 * @param {string} params.creator_id - The ID of the user or system entity creating the request (e.g., user UUID or 'system:worker').
 * @param {string} params.target_branch - The target branch for the changes (e.g., 'main').
 * @param {Array<{path: string, content: string}>} params.file_changes - Array of file modifications. 'path' is relative to the repo root. 'content' is the full new content.
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
  const change_request_id = uuidv4() // use uuid, same for db and filename
  const feature_branch = `cr/${change_request_id}`
  const now = new Date()
  const repo_path = '.' // Assuming operations run from the root of the repo
  let worktree_path = null
  let github_pr_url = null
  let github_pr_number = null

  try {
    // --- Git Operations ---
    log(`Starting Git operations for change request ${change_request_id}`)
    // 1. Create the feature branch
    await git_ops.create_branch({
      repo_path,
      branch_name: feature_branch,
      base_branch: target_branch
    })
    log(`Created branch ${feature_branch}`)

    // 2. Create a worktree for isolation
    worktree_path = await git_ops.create_worktree({
      repo_path,
      branch_name: feature_branch
    })
    log(`Created or found worktree at ${worktree_path}`)

    // 3. Apply file changes within the worktree
    const changed_file_paths = []
    for (const change of file_changes) {
      const full_file_path = path.resolve(worktree_path, change.path)
      const dir_name = path.dirname(full_file_path)
      // Ensure directory exists before writing file
      await fs.mkdir(dir_name, { recursive: true })
      await fs.writeFile(full_file_path, change.content)
      changed_file_paths.push(change.path) // Store relative path for git add
      log(`Wrote file ${change.path} in worktree`)
    }

    // 4. Stage the changes
    if (changed_file_paths.length > 0) {
      await git_ops.add_files({
        worktree_path,
        files_to_add: changed_file_paths
      })
      log(`Staged ${changed_file_paths.length} files`)

      // 5. Commit the changes
      const commit_message = `feat: Apply changes for change request ${change_request_id}\n\n${title}`
      // TODO: Determine author based on creator_id? For now, use default git config.
      // Example: const author = await get_author_string(creator_id);
      // await git_ops.commit_changes({ worktree_path, commit_message, author });
      await git_ops.commit_changes({ worktree_path, commit_message })
      log(`Committed changes to ${feature_branch}`)
    } else {
      log('No file changes provided, skipping git add/commit.')
    }

    // --- GitHub Integration (Optional) ---
    if (create_github_pr) {
      if (!github_repo) {
        throw new Error(
          'github_repo is required when create_github_pr is true.'
        )
      }
      // TODO: Implement branch push using git_ops
      // await git_ops.push_branch({ repo_path: worktree_path, branch_name: feature_branch });
      // TODO: Call github_integration.create_pull_request(...)
      // const pr_result = await github_integration.create_pull_request({ repo: github_repo, title, head: feature_branch, base: target_branch, body: description });
      // github_pr_url = pr_result.html_url;
      // github_pr_number = pr_result.number;
      console.warn('GitHub PR creation (push & API call) not yet implemented.')

      // Push the branch to GitHub
      log(`Pushing branch ${feature_branch} to GitHub for PR creation`)
      try {
        await git_ops.push_branch({
          repo_path: worktree_path,
          branch_name: feature_branch
        })

        // Get GitHub token from environment or configuration
        const github_token = config.github_access_token
        if (!github_token) {
          log(
            'Warning: GITHUB_TOKEN not found in environment, skipping PR creation'
          )
        } else {
          // Create the pull request
          log(`Creating GitHub PR in ${github_repo}`)
          const pr_result = await github_integration.create_pull_request({
            repo: github_repo,
            title,
            head: feature_branch,
            base: target_branch,
            body: description || '',
            github_token
          })

          github_pr_url = pr_result.html_url
          github_pr_number = pr_result.number
          log(`Created GitHub PR #${github_pr_number}: ${github_pr_url}`)
        }
      } catch (github_error) {
        log(`Warning: GitHub integration error: ${github_error.message}`)
        // Continue with the process even if GitHub integration fails
      }
    }

    // --- Database and File Operations (Transaction) ---
    log(`Starting DB transaction for change request ${change_request_id}`)
    await db.transaction(async (trx) => {
      // --- Create DB Record ---
      const status = 'PendingReview' // Default status
      const [inserted_record] = await trx('change_requests')
        .insert({
          change_request_id, // Use the generated UUID
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
        .returning('change_request_id') // Return the correct ID column

      if (!inserted_record || !inserted_record.change_request_id) {
        throw new Error('Failed to insert change request into database.')
      }
      log(`Inserted DB record for ${change_request_id}`)

      // --- Create Markdown File ---
      const frontmatter = {
        change_request_id, // Use the correct ID field name
        title,
        description: description || '', // Ensure description is not null
        creator_id,
        created_at: now.toISOString(), // Use ISO string for consistency
        target_branch,
        feature_branch,
        status, // Add status here for visibility
        github_pr_url,
        github_pr_number,
        github_repo,
        related_thread_id,
        tags,
        type: 'change_request'
      }
      const file_path = `${CHANGE_REQUEST_DIR}/${change_request_id}.md`
      // write_knowledge_item should handle directory creation if needed
      await write_markdown_entity(file_path, frontmatter, description || '') // Pass description as body
      log(`Created markdown file ${file_path}`)
    }) // End Knex transaction

    log(`Change request ${change_request_id} created successfully.`)
    return change_request_id // Return the ID
  } catch (error) {
    log(`Error creating change request ${change_request_id}:`, error)
    // Attempt cleanup even if DB transaction failed or didn't run
    // TODO: Consider more robust cleanup, e.g., deleting the branch if appropriate
    // Example: await git_ops.delete_branch({ repo_path, branch_name: feature_branch });
    throw error // Re-throw the error after logging
  } finally {
    // --- Cleanup ---
    // Ensure worktree is removed if it was created/used
    if (worktree_path) {
      log(`Cleaning up worktree ${worktree_path}`)
      await git_ops.remove_worktree({
        repo_path,
        worktree_path
      })
    }
  }
}

/**
 * Retrieves a change request by ID, combining database and markdown file information.
 *
 * @param {object} params - Parameters for retrieving the change request.
 * @param {string} params.change_request_id - The ID of the change request to retrieve.
 * @returns {Promise<object|null>} The change request object with all properties, or null if not found.
 */
export async function get_change_request({ change_request_id }) {
  log(`Retrieving change request ${change_request_id}`)

  let db_record = null

  // Get the database record
  try {
    db_record = await db('change_requests').where({ change_request_id }).first()
  } catch (error) {
    log(
      `Error querying database for change request ${change_request_id}: ${error.message}`
    )
  }

  if (!db_record) {
    log(`Change request with ID ${change_request_id} not found.`)
    return null
  }

  // Get the markdown file content
  const file_path = `${CHANGE_REQUEST_DIR}/${change_request_id}.md`
  let markdown_data = null

  try {
    markdown_data = await read_markdown_entity(file_path)
  } catch (error) {
    log(
      `Warning: Could not read markdown file for ${change_request_id}: ${error.message}`
    )
    // Continue with just the DB data if file is missing
  }

  // Combine data, prioritizing DB for status and timestamps
  const result = {
    ...db_record,
    // Format any dates as ISO strings for consistency in the API response
    created_at: db_record.created_at
      ? db_record.created_at.toISOString()
      : null,
    updated_at: db_record.updated_at
      ? db_record.updated_at.toISOString()
      : null,
    merged_at: db_record.merged_at ? db_record.merged_at.toISOString() : null,
    closed_at: db_record.closed_at ? db_record.closed_at.toISOString() : null
  }

  // Add markdown content if available
  if (markdown_data) {
    // Add frontmatter fields that might not be in DB
    result.description = markdown_data.frontmatter.description || ''
    result.tags = markdown_data.frontmatter.tags || []

    // Add the markdown body as content
    result.content = markdown_data.content || ''
  } else {
    // Ensure description is at least an empty string if missing
    result.description = ''
    result.tags = []
    result.content = ''
  }

  return result
}

/**
 * Retrieves a list of change requests based on filter criteria.
 *
 * @param {object} params - Parameters for filtering change requests.
 * @param {string} [params.status] - Filter by status.
 * @param {string} [params.creator_id] - Filter by creator.
 * @param {string} [params.target_branch] - Filter by target branch.
 * @param {string} [params.search] - Search in title or description.
 * @param {Array<string>} [params.tags] - Filter by tags.
 * @param {boolean} [params.include_closed=false] - Whether to include closed/merged requests.
 * @param {number} [params.limit=100] - Maximum number of results to return.
 * @param {number} [params.offset=0] - Offset for pagination.
 * @param {string} [params.sort_by='updated_at'] - Field to sort by.
 * @param {string} [params.sort_order='desc'] - Sort order ('asc' or 'desc').
 * @returns {Promise<Array<object>>} Array of change request objects.
 */
export async function list_change_requests({
  status,
  creator_id,
  target_branch,
  search,
  tags,
  include_closed = false,
  limit = 100,
  offset = 0,
  sort_by = 'updated_at',
  sort_order = 'desc'
}) {
  log('Listing change requests with filters')

  // Start building the query
  let query = db('change_requests')

  // Apply filters
  if (status) {
    query = query.where({ status })
  } else if (!include_closed) {
    // By default, exclude merged and closed unless specifically requested
    query = query.whereNotIn('status', ['Merged', 'Closed'])
  }

  if (creator_id) {
    query = query.where({ creator_id })
  }

  if (target_branch) {
    query = query.where({ target_branch })
  }

  if (search) {
    query = query.where(function () {
      this.where('title', 'ilike', `%${search}%`).orWhere(
        'change_request_id',
        'ilike',
        `%${search}%`
      )
    })
  }

  // Note: Tags are stored in the markdown files, so we'll need to filter those after
  // getting the database results. For simplicity in this implementation, we'll skip
  // the tag filtering here and recommend implementing it when a proper search index exists.

  // Apply sorting
  query = query.orderBy(sort_by, sort_order)

  // Apply pagination
  query = query.limit(limit).offset(offset)

  // Execute the query
  const results = await query

  // Format the results
  const formatted_results = results.map((record) => ({
    ...record,
    created_at: record.created_at ? record.created_at.toISOString() : null,
    updated_at: record.updated_at ? record.updated_at.toISOString() : null,
    merged_at: record.merged_at ? record.merged_at.toISOString() : null,
    closed_at: record.closed_at ? record.closed_at.toISOString() : null
  }))

  // If tags were provided, we need to filter the results further
  // This would be more efficient with a proper search index
  if (tags && tags.length > 0) {
    const filtered_results = []

    for (const record of formatted_results) {
      try {
        const file_path = `${CHANGE_REQUEST_DIR}/${record.change_request_id}.md`
        const markdown_data = await read_markdown_entity(file_path)
        const file_tags = markdown_data.frontmatter.tags || []

        // Check if any of the requested tags are in the file's tags
        const has_matching_tag = tags.some(
          (tag) =>
            file_tags.includes(tag) ||
            (Array.isArray(file_tags) &&
              file_tags.some(
                (file_tag) =>
                  typeof file_tag === 'string' &&
                  file_tag.toLowerCase() === tag.toLowerCase()
              ))
        )

        if (has_matching_tag) {
          // Add markdown data to the record
          record.description = markdown_data.frontmatter.description || ''
          record.tags = file_tags
          record.content = markdown_data.content || ''

          filtered_results.push(record)
        }
      } catch (error) {
        log(
          `Warning: Error reading tags for ${record.change_request_id}: ${error.message}`
        )
        // Skip this record if we can't read its tags
      }
    }

    return filtered_results
  }

  // If no tag filtering, enhance results with markdown data
  const enhanced_results = []
  for (const record of formatted_results) {
    try {
      const file_path = `${CHANGE_REQUEST_DIR}/${record.change_request_id}.md`
      const markdown_data = await read_markdown_entity(file_path)

      // Add markdown data to the record
      record.description = markdown_data.frontmatter.description || ''
      record.tags = markdown_data.frontmatter.tags || []
      record.content = markdown_data.content || ''
    } catch (error) {
      // If we can't read the markdown, set empty values
      record.description = ''
      record.tags = []
      record.content = ''

      log(
        `Warning: Error reading markdown for ${record.change_request_id}: ${error.message}`
      )
    }
    enhanced_results.push(record)
  }

  return enhanced_results
}

/**
 * Updates the status of a change request.
 *
 * @param {object} params - Parameters for updating the change request status.
 * @param {string} params.change_request_id - The ID of the change request to update.
 * @param {string} params.status - The new status ('Draft', 'PendingReview', 'Approved', 'NeedsRevision', 'Rejected', 'Merged', 'Closed').
 * @param {string} [params.updater_id] - The ID of the user updating the status.
 * @param {string} [params.comment] - Optional comment explaining the status change.
 * @returns {Promise<object>} The updated change request object.
 */
export async function update_change_request_status({
  change_request_id,
  status,
  updater_id,
  comment
}) {
  log(`Updating status of change request ${change_request_id} to ${status}`)

  const valid_statuses = [
    'Draft',
    'PendingReview',
    'Approved',
    'NeedsRevision',
    'Rejected',
    'Merged',
    'Closed'
  ]
  if (!valid_statuses.includes(status)) {
    throw new Error(
      `Invalid status: ${status}. Must be one of: ${valid_statuses.join(', ')}`
    )
  }

  // Get current status to validate transitions
  const current_cr = await get_change_request({ change_request_id })
  if (!current_cr) {
    throw new Error(`Change request with ID ${change_request_id} not found.`)
  }

  // Define allowed transitions
  const valid_transitions = {
    Draft: ['PendingReview', 'Closed'],
    PendingReview: ['Approved', 'NeedsRevision', 'Rejected', 'Closed'],
    NeedsRevision: ['PendingReview', 'Closed'],
    Approved: ['Merged', 'PendingReview', 'Closed'],
    Rejected: ['PendingReview', 'Closed'],
    Merged: ['Closed'], // Only allow closing a merged CR
    Closed: [] // No transitions from closed
  }

  // Check if transition is valid
  if (
    current_cr.status !== status &&
    (!valid_transitions[current_cr.status] ||
      !valid_transitions[current_cr.status].includes(status))
  ) {
    throw new Error(
      `Cannot transition change request from ${current_cr.status} to ${status}.`
    )
  }

  const now = new Date()
  const update_data = {
    status,
    updated_at: now
  }

  // Add timestamps for terminal states
  if (status === 'Merged') {
    update_data.merged_at = now
  } else if (status === 'Closed' || status === 'Rejected') {
    update_data.closed_at = now
  }

  let updated_cr = null

  // Update the database record
  await db.transaction(async (trx) => {
    // Update the database record
    const [updated_record] = await trx('change_requests')
      .where({ change_request_id })
      .update(update_data)
      .returning('*')

    if (!updated_record) {
      throw new Error(`Change request with ID ${change_request_id} not found.`)
    }

    // Update the markdown file
    const file_path = `${CHANGE_REQUEST_DIR}/${change_request_id}.md`
    try {
      const markdown_data = await read_markdown_entity(file_path)

      // Update frontmatter explicitly
      const new_frontmatter = {
        ...markdown_data.frontmatter,
        status,
        updated_at: now.toISOString()
      }

      if (status === 'Merged') {
        new_frontmatter.merged_at = now.toISOString()
      } else if (status === 'Closed' || status === 'Rejected') {
        new_frontmatter.closed_at = now.toISOString()
      }

      // Add comment to content if provided
      let content = markdown_data.content || ''
      if (comment) {
        const comment_block = `\n\n## Status Update: ${status}\n\n${comment}\n\n_Updated by ${updater_id || 'system'} on ${now.toISOString()}_`
        content += comment_block
      }

      // Write back to file
      await write_markdown_entity(file_path, new_frontmatter, content)

      log(
        `Updated markdown file for ${change_request_id} with status: ${status}`
      )
    } catch (error) {
      log(
        `Warning: Could not update markdown file for ${change_request_id}: ${error.message}`
      )
      // Continue even if file update fails
    }
  })

  // Get the updated change request
  try {
    updated_cr = await get_change_request({ change_request_id })
    if (!updated_cr) {
      throw new Error(
        `Change request ${change_request_id} not found after update.`
      )
    }

    // Double-check that the status was updated correctly
    if (updated_cr.status !== status) {
      log(
        `Warning: Change request status was not updated properly. Expected ${status}, got ${updated_cr.status}`
      )
    }

    return updated_cr
  } catch (error) {
    log(`Error retrieving updated change request: ${error.message}`)
    throw new Error(`Failed to verify change request update: ${error.message}`)
  }
}

/**
 * Merges a change request into the target branch.
 *
 * @param {object} params - Parameters for merging the change request.
 * @param {string} params.change_request_id - The ID of the change request to merge.
 * @param {string} [params.merger_id] - The ID of the user performing the merge.
 * @param {string} [params.merge_message] - Optional custom merge message.
 * @param {boolean} [params.delete_branch=true] - Whether to delete the feature branch after merging.
 * @returns {Promise<object>} The updated change request object.
 */
export async function merge_change_request({
  change_request_id,
  merger_id,
  merge_message,
  delete_branch = true
}) {
  log(`Merging change request ${change_request_id}`)

  // Get the change request to verify it can be merged
  const change_request = await get_change_request({ change_request_id })

  if (!change_request) {
    throw new Error(`Change request with ID ${change_request_id} not found.`)
  }

  if (change_request.status === 'Merged') {
    throw new Error(`Change request ${change_request_id} is already merged.`)
  }

  if (
    change_request.status === 'Closed' ||
    change_request.status === 'Rejected'
  ) {
    throw new Error(
      `Cannot merge change request ${change_request_id} with status ${change_request.status}.`
    )
  }

  const repo_path = '.' // Assuming operations run from the root of the repo
  const { feature_branch, target_branch } = change_request

  try {
    // 1. Make sure we're on the target branch
    await git_ops.checkout_branch({ repo_path, branch_name: target_branch })
    log(`Checked out target branch ${target_branch}`)

    // 2. Pull latest changes from remote (if applicable)
    // await git_ops.pull(repo_path);
    // log(`Pulled latest changes from ${target_branch}`);

    // 3. Merge the feature branch
    const custom_message =
      merge_message ||
      `Merging test CR: ${change_request_id}\n\n${change_request.title}`
    await git_ops.merge_branch({
      repo_path,
      branch_to_merge: feature_branch,
      merge_message: custom_message
    })
    log(`Merged ${feature_branch} into ${target_branch}`)

    // 4. Delete the feature branch if requested
    if (delete_branch) {
      await git_ops.delete_branch({
        repo_path,
        branch_name: feature_branch
      })
      log(`Deleted feature branch ${feature_branch}`)
    }

    // 5. Update the change request status
    const comment = `Merged change request ${change_request_id} into ${target_branch}.${merger_id ? ` Merged by ${merger_id}.` : ''}`
    const updated_cr = await update_change_request_status({
      change_request_id,
      status: 'Merged',
      updater_id: merger_id || 'system',
      comment
    })

    return updated_cr
  } catch (error) {
    log(`Error merging change request ${change_request_id}:`, error)
    throw error
  }
}

/**
 * Handles GitHub webhook events to sync status changes from GitHub PRs to the internal system.
 *
 * @param {object} params - Parameters for handling the webhook.
 * @param {object} params.payload - The GitHub webhook payload.
 * @returns {Promise<object|null>} The updated change request object, or null if no action was taken.
 */
export async function handle_github_webhook({ payload }) {
  if (!payload || !payload.action || !payload.pull_request) {
    log('Invalid GitHub webhook payload')
    return null
  }

  const { action, pull_request, repository } = payload
  const pr_number = pull_request.number
  const github_repo = repository
    ? `${repository.owner.login}/${repository.name}`
    : null

  log(`Processing GitHub webhook: ${action} on PR #${pr_number}`)

  // Find the corresponding change request
  const change_requests = await db('change_requests')
    .where({ github_pr_number: pr_number })
    .andWhere({ github_repo })
    .limit(1)

  if (change_requests.length === 0) {
    log(
      `No matching change request found for PR #${pr_number} in ${github_repo}`
    )
    return null
  }

  const change_request = change_requests[0]
  const { change_request_id } = change_request

  // Map GitHub events to change request status updates
  let new_status = null
  let comment = null

  switch (action) {
    case 'closed':
      if (pull_request.merged) {
        new_status = 'Merged'
        comment = `GitHub PR #${pr_number} was merged on GitHub.`
      } else {
        new_status = 'Closed'
        comment = `GitHub PR #${pr_number} was closed without merging.`
      }
      break
    case 'reopened':
      new_status = 'PendingReview'
      comment = `GitHub PR #${pr_number} was reopened.`
      break
    // Add more cases as needed for other GitHub events
    default:
      log(`No status update needed for action: ${action}`)
      return null
  }

  if (new_status) {
    try {
      // Update the change request status
      const updated_cr = await update_change_request_status({
        change_request_id,
        status: new_status,
        updater_id: 'system:github',
        comment
      })
      return updated_cr
    } catch (error) {
      // Handle case where normal transition validation fails (e.g., for PRs merged externally)
      // For merged PRs, we need to force the status change
      if (new_status === 'Merged' && pull_request.merged) {
        log(
          `Forcing status update to Merged for PR ${pr_number} that was merged on GitHub`
        )

        const now = new Date()
        // Update directly in the database to bypass transition validation
        await db.transaction(async (trx) => {
          // Update the database record
          await trx('change_requests').where({ change_request_id }).update({
            status: 'Merged',
            updated_at: now,
            merged_at: now
          })

          // Update the markdown file too
          try {
            const file_path = `${CHANGE_REQUEST_DIR}/${change_request_id}.md`
            const markdown_data = await read_markdown_entity(file_path)

            // Update frontmatter
            markdown_data.frontmatter.status = 'Merged'
            markdown_data.frontmatter.updated_at = now.toISOString()
            markdown_data.frontmatter.merged_at = now.toISOString()

            // Add comment about forced merge
            let content = markdown_data.content || ''
            const force_comment = `${comment}\n\n(Status forced due to external merge on GitHub)`
            const comment_block = `\n\n## Status Update: Merged\n\n${force_comment}\n\n_Updated by system:github on ${now.toISOString()}_`
            content += comment_block

            // Write back to file
            await write_markdown_entity(
              file_path,
              markdown_data.frontmatter,
              content
            )
          } catch (markdown_error) {
            log(
              `Warning: Could not update markdown file: ${markdown_error.message}`
            )
            // Continue even if markdown update fails
          }
        })

        // Return the updated change request
        try {
          const updated_cr = await get_change_request({ change_request_id })
          if (!updated_cr) {
            log(
              `Warning: Change request ${change_request_id} not found after forced merge update`
            )
            return null
          }
          return updated_cr
        } catch (error) {
          log(
            `Error retrieving updated change request after forced merge: ${error.message}`
          )
          return null
        }
      }

      // For other transitions, just log the error and return null
      log(`Error updating status for webhook: ${error.message}`)
      return null
    }
  }

  return null
}
