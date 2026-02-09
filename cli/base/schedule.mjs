/**
 * Schedule subcommand
 *
 * Manages scheduled commands for automated execution.
 */

import fs from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'
import config from '#config'

import { load_schedules } from '#libs-server/schedule/load-schedules.mjs'
import { trigger_schedule } from '#libs-server/schedule/trigger-schedule.mjs'
import { parse_schedule } from '#libs-server/schedule/parse-schedule.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { close_cli_queue } from '#libs-server/cli-queue/index.mjs'
import { flush_and_exit } from './lib/format.mjs'

export const command = 'schedule <command>'
export const describe = 'Scheduled command operations'

const get_schedule_directory = () => {
  const user_base = config.user_base_directory
  if (!user_base) {
    throw new Error('user_base_directory not configured')
  }
  return path.join(user_base, 'scheduled-command')
}

const resolve_schedule_path = (target) => {
  const directory = get_schedule_directory()
  if (!path.isAbsolute(target)) {
    const file = target.endsWith('.md') ? target : `${target}.md`
    return path.join(directory, file)
  }
  return target
}

export const builder = (yargs) =>
  yargs
    .command('list', 'List all scheduled commands', {}, handle_list)
    .command(
      'add <cmd>',
      'Create a new scheduled command',
      (yargs) =>
        yargs
          .positional('cmd', {
            describe: 'Command to schedule',
            type: 'string'
          })
          .option('type', {
            alias: 't',
            describe:
              'Schedule type: expr (cron), at (one-shot), every (interval)',
            type: 'string',
            default: 'expr'
          })
          .option('schedule', {
            alias: 's',
            describe: 'Schedule expression (required)',
            type: 'string',
            demandOption: true
          })
          .option('title', {
            describe: 'Title for the schedule',
            type: 'string'
          })
          .option('timezone', {
            alias: 'tz',
            describe: 'Timezone for cron expressions',
            type: 'string'
          })
          .option('folder', {
            alias: 'f',
            describe: 'Folder within scheduled-command/',
            type: 'string'
          })
          .option('cwd', {
            describe: 'Working directory for command',
            type: 'string'
          })
          .option('tags', {
            describe: 'Comma-separated queue tags',
            type: 'string'
          })
          .option('priority', {
            alias: 'p',
            describe: 'Queue priority (lower = higher)',
            type: 'number'
          })
          .option('timeout', {
            describe: 'Command timeout in milliseconds',
            type: 'number'
          }),
      handle_add
    )
    .command(
      'enable <file>',
      'Enable a scheduled command',
      (yargs) =>
        yargs.positional('file', {
          describe: 'Schedule file path',
          type: 'string'
        }),
      handle_enable
    )
    .command(
      'disable <file>',
      'Disable a scheduled command',
      (yargs) =>
        yargs.positional('file', {
          describe: 'Schedule file path',
          type: 'string'
        }),
      handle_disable
    )
    .command(
      'trigger <file>',
      'Force immediate execution',
      (yargs) =>
        yargs.positional('file', {
          describe: 'Schedule file path',
          type: 'string'
        }),
      handle_trigger
    )
    .command(
      'delete <file>',
      'Delete a scheduled command',
      (yargs) =>
        yargs.positional('file', {
          describe: 'Schedule file path',
          type: 'string'
        }),
      handle_delete
    )
    .demandCommand(
      1,
      'Specify a subcommand: list, add, enable, disable, trigger, delete'
    )

export const handler = () => {}

