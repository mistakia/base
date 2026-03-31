/**
 * Workflow subcommand group
 *
 * List and run workflow entities. The `run` subcommand spawns a non-interactive
 * Claude session inside the base container via `run-claude.sh`, optionally
 * enqueuing through the CLI queue for concurrency control.
 */

import fs from 'fs/promises'
import path from 'path'
import { execSync } from 'child_process'

import config from '#config'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import {
  resolve_base_uri_from_registry,
  is_valid_base_uri
} from '#libs-server/base-uri/index.mjs'
import { SERVER_URL, with_api_fallback, flush_and_exit } from './lib/format.mjs'
import { authenticated_fetch } from './lib/auth.mjs'

export const command = 'workflow <command>'
export const describe = 'Workflow operations (list, run)'

/**
 * Build the run-claude.sh command string for a workflow.
 * The prompt instructs Claude to run the workflow and archive the resulting
 * thread on completion.
 */
function build_run_command(base_uri) {
  const run_script = path.join(
    config.system_base_directory,
    'cli',
    'run-claude.sh'
  )
  const prompt = `Run workflow [[${base_uri}]]. When the workflow completes successfully, run /archive to archive the session thread.`
  return `${run_script} ${JSON.stringify(prompt)}`
}

export const builder = (yargs) =>
  yargs
    .command(
      'list',
      'List workflow entities',
      (yargs) =>
        yargs
          .option('search', {
            alias: 's',
            describe: 'Search workflow titles and descriptions',
            type: 'string'
          })
          .option('json', {
            describe: 'Output as JSON',
            type: 'boolean',
            default: false
          })
          .option('verbose', {
            alias: 'v',
            describe: 'Show descriptions',
            type: 'boolean',
            default: false
          }),
      handle_list
    )
    .command(
      'run <workflow>',
      'Run a workflow via Claude agent session',
      (yargs) =>
        yargs
          .positional('workflow', {
            describe:
              'Workflow base_uri (e.g., user:workflow/my-workflow.md) or relative path',
            type: 'string'
          })
          .option('queue', {
            alias: 'q',
            describe:
              'Enqueue to CLI queue instead of executing directly (respects concurrency limits)',
            type: 'boolean',
            default: false
          })
          .option('tags', {
            describe:
              'Comma-separated queue tags (default: claude-session). Only used with --queue',
            type: 'string',
            default: 'claude-session'
          })
          .option('priority', {
            alias: 'p',
            describe:
              'Queue priority (lower = higher priority, default 10). Only used with --queue',
            type: 'number',
            default: 10
          })
          .option('timeout', {
            describe: 'Timeout in milliseconds (default 600000 / 10 min)',
            type: 'number',
            default: 600000
          })
          .option('dry-run', {
            alias: 'n',
            describe:
              'Show the command that would be executed without running it',
            type: 'boolean',
            default: false
          }),
      handle_run
    )
    .demandCommand(1, 'Specify a subcommand: list, run')

export const handler = () => {}

/**
 * Resolve a workflow reference to a base_uri and absolute path.
 * Accepts: base_uri (user:workflow/..., sys:system/workflow/...),
 *          relative path (workflow/my-workflow.md),
 *          or absolute path.
 */
function resolve_workflow(ref) {
  let base_uri
  let absolute_path

  if (is_valid_base_uri(ref)) {
    base_uri = ref
    absolute_path = resolve_base_uri_from_registry(ref)
  } else if (path.isAbsolute(ref)) {
    absolute_path = ref
    // Derive base_uri from path
    const user_base = config.user_base_directory
    if (user_base && absolute_path.startsWith(user_base)) {
      base_uri = 'user:' + path.relative(user_base, absolute_path)
    }
  } else {
    // Relative path — assume user-base
    const user_base = config.user_base_directory
    if (!user_base) {
      throw new Error('user_base_directory not configured')
    }
    absolute_path = path.join(user_base, ref)
    base_uri = 'user:' + ref
  }

  return { base_uri, absolute_path }
}

