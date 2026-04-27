import path from 'path'
import fs from 'fs/promises'

import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'

const AUDIT_FILE = 'audit.jsonl'

export const format_audit_entry = (entry) => {
  const fields = Object.keys(entry.fields_changed || {}).join(',') || '(none)'
  const token = entry.lease_token || '-'
  return `${entry.ts}  ${entry.op}  ${entry.actor || '-'}  fields=[${fields}]  lease_token=${token}`
}

export const passes_audit_filters = (entry, { field, since, actor }) => {
  if (actor && entry.actor !== actor) return false
  if (since) {
    const entry_ts = new Date(entry.ts)
    if (isNaN(entry_ts.getTime()) || entry_ts < since) return false
  }
  if (field && !Object.prototype.hasOwnProperty.call(entry.fields_changed || {}, field)) return false
  return true
}

const handle_audit = async (argv) => {
  const user_base_directory = get_user_base_directory()
  const audit_path = path.join(user_base_directory, 'thread', argv.thread_id, AUDIT_FILE)

  let raw
  try {
    raw = await fs.readFile(audit_path, 'utf-8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.exit(0)
    }
    process.stderr.write(`error reading audit log: ${err.message}\n`)
    process.exit(1)
  }

  const since = argv.since ? new Date(argv.since) : null
  const lines = raw.split('\n').filter((l) => l.trim().length > 0)

  for (const line of lines) {
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      process.stderr.write(`warn: skipping malformed audit line: ${line.slice(0, 120)}\n`)
      continue
    }

    if (!passes_audit_filters(entry, { field: argv.field, since, actor: argv.actor })) continue

    if (argv.json) {
      process.stdout.write(`${JSON.stringify(entry)}\n`)
    } else {
      process.stdout.write(`${format_audit_entry(entry)}\n`)
    }
  }
}

export const register_audit_commands = (yargs) =>
  yargs.command(
    'audit <thread_id>',
    'Query the audit log for a thread',
    (y) =>
      y
        .positional('thread_id', {
          describe: 'Thread ID',
          type: 'string'
        })
        .option('field', {
          describe: 'Filter to entries where this field appears in fields_changed',
          type: 'string'
        })
        .option('since', {
          describe: 'Filter to entries with ts >= this ISO 8601 timestamp',
          type: 'string'
        })
        .option('actor', {
          describe: 'Filter to entries with this exact actor (public key or base-system)',
          type: 'string'
        })
        .option('json', {
          describe: 'Output raw JSONL (one entry per line)',
          type: 'boolean',
          default: false
        }),
    handle_audit
  )
