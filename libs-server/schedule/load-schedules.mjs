import debug from 'debug'
import config from '#config'
import { list_files_recursive } from '#libs-server/repository/filesystem/list-files-recursive.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { parse_schedule } from './parse-schedule.mjs'
import {
  read_schedule_state,
  write_schedule_deferred
} from './schedule-state.mjs'
import { get_current_machine_id } from './machine-identity.mjs'
import { meets_requirements } from './capability.mjs'
import { submit_deferred_report } from '#libs-server/jobs/submit-report.mjs'

const log = debug('schedule:load')

const run_on_machines_alias_warned = new Set()

/**
 * Load all scheduled-command entities from a directory recursively
 * @param {Object} params
 * @param {string} params.directory - Base directory to scan for scheduled-command entities
 * @returns {Promise<Object[]>} Array of schedule objects with entity properties and file paths
 */
export const load_schedules = async ({ directory }) => {
  log(`Loading schedules from ${directory}`)

  try {
    // Find all markdown files in the directory
    const files = await list_files_recursive({
      directory,
      file_extension: '.md',
      absolute_paths: true
    })

    log(`Found ${files.length} markdown files`)

    // Read all files in parallel
    const read_results = await Promise.all(
      files.map(async (file_path) => {
        const result = await read_entity_from_filesystem({
          absolute_path: file_path
        })
        return { file_path, result }
      })
    )

    // Read runtime state (last_triggered_at per entity)
    const state = await read_schedule_state({ directory })

    const schedules = []

    for (const { file_path, result } of read_results) {
      if (!result.success) {
        if (
          result.error_code &&
          result.error_code !== 'NO_FRONTMATTER' &&
          result.error_code !== 'FILE_NOT_FOUND'
        ) {
          console.warn(
            `Warning: unparseable entity file ${file_path}: ${result.error}`
          )
        }
        log(`Failed to read ${file_path}: ${result.error}`)
        continue
      }

      const { entity_properties } = result

      // Only include scheduled-command entities
      if (entity_properties.type !== 'scheduled_command') {
        continue
      }

      // Determine if schedule is enabled
      const enabled = entity_properties.enabled !== false

      // Merge last_triggered_at from state file (takes precedence over frontmatter)
      const entity_state = state[entity_properties.entity_id]
      const last_triggered_at =
        entity_state?.last_triggered_at || entity_properties.last_triggered_at

      // Always compute next_trigger_at on demand
      const next_trigger_at = enabled
        ? parse_schedule({
            schedule_type: entity_properties.schedule_type,
            schedule: entity_properties.schedule,
            timezone: entity_properties.timezone,
            last_triggered_at,
            created_at: entity_properties.created_at
          })
        : null

      schedules.push({
        ...entity_properties,
        file_path,
        last_triggered_at,
        next_trigger_at,
        enabled
      })
    }

    log(`Loaded ${schedules.length} scheduled-command entities`)
    return schedules
  } catch (error) {
    log(`Error loading schedules: ${error.message}`)
    throw error
  }
}

/**
 * Load schedules that are due for execution
 * @param {Object} params
 * @param {string} params.directory - Base directory to scan for scheduled-command entities
 * @param {Date} [params.now] - Current time (defaults to new Date())
 * @returns {Promise<Object[]>} Array of due schedule objects
 */
export const load_due_schedules = async ({ directory, now = new Date() }) => {
  const schedules = await load_schedules({ directory })
  const current_time = now.toISOString()
  const current_machine = get_current_machine_id()
  const registry = config.machine_registry || {}

  // Compile run_on_machines: [X] -> requires: [host:X] alias on schedules with
  // empty `requires`. Only compiles single-element arrays: multi-element legacy
  // run_on_machines uses any-of semantics ("current machine is in the list"),
  // which has no clean equivalent in requires' set-subset (all-of) semantics.
  // Multi-element legacy schedules continue to be gated by the synchronous
  // run_on_machines check below.
  for (const schedule of schedules) {
    const has_requires =
      Array.isArray(schedule.requires) && schedule.requires.length > 0
    const legacy = schedule.run_on_machines
    if (!has_requires && Array.isArray(legacy) && legacy.length === 1) {
      schedule.requires = [`host:${legacy[0]}`]
      if (
        schedule.entity_id &&
        !run_on_machines_alias_warned.has(schedule.entity_id)
      ) {
        run_on_machines_alias_warned.add(schedule.entity_id)
        log(
          'Schedule %s uses deprecated run_on_machines -- compiled to requires=[%s]',
          schedule.title || schedule.file_path,
          schedule.requires.join(', ')
        )
      }
    }
  }

  // Evaluate ordering: enabled -> due -> run_on_machines (cheap sync) ->
  // meets_requirements (last; only async/network probe).
  const evaluate = async (schedule) => {
    if (!schedule.enabled) return false
    if (!schedule.next_trigger_at) return false
    if (schedule.next_trigger_at > current_time) return false

    const { run_on_machines } = schedule
    if (Array.isArray(run_on_machines) && run_on_machines.length > 0) {
      for (const machine of run_on_machines) {
        if (!registry[machine]) {
          log(
            'Warning: schedule %s references undefined machine "%s"',
            schedule.title || schedule.file_path,
            machine
          )
        }
      }
      if (!current_machine) {
        log(
          'Skipping schedule %s: requires machines %s but current machine is unknown',
          schedule.title || schedule.file_path,
          run_on_machines.join(', ')
        )
        return false
      }
      if (!run_on_machines.includes(current_machine)) {
        log(
          'Skipping schedule %s: targets machines %s, current is %s',
          schedule.title || schedule.file_path,
          run_on_machines.join(', '),
          current_machine
        )
        return false
      }
    }

    if (Array.isArray(schedule.requires) && schedule.requires.length > 0) {
      const cap = await meets_requirements({ requires: schedule.requires })
      if (!cap.ok) {
        log(
          '[capability-deferred] %s missing=[%s]',
          schedule.title || schedule.file_path,
          cap.missing.join(', ')
        )
        try {
          await write_schedule_deferred({
            directory,
            entity_id: schedule.entity_id,
            deferred: { at: current_time, missing: cap.missing }
          })
        } catch (err) {
          log(`schedule-state defer write failed: ${err.message}`)
        }
        if (schedule.entity_id) {
          try {
            await submit_deferred_report({
              entity_id: schedule.entity_id,
              title: schedule.title,
              schedule: schedule.schedule,
              schedule_type: schedule.schedule_type,
              base_uri: schedule.base_uri,
              freshness_window_ms: schedule.freshness_window_ms,
              missing: cap.missing
            })
          } catch (err) {
            log(`submit_deferred_report failed: ${err.message}`)
          }
        }
        return false
      }
    }

    return true
  }

  const evaluated = await Promise.all(
    schedules.map(async (s) => ({ s, keep: await evaluate(s) }))
  )
  const due_schedules = evaluated.filter((e) => e.keep).map((e) => e.s)

  log(
    `Found ${due_schedules.length} due schedules out of ${schedules.length} total (machine: ${current_machine || 'unknown'})`
  )
  return due_schedules
}

export default load_schedules
