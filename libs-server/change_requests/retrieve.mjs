import debug from 'debug'

import db from '#db'
import { read_markdown_entity } from '#libs-server/markdown/index.mjs'
import { CHANGE_REQUEST_DIR } from './constants.mjs'

const log = debug('change-requests')

/**
 * Retrieves a change request by ID, combining database and markdown file information.
 *
 * @param {object} params - Parameters for retrieving the change request.
 * @param {string} params.change_request_id - The ID of the change request to retrieve.
 * @returns {Promise<object|null>} The change request object with all properties, or null if not found.
 */
export async function get_change_request({ change_request_id }) {
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
    const file_path = `${CHANGE_REQUEST_DIR}/${change_request_id}.md`
    try {
      const markdown_data = await read_markdown_entity(file_path)

      // Add markdown content
      result.description = markdown_data.frontmatter.description || ''
      result.tags = markdown_data.frontmatter.tags || []
      result.content = markdown_data.content || ''
    } catch (error) {
      log(
        `Warning: Could not read markdown file for ${change_request_id}: ${error.message}`
      )
      // Set empty values if markdown file can't be read
      result.description = ''
      result.tags = []
      result.content = ''
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
    return filter_by_tags(formatted_results, tags)
  }

  // Otherwise, enhance all results with markdown data
  return enhance_with_markdown(formatted_results)
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
async function filter_by_tags(results, tags) {
  const filtered_results = []

  for (const record of results) {
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

// Helper function to enhance results with markdown data
async function enhance_with_markdown(results) {
  const enhanced_results = []

  for (const record of results) {
    try {
      const file_path = `${CHANGE_REQUEST_DIR}/${record.change_request_id}.md`
      const markdown_data = await read_markdown_entity(file_path)

      record.description = markdown_data.frontmatter.description || ''
      record.tags = markdown_data.frontmatter.tags || []
      record.content = markdown_data.content || ''
    } catch (error) {
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