async function handle_list(argv) {
  let exit_code = 0
  try {
    const entities = await with_api_fallback(
      async () => {
        const params = new URLSearchParams({
          type: 'workflow',
          limit: '200',
          sort_desc: 'true'
        })
        if (argv.search) params.set('search', argv.search)
        const response = await authenticated_fetch(
          `${SERVER_URL}/api/entities?${params}`
        )
        if (!response.ok) throw new Error(`API returned ${response.status}`)
        const data = await response.json()
        return data.entities || data
      },
      async () => {
        // Filesystem fallback — glob for workflow entities
        const directories = [
          config.user_base_directory
            ? path.join(config.user_base_directory, 'workflow')
            : null,
          config.system_base_directory
            ? path.join(config.system_base_directory, 'system', 'workflow')
            : null
        ].filter(Boolean)

        const results = []
        for (const dir of directories) {
          try {
            await fs.access(dir)
          } catch {
            continue
          }
          const all_entries = await fs.readdir(dir, { recursive: true })
          const files = all_entries.filter((f) => f.endsWith('.md'))
          for (const file of files) {
            const absolute_path = path.join(dir, file)
            const result = await read_entity_from_filesystem({ absolute_path })
            if (
              result.success &&
              result.entity_properties.type === 'workflow'
            ) {
              const props = result.entity_properties
              if (
                argv.search &&
                !props.title
                  ?.toLowerCase()
                  .includes(argv.search.toLowerCase()) &&
                !props.description
                  ?.toLowerCase()
                  .includes(argv.search.toLowerCase())
              ) {
                continue
              }
              results.push({
                base_uri: props.base_uri,
                title: props.title,
                description: props.description
              })
            }
          }
        }
        return results
      }
    )

    if (argv.json) {
      console.log(JSON.stringify(entities, null, 2))
    } else if (!entities || entities.length === 0) {
      console.log('No workflows found')
    } else {
      for (const entity of entities) {
        if (argv.verbose) {
          const desc = entity.description || ''
          console.log(`${entity.base_uri}\t${entity.title}\t${desc}`)
        } else {
          console.log(`${entity.base_uri}\t${entity.title}`)
        }
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_run(argv) {
  let exit_code = 0
  try {
    const { base_uri, absolute_path } = resolve_workflow(argv.workflow)

    // Validate the workflow entity exists and is type workflow
    const result = await read_entity_from_filesystem({ absolute_path })
    if (!result.success) {
      throw new Error(`Workflow not found: ${argv.workflow} (${absolute_path})`)
    }

    const { entity_properties } = result
    if (entity_properties.type !== 'workflow') {
      throw new Error(
        `Entity is type '${entity_properties.type}', expected 'workflow'`
      )
    }

    const run_command = build_run_command(base_uri)

    if (argv['dry-run']) {
      console.log('Command:')
      console.log(`  ${run_command}`)
      if (argv.queue) {
        const tags = argv.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
        console.log(`\nQueue tags: ${tags.join(', ')}`)
        console.log(`Queue priority: ${argv.priority}`)
      }
      console.log(`\nTimeout: ${argv.timeout}ms`)
      flush_and_exit(0)
      return
    }

    if (argv.queue) {
      // Enqueue to CLI queue (requires Redis)
      const queue_mod = await import('#server/services/cli-queue/queue.mjs')
      const available = await queue_mod.test_redis_connection()
      if (!available) {
        throw new Error(
          'Redis unavailable. The --queue flag requires a running Redis server. ' +
            'Run without --queue to execute directly.'
        )
      }

      const tags = argv.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const job = await queue_mod.add_cli_job({
        command: run_command,
        tags,
        priority: argv.priority,
        timeout_ms: argv.timeout,
        execution_mode: 'container',
        metadata: {
          workflow_uri: base_uri,
          workflow_title: entity_properties.title
        }
      })

      if (argv.json) {
        console.log(
          JSON.stringify({
            job_id: job.id,
            workflow: base_uri,
            tags: job.tags,
            status: 'queued'
          })
        )
      } else {
        console.log(`${job.id}\tqueued\t${entity_properties.title}`)
      }
    } else {
      // Execute directly
      console.log(`Running workflow: ${entity_properties.title}`)
      try {
        execSync(run_command, {
          stdio: 'inherit',
          timeout: argv.timeout,
          cwd: config.user_base_directory
        })
      } catch (exec_error) {
        if (exec_error.status) {
          throw new Error(`Workflow exited with code ${exec_error.status}`)
        }
        throw exec_error
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  } finally {
    try {
      const queue_mod = await import('#server/services/cli-queue/queue.mjs')
      await queue_mod.close_cli_queue()
    } catch {
      // Queue module not loaded or Redis not available
    }
  }
  flush_and_exit(exit_code)
}
