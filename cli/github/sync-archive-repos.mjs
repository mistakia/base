#!/usr/bin/env node

/**
 * Sync Archive Repos
 *
 * Clones/updates starred repos marked for archival to repository/archive/.
 * This script is intended to run on the storage server only.
 *
 * The script:
 * 1. Queries github_stars for repos with archive_location = 'storage'
 * 2. Clones new repos or fetches updates for existing ones
 * 3. Updates archive_path in the database
 */

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const log = debug('sync-archive-repos')

// Database entity base_uri
const DATABASE_URI = 'user:database/github-stars.md'

// Target directory for archived repos (relative to user-base)
const ARCHIVE_DIR = 'repository/archive'

/**
 * Clone or update a repository
 *
 * @param {Object} params
 * @param {string} params.url - Repository URL
 * @param {string} params.target_path - Absolute path to clone/update
 * @param {boolean} params.dry_run - If true, don't make changes
 * @returns {Object} { action: 'cloned'|'updated'|'skipped', path }
 */
function sync_repo({ url, target_path, dry_run = false }) {
  const exists = fs.existsSync(target_path)

  if (exists) {
    // Update existing repo
    log('Updating repo at %s', target_path)
    if (!dry_run) {
      try {
        execSync('git fetch --all', {
          cwd: target_path,
          stdio: 'pipe'
        })
        return { action: 'updated', path: target_path }
      } catch (error) {
        log('Error updating repo: %s', error.message)
        return { action: 'error', path: target_path, error: error.message }
      }
    }
    return { action: 'would_update', path: target_path }
  } else {
    // Clone new repo
    log('Cloning repo to %s', target_path)
    if (!dry_run) {
      try {
        // Ensure parent directory exists
        const parent_dir = path.dirname(target_path)
        if (!fs.existsSync(parent_dir)) {
          fs.mkdirSync(parent_dir, { recursive: true })
        }

        execSync(`git clone --depth 1 "${url}" "${target_path}"`, {
          stdio: 'pipe'
        })
        return { action: 'cloned', path: target_path }
      } catch (error) {
        log('Error cloning repo: %s', error.message)
        return { action: 'error', path: target_path, error: error.message }
      }
    }
    return { action: 'would_clone', path: target_path }
  }
}

/**
 * Main sync function
 */
async function sync_archive_repos({ user_base_directory, dry_run = false }) {
  log('Starting archive repo sync (dry_run: %s)', dry_run)

  // Dynamically import base libs
  const { get_database_entity } = await import(
    '../../libs-server/database/get-database-entity.mjs'
  )
  const { get_storage_adapter } = await import(
    '../../libs-server/database/storage-adapters/index.mjs'
  )

  // Load database entity
  const database_entity = await get_database_entity({ base_uri: DATABASE_URI })
  if (!database_entity) {
    throw new Error(`Database entity not found: ${DATABASE_URI}`)
  }

  log('Loaded database entity: %s', database_entity.title)

  // Get storage adapter
  const adapter = await get_storage_adapter(database_entity)

  // Query for repos needing archival
  const repos = await adapter.query({
    filter: 'archive_location=storage',
    limit: 1000
  })

  console.log(`Found ${repos.length} repos marked for storage archival`)

  if (repos.length === 0) {
    await adapter.close()
    return { synced: 0 }
  }

  const archive_base = path.join(user_base_directory, ARCHIVE_DIR)
  const results = {
    cloned: 0,
    updated: 0,
    errors: 0
  }

  for (const repo of repos) {
    const repo_name = repo.repo_name
    const url = repo.url
    const target_path = path.join(archive_base, repo_name)

    console.log(`\nProcessing: ${repo.repo_full_name}`)

    const result = sync_repo({ url, target_path, dry_run })

    if (result.action === 'cloned') {
      results.cloned++
      console.log(`  Cloned to ${result.path}`)

      // Update database with archive_path
      await adapter.update(repo.repo_full_name, {
        archive_path: target_path
      })
    } else if (result.action === 'updated') {
      results.updated++
      console.log(`  Updated at ${result.path}`)
    } else if (result.action === 'would_clone') {
      console.log(`  [DRY RUN] Would clone to ${result.path}`)
    } else if (result.action === 'would_update') {
      console.log(`  [DRY RUN] Would update at ${result.path}`)
    } else if (result.action === 'error') {
      results.errors++
      console.log(`  Error: ${result.error}`)
    }
  }

  await adapter.close()

  return results
}

/**
 * CLI entry point
 */
async function main() {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .option('dry-run', {
      alias: 'n',
      describe: 'Show what would be done without making changes',
      type: 'boolean',
      default: false
    })
    .option('user-base', {
      alias: 'd',
      describe: 'User base directory path',
      type: 'string'
    })
    .help()
    .alias('help', 'h')
    .parse()

  try {
    // Determine user base directory
    let user_base_directory = argv['user-base']

    if (!user_base_directory) {
      // Try to load from config
      try {
        const config = await import('#config')
        user_base_directory = config.default.user_base_directory
      } catch (e) {
        // Fallback to environment variable
        user_base_directory = process.env.USER_BASE_DIRECTORY
      }
    }

    if (!user_base_directory) {
      console.error('Error: User base directory required')
      console.error(
        'Provide via --user-base, USER_BASE_DIRECTORY env var, or config'
      )
      process.exit(1)
    }

    const result = await sync_archive_repos({
      user_base_directory,
      dry_run: argv['dry-run']
    })

    console.log('\nSync complete:')
    console.log(`  Cloned: ${result.cloned}`)
    console.log(`  Updated: ${result.updated}`)
    console.log(`  Errors: ${result.errors}`)
  } catch (error) {
    console.error('Error:', error.message)
    log('Full error:', error)
    process.exit(1)
  }
}

// Run if executed directly
main()