async function handle_list(argv) {
  let exit_code = 0
  try {
    const directory = get_schedule_directory()
    const schedules = await load_schedules({ directory })

    if (argv.json) {
      console.log(JSON.stringify(schedules, null, 2))
      flush_and_exit(exit_code)
      return
    }

    if (schedules.length === 0) {
      console.log('No scheduled commands found')
      flush_and_exit(exit_code)
      return
    }

    // Sort by next trigger time
    const sorted = [...schedules].sort((a, b) => {
      if (!a.next_trigger_at && !b.next_trigger_at) return 0
      if (!a.next_trigger_at) return 1
      if (!b.next_trigger_at) return -1
      return a.next_trigger_at.localeCompare(b.next_trigger_at)
    })

    if (argv.verbose) {
      for (const schedule of sorted) {
        const status = schedule.enabled ? '[ENABLED]' : '[DISABLED]'
        const relative_path = path.relative(directory, schedule.file_path)
        console.log(`${status} ${relative_path}`)
        console.log(`  Title: ${schedule.title || '(none)'}`)
        console.log(`  Command: ${schedule.command}`)
        console.log(`  Type: ${schedule.schedule_type} (${schedule.schedule})`)
        if (schedule.next_trigger_at) {
          console.log(`  Next: ${schedule.next_trigger_at}`)
        }
        console.log('')
      }
    } else {
      for (const schedule of sorted) {
        const status = schedule.enabled ? 'enabled' : 'disabled'
        const relative_path = path.relative(directory, schedule.file_path)
        const next = schedule.next_trigger_at || '-'
        console.log(`${relative_path}\t${status}\t${next}`)
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_add(argv) {
  let exit_code = 0
  try {
    const directory = get_schedule_directory()

    const next_trigger_at = parse_schedule({
      schedule_type: argv.type,
      schedule: argv.schedule,
      timezone: argv.timezone,
      last_triggered_at: null
    })

    if (!next_trigger_at) {
      throw new Error(`Invalid schedule: ${argv.schedule}`)
    }

    const title = argv.title || argv.cmd.split(' ')[0]
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50)

    if (!slug) {
      throw new Error('Cannot generate valid filename from title/command')
    }

    const folder = argv.folder || ''
    const file_name = `${slug}.md`
    const file_path = folder
      ? path.join(directory, folder, file_name)
      : path.join(directory, file_name)

    // Check if file already exists
    try {
      await fs.access(file_path)
      throw new Error(`Schedule already exists: ${file_name}`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }

    await fs.mkdir(path.dirname(file_path), { recursive: true })

    const now = new Date().toISOString()
    const entity_properties = {
      title: argv.title || argv.cmd,
      type: 'scheduled-command',
      entity_id: uuid(),
      created_at: now,
      updated_at: now,
      user_public_key:
        config.user_public_key ||
        '0000000000000000000000000000000000000000000000000000000000000000',
      command: argv.cmd,
      schedule_type: argv.type,
      schedule: argv.schedule,
      enabled: true,
      next_trigger_at
    }

    if (argv.timezone) entity_properties.timezone = argv.timezone
    if (argv.cwd) entity_properties.working_directory = argv.cwd
    if (argv.tags)
      entity_properties.queue_tags = argv.tags.split(',').map((t) => t.trim())
    if (argv.priority) entity_properties.queue_priority = argv.priority
    if (argv.timeout) entity_properties.timeout_ms = argv.timeout

    await write_entity_to_filesystem({
      absolute_path: file_path,
      entity_properties,
      entity_type: 'scheduled-command',
      entity_content: ''
    })

    if (argv.json) {
      console.log(
        JSON.stringify({
          file: path.relative(directory, file_path),
          next_trigger_at
        })
      )
    } else {
      console.log(
        `${path.relative(directory, file_path)}\tcreated\t${next_trigger_at}`
      )
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function toggle_schedule({ file_path, enabled }) {
  const result = await read_entity_from_filesystem({ absolute_path: file_path })

  if (!result.success) {
    throw new Error(`Failed to read schedule: ${result.error}`)
  }

  const { entity_properties, entity_content } = result

  if (entity_properties.type !== 'scheduled-command') {
    throw new Error(`Not a scheduled-command entity`)
  }

  const now = new Date().toISOString()
  const updated_properties = {
    ...entity_properties,
    enabled,
    updated_at: now
  }

  if (enabled && !updated_properties.next_trigger_at) {
    updated_properties.next_trigger_at = parse_schedule({
      schedule_type: updated_properties.schedule_type,
      schedule: updated_properties.schedule,
      timezone: updated_properties.timezone,
      last_triggered_at: updated_properties.last_triggered_at
    })
  }

  await write_entity_to_filesystem({
    absolute_path: file_path,
    entity_properties: updated_properties,
    entity_type: 'scheduled-command',
    entity_content
  })

  return updated_properties
}

async function handle_enable(argv) {
  let exit_code = 0
  try {
    const file_path = resolve_schedule_path(argv.file)
    await toggle_schedule({ file_path, enabled: true })

    if (argv.json) {
      console.log(JSON.stringify({ file: argv.file, enabled: true }))
    } else {
      console.log(`${argv.file}\tenabled`)
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_disable(argv) {
  let exit_code = 0
  try {
    const file_path = resolve_schedule_path(argv.file)
    await toggle_schedule({ file_path, enabled: false })

    if (argv.json) {
      console.log(JSON.stringify({ file: argv.file, enabled: false }))
    } else {
      console.log(`${argv.file}\tdisabled`)
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_trigger(argv) {
  let exit_code = 0
  try {
    const file_path = resolve_schedule_path(argv.file)
    const result = await read_entity_from_filesystem({
      absolute_path: file_path
    })

    if (!result.success) {
      throw new Error(`Failed to read schedule: ${result.error}`)
    }

    const trigger_result = await trigger_schedule({
      schedule: result.entity_properties,
      file_path
    })

    if (argv.json) {
      console.log(
        JSON.stringify({
          file: argv.file,
          job_id: trigger_result.job_id,
          next_trigger_at: trigger_result.next_trigger_at
        })
      )
    } else {
      console.log(`${argv.file}\ttriggered\t${trigger_result.job_id}`)
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  } finally {
    await close_cli_queue()
  }
  flush_and_exit(exit_code)
}

async function handle_delete(argv) {
  let exit_code = 0
  try {
    const file_path = resolve_schedule_path(argv.file)
    const result = await read_entity_from_filesystem({
      absolute_path: file_path
    })

    if (!result.success) {
      throw new Error(`Schedule not found: ${argv.file}`)
    }

    if (result.entity_properties.type !== 'scheduled-command') {
      throw new Error(`Not a scheduled-command entity`)
    }

    await fs.unlink(file_path)

    if (argv.json) {
      console.log(JSON.stringify({ file: argv.file, deleted: true }))
    } else {
      console.log(`${argv.file}\tdeleted`)
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
