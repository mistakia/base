#!/usr/bin/env node

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import config from '#config'
import { create_github_issue_from_task } from '#libs-server/integrations/github/create-github-issue-from-task.mjs'
import { create_github_issue } from '#libs-server/integrations/github/github-api/index.mjs'
import { process_repositories_from_filesystem } from '#libs-server/repository/filesystem/process-filesystem-repository.mjs'
import { isMain } from '#libs-server'

const log = debug('create-github-issues-from-local-tasks')

/**
 * Create GitHub issues from local tasks
 */
export default async function create_github_issues_from_local_tasks({
  repository_filter,
  github_token,
  user_base_directory = config.user_base_directory,
  dry_run = false
}) {
  try {
    log('Scanning for local tasks ready for GitHub issue creation...')

    const results = {
      created: [],
      errors: [],
      total_processed: 0
    }

    // Build path pattern for GitHub tasks
    let path_pattern = 'user/task/github/**/*.md'
    if (repository_filter) {
      const [owner, repo] = repository_filter.split('/')
      if (owner && repo) {
        path_pattern = `user/task/github/${owner}/${repo}/*.md`
      }
    }

    // Entity processor function to handle each task
    const entity_processor = async ({ entity }) => {
      const { entity_properties, file_info } = entity

      // Check if this task is ready for GitHub creation
      const has_github_metadata =
        entity_properties.github_repository_owner &&
        entity_properties.github_repository_name
      const missing_external_id = !entity_properties.external_id
      const is_task = entity_properties.type === 'task'

      if (!has_github_metadata || !missing_external_id || !is_task) {
        return false // Skip this entity
      }

      results.total_processed++

      const repository = `${entity_properties.github_repository_owner}/${entity_properties.github_repository_name}`

      if (dry_run) {
        log(
          `Would create issue for: ${entity_properties.title} (${repository})`
        )
        return true
      }

      try {
        log(`Creating issue for: ${entity_properties.title}`)

        const result = await create_github_issue_from_task({
          absolute_path: file_info.absolute_path,
          github_token,
          create_github_issue_api: create_github_issue
        })

        results.created.push({
          task_title: entity_properties.title,
          github_url: result.github_issue.html_url,
          issue_number: result.github_issue.number,
          repository,
          entity_id: entity_properties.entity_id
        })

        log(`Created: ${result.github_issue.html_url}`)
        return true
      } catch (error) {
        log(
          `Error creating issue for ${entity_properties.title}: ${error.message}`
        )
        results.errors.push({
          task_title: entity_properties.title,
          error: error.message,
          absolute_path: file_info.absolute_path,
          repository
        })
        return true
      }
    }

    // Process filesystem using the repository processor
    // Note: For large-scale operations, consider implementing rate limiting
    // to respect GitHub API limits (5000 requests/hour for authenticated requests)
    await process_repositories_from_filesystem({
      root_base_directory: user_base_directory,
      entity_processor,
      include_entity_types: ['task'],
      path_pattern
    })

    return results
  } catch (error) {
    log(`Error creating GitHub issues from local tasks: ${error.message}`)
    throw error
  }
}

// Command-line interface
const main = async () => {
  let error
  try {
    const argv = yargs(hideBin(process.argv))
      .usage('Create GitHub issues from local tasks\n\nUsage: $0 [options]')
      .option('repository', {
        alias: 'r',
        type: 'string',
        description: 'Filter to specific repository (owner/repo format)'
      })
      .option('dry-run', {
        type: 'boolean',
        default: false,
        description: 'Show what would be created without creating'
      })
      .example('$0', 'Create issues for all ready tasks')
      .example('$0 -r mistakia/league', 'Create issues for specific repository')
      .example('$0 --dry-run', 'Preview what would be created')
      .help()
      .parseSync()

    const github_token = process.env.GITHUB_TOKEN || config.github_access_token

    if (!github_token) {
      console.error(
        'Error: GITHUB_TOKEN environment variable or config is required'
      )
      process.exit(1)
    }

    const { repository: repository_filter, 'dry-run': dry_run } = argv

    console.log('Scanning for local tasks ready for GitHub issue creation...')

    const results = await create_github_issues_from_local_tasks({
      repository_filter,
      github_token,
      user_base_directory: config.user_base_directory,
      dry_run
    })

    if (results.total_processed === 0) {
      console.log('No tasks found that are ready for GitHub issue creation')

      if (repository_filter) {
        console.log(`Filter: ${repository_filter}`)
      }

      return
    }

    // Group by repository for better display
    const tasks_by_repo = {}
    for (const item of [...results.created, ...results.errors]) {
      if (!tasks_by_repo[item.repository]) {
        tasks_by_repo[item.repository] = []
      }
      tasks_by_repo[item.repository].push(item)
    }

    console.log(
      `\nFound ${results.total_processed} task(s) ready for GitHub issue creation:`
    )

    for (const [repo, tasks] of Object.entries(tasks_by_repo)) {
      console.log(`\n${repo}:`)
      for (const task of tasks) {
        const status = results.created.includes(task) ? 'CREATED' : 'ERROR'
        console.log(`  ${status}: ${task.task_title}`)
      }
    }

    if (dry_run) {
      console.log('\nDry run mode - no GitHub issues were created')
      return
    }

    // Print summary
    console.log('\nSummary:')
    console.log(`Created: ${results.created.length}`)
    console.log(`Errors: ${results.errors.length}`)

    if (results.created.length > 0) {
      console.log('\nSuccessfully created GitHub issues:')
      for (const item of results.created) {
        console.log(`  ${item.task_title} -> ${item.github_url}`)
      }
    }

    if (results.errors.length > 0) {
      console.log('\nErrors encountered:')
      for (const item of results.errors) {
        console.log(`  ${item.task_title}: ${item.error}`)
      }
    }

    if (results.created.length > 0) {
      console.log(
        '\nDone! Tasks with external_id can now sync with GitHub using existing sync tools.'
      )
    }
  } catch (err) {
    error = err
    console.error(
      'Error creating GitHub issues from local tasks:',
      error.message
    )
  }

  process.exit(error ? 1 : 0)
}

if (isMain(import.meta.url)) {
  debug.enable('create-github-issues-from-local-tasks,github:*')
  main()
}
