#!/usr/bin/env bun
// One-shot migration: rewrite all thread metadata.json files to the canonical
// execution attribution spec.
//
// - Adds top-level `execution: { mode, machine_id, container_runtime, container_name }`
//   classified from raw-data/claude-metadata.json `file_path`.
// - Removes legacy `source.execution_mode`, `source.container_user`, `source.container_name`.
// - Skips test fixture paths (/tmp/repro-timeline/) and ambiguous classifications
//   (writes review_needed:true and excludes from commit set).
// - Records raw-data-missing threads with `execution: null`.
// - Validates each output against the schema before writing; aborts on first
//   schema-violation failure (no partial writes).
// - --dry-run prints summary counts + lists of review_needed and missing-raw-data
//   threads without touching disk.

import fs from 'fs/promises'
import path from 'path'

import { assert_valid_thread_metadata } from '../libs-server/threads/validate-thread-metadata.mjs'

const args = process.argv.slice(2)
const dry_run = args.includes('--dry-run')
const positional = args.filter((a) => !a.startsWith('--'))
const thread_dir = positional[0] || path.resolve(
  process.env.USER_BASE_DIRECTORY || '',
  'thread'
)

const PER_USER_PREFIX = 'base-user-'

const classify_from_file_path = (file_path) => {
  if (typeof file_path !== 'string' || file_path.length === 0) {
    return { kind: 'no-path' }
  }

  // Test fixture
  if (file_path.startsWith('/tmp/repro-timeline/')) {
    return { kind: 'skip', reason: 'test_fixture' }
  }

  // Per-user container, two known root layouts
  let m = file_path.match(/^\/mnt\/md0\/user-containers\/([^/]+)\//)
  if (m) {
    return {
      kind: 'classified',
      execution: {
        mode: 'container',
        machine_id: 'storage',
        container_runtime: 'docker',
        container_name: `${PER_USER_PREFIX}${m[1]}`
      }
    }
  }
  m = file_path.match(/^\/tmp\/user-containers\/([^/]+)\//)
  if (m) {
    return {
      kind: 'classified',
      execution: {
        mode: 'container',
        machine_id: 'storage',
        container_runtime: 'docker',
        container_name: `${PER_USER_PREFIX}${m[1]}`
      }
    }
  }

  // Shared container on storage
  if (
    file_path.startsWith('/home/node/.claude') ||
    file_path.startsWith('/mnt/md0/base-container-data/claude-home/')
  ) {
    return {
      kind: 'classified',
      execution: {
        mode: 'container',
        machine_id: 'storage',
        container_runtime: 'docker',
        container_name: 'base-container'
      }
    }
  }

  // Shared container on macbook (mounted host volume)
  if (file_path.match(/^\/Users\/[^/]+\/\.base-container-data\/claude-home\//)) {
    return {
      kind: 'classified',
      execution: {
        mode: 'container',
        machine_id: 'macbook',
        container_runtime: 'docker',
        container_name: 'base-container'
      }
    }
  }

  // Host on macbook
  if (file_path.match(/^\/Users\/[^/]+\/\.claude/)) {
    return {
      kind: 'classified',
      execution: {
        mode: 'host',
        machine_id: 'macbook',
        container_runtime: null,
        container_name: null
      }
    }
  }

  return { kind: 'ambiguous' }
}

const read_file_path_for_thread = async (tid) => {
  const candidate = path.join(thread_dir, tid, 'raw-data', 'claude-metadata.json')
  try {
    const raw = await fs.readFile(candidate, 'utf8')
    const obj = JSON.parse(raw)
    return typeof obj?.file_path === 'string' ? obj.file_path : null
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

const atomic_write = async (target, content) => {
  const tmp = `${target}.${process.pid}.tmp`
  await fs.writeFile(tmp, content, 'utf8')
  await fs.rename(tmp, target)
}

const main = async () => {
  const entries = await fs.readdir(thread_dir, { withFileTypes: true })
  const ids = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)

  const counts = {
    classified: 0,
    classified_by_mode: { host: 0, container: 0 },
    classified_by_container: new Map(),
    classified_by_machine: new Map(),
    skip_test_fixture: 0,
    raw_data_missing: 0,
    ambiguous: 0,
    legacy_field_removed: 0,
    skipped_non_thread: 0,
    unchanged: 0,
    written: 0,
    aborted: 0
  }
  const review_needed_ids = []
  const raw_data_missing_ids = []
  const skipped_non_thread = []

  for (const tid of ids) {
    const meta_path = path.join(thread_dir, tid, 'metadata.json')
    let raw
    try {
      raw = await fs.readFile(meta_path, 'utf8')
    } catch (e) {
      if (e.code === 'ENOENT') {
        counts.skipped_non_thread++
        skipped_non_thread.push(tid)
        continue
      }
      throw e
    }
    const metadata = JSON.parse(raw)

    const file_path = await read_file_path_for_thread(tid)
    const result = classify_from_file_path(file_path)

    let next_metadata = { ...metadata }
    let touched = false

    // Strip legacy fields uniformly. Apply even when execution stays null so
    // the prior 204 backfill-stamped threads also lose their stale source.*.
    const had_legacy =
      next_metadata.source &&
      ('execution_mode' in next_metadata.source ||
        'container_user' in next_metadata.source ||
        'container_name' in next_metadata.source)
    if (had_legacy) {
      const { execution_mode, container_user, container_name, ...rest } =
        next_metadata.source
      void execution_mode
      void container_user
      void container_name
      next_metadata.source = rest
      counts.legacy_field_removed++
      touched = true
    }

    if (result.kind === 'classified') {
      next_metadata.execution = result.execution
      counts.classified++
      counts.classified_by_mode[result.execution.mode]++
      counts.classified_by_container.set(
        result.execution.container_name || '(host)',
        (counts.classified_by_container.get(
          result.execution.container_name || '(host)'
        ) || 0) + 1
      )
      counts.classified_by_machine.set(
        result.execution.machine_id || '(unknown)',
        (counts.classified_by_machine.get(
          result.execution.machine_id || '(unknown)'
        ) || 0) + 1
      )
      touched = true
    } else if (result.kind === 'no-path') {
      next_metadata.execution = null
      counts.raw_data_missing++
      raw_data_missing_ids.push(tid)
      touched = true
    } else if (result.kind === 'skip') {
      // Test fixture: leave execution untouched (likely null). Strip legacy
      // fields above is still applied; that's intentional.
      counts.skip_test_fixture++
    } else if (result.kind === 'ambiguous') {
      next_metadata.execution = null
      next_metadata.review_needed = true
      counts.ambiguous++
      review_needed_ids.push({ tid, file_path })
      touched = true
    }

    if (!touched) {
      counts.unchanged++
      continue
    }

    // Validate the new metadata before writing. Quarantine pre-existing
    // schema drift (missing required fields, undeclared one-off keys, etc.)
    // as review_needed and exclude from the commit set; this keeps the bulk
    // migration atomic while surfacing the long tail for manual followup.
    try {
      await assert_valid_thread_metadata(next_metadata)
    } catch (e) {
      counts.aborted++
      review_needed_ids.push({
        tid,
        file_path: file_path || '(no raw-data)',
        reason: `schema_violation: ${e.message}`
      })
      continue
    }

    if (result.kind === 'ambiguous') {
      // Hold from commit set per plan. Do not write to disk.
      continue
    }

    if (!dry_run) {
      const out = JSON.stringify(next_metadata, null, 2)
      await atomic_write(meta_path, out)
      counts.written++
    }
  }

  console.log('\n=== migrate-thread-execution-attribution summary ===')
  console.log(`Mode:                    ${dry_run ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Thread dir:              ${thread_dir}`)
  console.log(`Total directories:       ${ids.length}`)
  console.log(`Skipped (no metadata):   ${counts.skipped_non_thread}`)
  console.log(`Classified:              ${counts.classified}`)
  console.log(
    `  by mode:               host=${counts.classified_by_mode.host} container=${counts.classified_by_mode.container}`
  )
  console.log('  by container_name:')
  for (const [k, v] of [...counts.classified_by_container.entries()].sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`    ${k}: ${v}`)
  }
  console.log('  by machine_id:')
  for (const [k, v] of [...counts.classified_by_machine.entries()].sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`    ${k}: ${v}`)
  }
  console.log(`Test fixtures (skip):    ${counts.skip_test_fixture}`)
  console.log(`Raw-data missing:        ${counts.raw_data_missing}`)
  console.log(`Ambiguous (review):      ${counts.ambiguous}`)
  console.log(`Legacy fields removed:   ${counts.legacy_field_removed}`)
  console.log(`Unchanged:               ${counts.unchanged}`)
  console.log(`Written:                 ${counts.written}`)
  console.log(`Aborts:                  ${counts.aborted}`)

  if (skipped_non_thread.length) {
    console.log(`\nNon-thread directories (no metadata.json):`)
    for (const t of skipped_non_thread) console.log(`  ${t}`)
  }
  if (raw_data_missing_ids.length) {
    console.log(`\nRaw-data missing threads (execution=null):`)
    for (const t of raw_data_missing_ids) console.log(`  ${t}`)
  }
  if (review_needed_ids.length) {
    console.log(`\nAmbiguous threads (review_needed=true, NOT written):`)
    for (const r of review_needed_ids) {
      console.log(`  ${r.tid}: ${r.file_path}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
