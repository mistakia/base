import debug from 'debug'
import path from 'path'

import config from '#config'
import db from '#db'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { build_change_request_from_git } from './utils.mjs'
import { CHANGE_REQUEST_DIR } from './constants.mjs'

const log = debug('change-requests')

/**
 * Retrieves a change request by ID, combining database, markdown file, and Git information.
 *
 * @param {object} params - Parameters for retrieving the change request.
 * @param {string} params.change_request_id - The ID of the change request to retrieve.
 * @param {string} [params.repo_path] - Optional repository path to use for operations.
 * @returns {Promise<object|null>} The change request object with all properties, or null if not found.
 */
export async function get_change_request({
  change_request_id,
  repo_path = config.user_base_directory
}) {
  log(`Retrieving change request ${change_request_id}`)

  // Get the database record
  try {
    const db_record = await db('change_requests')
      .where({ change_request_id })
      .first()

    if (!db_record) {
      log(`Change request with ID ${change_request_id} not found.`)
      return null
    }

    // Format the result with ISO date strings for consistency
    const result = format_change_request(db_record)

    // Get the markdown file content
    const absolute_path = path.join(
      repo_path,
      `${CHANGE_REQUEST_DIR}/${change_request_id}.md`
    )
    try {
      const markdown_data = await read_entity_from_filesystem({
        absolute_path
      })

      // Add markdown content
      result.description = markdown_data.entity_properties.description || ''
      result.tags = markdown_data.entity_properties.tags || []
      result.content = markdown_data.entity_content || ''
    } catch (error) {
      log(
        `Warning: Could not read markdown file for ${change_request_id}: ${error.message}`
      )
      // Set empty values if markdown file can't be read
      result.description = ''
      result.tags = []
      result.content = ''
    }

    // Enhance with Git information
    try {
      const { feature_branch, target_branch, merge_commit_hash } = result
      if (feature_branch && target_branch) {
        const git_data = await build_change_request_from_git({
          feature_branch,
          target_branch,
          merge_commit_hash,
          repo_path
        })
        result.git_data = git_data
      }
    } catch (error) {
      log(
        `Warning: Could not retrieve Git data for ${change_request_id}: ${error.message}`
      )
      result.git_data = { commits: [] }
    }

    return result
  } catch (error) {
    log(
      `Error querying database for change request ${change_request_id}: ${error.message}`
    )
    return null
  }
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
 * @param {boolean} [params.include_git_data=false] - Whether to include Git data.
 * @param {string} [params.repo_path] - Optional repository path to use for operations.
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
  sort_order = 'desc',
  include_git_data = false,
  repo_path = config.user_base_directory
}) {
  log('Listing change requests with filters')

  // Build the query with filters
  let query = build_change_request_query({
    status,
    creator_id,
    target_branch,
    search,
    include_closed
  })

  // Apply sorting and pagination
  query = query.orderBy(sort_by, sort_order).limit(limit).offset(offset)

  // Execute the query
  const results = await query
  const formatted_results = results.map(format_change_request)

  // If tags were provided, filter by tags from markdown files
  if (tags && tags.length > 0) {
    return filter_by_tags({
      results: formatted_results,
      tags,
      include_git_data,
      repo_path
    })
  }

  // Otherwise, enhance all results with markdown data
  return enhance_with_markdown({
    results: formatted_results,
    include_git_data,
    repo_path
  })
}

// Helper function to build the base query with filters
function build_change_request_query({
  status,
  creator_id,
  target_branch,
  search,
  include_closed
}) {
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

  return query
}

// Helper function to format change request timestamps consistently
function format_change_request(record) {
  return {
    ...record,
    created_at: record.created_at ? record.created_at.toISOString() : null,
    updated_at: record.updated_at ? record.updated_at.toISOString() : null,
    merged_at: record.merged_at ? record.merged_at.toISOString() : null,
    closed_at: record.closed_at ? record.closed_at.toISOString() : null
  }
}

// Helper function to filter results by tags
async function filter_by_tags({
  results,
  tags,
  include_git_data = false,
  repo_path
}) {
  const filtered_results = []

  for (const record of results) {
    try {
      const absolute_path = path.join(
        repo_path,
        `${CHANGE_REQUEST_DIR}/${record.change_request_id}.md`
      )
      const markdown_data = await read_entity_from_filesystem({
        absolute_path
      })
      const file_tags = markdown_data.entity_properties.tags || []

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
        record.description = markdown_data.entity_properties.description || ''
        record.tags = file_tags
        record.content = markdown_data.entity_content || ''

        // Add Git data if requested
        if (include_git_data) {
          await add_git_data({
            record,
            repo_path
          })
        }

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

// Helper function to enhance results with markdown data
async function enhance_with_markdown({
  results,
  include_git_data = false,
  repo_path
}) {
  for (const record of results) {
    try {
      const absolute_path = path.join(
        repo_path,
        `${CHANGE_REQUEST_DIR}/${record.change_request_id}.md`
      )
      const markdown_data = await read_entity_from_filesystem({
        absolute_path
      })

      // Add markdown data to the record
      record.description = markdown_data.entity_properties.description || ''
      record.tags = markdown_data.entity_properties.tags || []
      record.content = markdown_data.entity_content || ''
    } catch (error) {
      log(
        `Warning: Could not read markdown file for ${record.change_request_id}: ${error.message}`
      )
      // Set empty values if markdown file can't be read
      record.description = ''
      record.tags = []
      record.content = ''
    }

    // Add Git data if requested
    if (include_git_data) {
      await add_git_data({
        record,
        repo_path
      })
    }
  }

  return results
}

// Helper function to add Git data to a record
async function add_git_data({ record, repo_path }) {
  try {
    const { feature_branch, target_branch, merge_commit_hash } = record
    if (feature_branch && target_branch) {
      const git_data = await build_change_request_from_git({
        feature_branch,
        target_branch,
        merge_commit_hash,
        repo_path
      })
      record.git_data = git_data
    }
  } catch (error) {
    log(
      `Warning: Could not retrieve Git data for ${record.change_request_id}: ${error.message}`
    )
    record.git_data = { commits: [] }
  }
}
