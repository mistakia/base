#!/usr/bin/env node

/**
 * Import GitHub Stars
 *
 * Fetches starred repositories from GitHub API and syncs to local database.
 * Uses the github-stars database entity for schema and storage configuration.
 *
 * Usage:
 *   node cli/github/import-stars.mjs                    # Import authenticated user's stars
 *   node cli/github/import-stars.mjs --user mistakia    # Import specific user's stars
 *   node cli/github/import-stars.mjs --dry-run          # Preview without changes
 */

import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_REPO = path.resolve(__dirname, '../..')

// Debug logging (simple implementation)
const DEBUG = process.env.DEBUG?.includes('import-github-stars')
const log = (...args) => DEBUG && console.error('[DEBUG]', ...args)

// Database entity base_uri
const DATABASE_URI = 'user:database/github-stars.md'

/**
 * Fetch starred repositories from GitHub API
 *
 * @param {Object} params
 * @param {string} params.github_token - GitHub API token
 * @param {string} [params.username] - Username (omit for authenticated user)
 * @param {number} [params.per_page=100] - Results per page
 * @param {number} [params.page=1] - Page number
 * @returns {Promise<Object>} { repos, has_next_page, next_page }
 */
async function fetch_starred_repos({
  github_token,
  username,
  per_page = 100,
  page = 1
}) {
  // Use /user/starred for authenticated user, /users/:username/starred for specific user
  const url = username
    ? `https://api.github.com/users/${username}/starred?per_page=${per_page}&page=${page}`
    : `https://api.github.com/user/starred?per_page=${per_page}&page=${page}`

  log('Fetching starred repos: %s (page %d)', url, page)

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github.star+json', // Include starred_at timestamp
      Authorization: `Bearer ${github_token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      `GitHub API error: ${response.status} - ${error.message || response.statusText}`
    )
  }

  const data = await response.json()

  // Check for next page via Link header
  const link_header = response.headers.get('link')
  const has_next_page =
    link_header && link_header !== '' && link_header.includes('rel="next"')

  return {
    repos: data,
    has_next_page,
    next_page: has_next_page ? page + 1 : null
  }
}

/**
 * Fetch all starred repositories (handles pagination)
 */
async function fetch_all_starred_repos({ github_token, username }) {
  const all_repos = []
  let page = 1
  let has_next = true

  while (has_next) {
    const { repos, has_next_page, next_page } = await fetch_starred_repos({
      github_token,
      username,
      page
    })

    all_repos.push(...repos)
    log('Fetched page %d: %d repos (total: %d)', page, repos.length, all_repos.length)

    has_next = has_next_page
    page = next_page || page + 1

    // Rate limit protection - small delay between pages
    if (has_next) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  return all_repos
}

/**
 * Normalize GitHub API response to database schema
 */
function normalize_repo(star_data) {
  // With star+json accept header, response is { starred_at, repo }
  const repo = star_data.repo || star_data
  const starred_at = star_data.starred_at || null

  return {
    repo_full_name: repo.full_name,
    repo_owner: repo.owner?.login || repo.full_name.split('/')[0],
    repo_name: repo.name,
    url: repo.html_url,
    description: repo.description || null,
    language: repo.language || null,
    topics: JSON.stringify(repo.topics || []),
    starred_at: starred_at ? new Date(starred_at).toISOString() : null,
    star_count: repo.stargazers_count || 0,
    fork_count: repo.forks_count || 0,
    repo_updated_at: repo.updated_at
      ? new Date(repo.updated_at).toISOString()
      : null,
    is_archived: repo.archived || false,
    archive_location: 'none',
    archive_path: null,
    synced_at: new Date().toISOString()
  }
}

/**
 * Main import function
 */
async function import_github_stars({
  github_token,
  username,
  dry_run = false
}) {
  log('Starting GitHub stars import (dry_run: %s)', dry_run)

  // Dynamically import base libs
  const { get_database_entity } = await import(
    path.join(BASE_REPO, 'libs-server/database/get-database-entity.mjs')
  )
  const { get_storage_adapter } = await import(
    path.join(BASE_REPO, 'libs-server/database/storage-adapters/index.mjs')
  )

  // Load database entity
  const database_entity = await get_database_entity({ base_uri: DATABASE_URI })
  if (!database_entity) {
    throw new Error(`Database entity not found: ${DATABASE_URI}`)
  }

  log('Loaded database entity: %s', database_entity.title)

  // Get storage adapter
  const adapter = await get_storage_adapter(database_entity)

  // Ensure table exists
  await adapter.create_table()
  log('Database table ready')

  // Fetch all starred repos
  console.log('Fetching starred repositories from GitHub...')
  const starred_repos = await fetch_all_starred_repos({ github_token, username })
  console.log(`Found ${starred_repos.length} starred repositories`)

  if (dry_run) {
    console.log('\n[DRY RUN] Would import the following repos:')
    for (const star_data of starred_repos.slice(0, 10)) {
      const normalized = normalize_repo(star_data)
      console.log(`  - ${normalized.repo_full_name} (${normalized.language || 'unknown'})`)
    }
    if (starred_repos.length > 10) {
      console.log(`  ... and ${starred_repos.length - 10} more`)
    }
    await adapter.close()
    return { imported: 0, dry_run: true, total: starred_repos.length }
  }

  // Get existing records for upsert logic
  const existing = await adapter.query({ limit: 10000 })
  const existing_map = new Map(existing.map((r) => [r.repo_full_name, r]))
  log('Found %d existing records', existing.size)

  // Prepare records for insert/update
  const to_insert = []
  const to_update = []

  for (const star_data of starred_repos) {
    const normalized = normalize_repo(star_data)
    const existing_record = existing_map.get(normalized.repo_full_name)

    if (existing_record) {
      // Preserve archive_location and archive_path from existing record
      normalized.archive_location = existing_record.archive_location || 'none'
      normalized.archive_path = existing_record.archive_path || null
      to_update.push(normalized)
    } else {
      to_insert.push(normalized)
    }
  }

  log('To insert: %d, to update: %d', to_insert.length, to_update.length)

  // Insert new records in batches
  const BATCH_SIZE = 100
  if (to_insert.length > 0) {
    for (let i = 0; i < to_insert.length; i += BATCH_SIZE) {
      const batch = to_insert.slice(i, i + BATCH_SIZE)
      await adapter.insert(batch)
      if (to_insert.length > BATCH_SIZE) {
        process.stdout.write(`\rInserted ${Math.min(i + BATCH_SIZE, to_insert.length)}/${to_insert.length} repositories...`)
      }
    }
    console.log(`\nInserted ${to_insert.length} new repositories`)
  }

  // Update existing records in batches
  if (to_update.length > 0) {
    for (let i = 0; i < to_update.length; i++) {
      const record = to_update[i]
      await adapter.update(record.repo_full_name, record)
      if (to_update.length > 100 && i % 100 === 0) {
        process.stdout.write(`\rUpdated ${i}/${to_update.length} repositories...`)
      }
    }
    console.log(`\nUpdated ${to_update.length} existing repositories`)
  }

  await adapter.close()

  return {
    imported: to_insert.length,
    updated: to_update.length,
    total: starred_repos.length
  }
}

// Parse command line arguments
function parse_args() {
  const args = process.argv.slice(2)

  const get_arg = (names, default_value) => {
    for (const name of names) {
      const index = args.indexOf(name)
      if (index !== -1) {
        if (typeof default_value === 'boolean') return true
        return args[index + 1]
      }
    }
    return default_value
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node cli/github/import-stars.mjs [options]

Options:
  --user, -u      GitHub username (default: authenticated user)
  --dry-run, -n   Show what would be imported without making changes
  --token, -t     GitHub token (default: from config)
  --help, -h      Show this help message
`)
    process.exit(0)
  }

  return {
    user: get_arg(['--user', '-u'], null),
    dry_run: get_arg(['--dry-run', '-n'], false),
    token: get_arg(['--token', '-t'], null)
  }
}

/**
 * CLI entry point
 */
async function main() {
  const argv = parse_args()

  try {
    // Get GitHub token from config or CLI
    let github_token = argv.token

    if (!github_token) {
      // Try to load from config
      try {
        const config = await import(
          path.join(BASE_REPO, 'config/index.mjs')
        )
        github_token = config.default.github_access_token
      } catch (e) {
        // Fallback to environment variable
        github_token = process.env.GITHUB_TOKEN
      }
    }

    if (!github_token) {
      console.error('Error: GitHub token required')
      console.error('Provide via --token, GITHUB_TOKEN env var, or config')
      process.exit(1)
    }

    const result = await import_github_stars({
      github_token,
      username: argv.user,
      dry_run: argv.dry_run
    })

    console.log('\nImport complete:')
    console.log(`  Total starred repos: ${result.total}`)
    if (!result.dry_run) {
      console.log(`  New imports: ${result.imported}`)
      console.log(`  Updated: ${result.updated}`)
    }
  } catch (error) {
    console.error('Error:', error.message)
    log('Full error:', error)
    process.exit(1)
  }
}

// Run if executed directly
main()
