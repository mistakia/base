#!/usr/bin/env bun
import fs from 'fs/promises'
import path from 'path'

import { acquire_thread_import_lock } from '#libs-server/threads/timeline/thread-import-lock.mjs'
import { assert_valid_thread_metadata } from '#libs-server/threads/validate-thread-metadata.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'

const verify_only = process.argv.includes('--verify')

const user_base_directory = process.env.USER_BASE_DIRECTORY
if (!user_base_directory) {
  console.error('USER_BASE_DIRECTORY must be set')
  process.exit(1)
}

const thread_root = get_thread_base_directory({ user_base_directory })

const list_thread_dirs = async () => {
  const entries = await fs.readdir(thread_root, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
}

const read_metadata = async (metadata_path) => {
  const raw = await fs.readFile(metadata_path, 'utf-8')
  return JSON.parse(raw)
}

const write_metadata_atomic = async (metadata_path, metadata) => {
  const tmp_path = `${metadata_path}.tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(tmp_path, JSON.stringify(metadata, null, 2), 'utf-8')
  await fs.rename(tmp_path, metadata_path)
}

const migrate_thread = async (thread_id) => {
  const thread_dir = path.join(thread_root, thread_id)
  const metadata_path = path.join(thread_dir, 'metadata.json')

  let metadata
  try {
    metadata = await read_metadata(metadata_path)
  } catch (error) {
    if (error.code === 'ENOENT') return { status: 'skipped_no_metadata' }
    throw error
  }

  if (!('source' in metadata) && !('external_session' in metadata)) {
    return { status: 'native_skip' }
  }

  if (!('source' in metadata) && 'external_session' in metadata) {
    return { status: 'already_migrated' }
  }

  const { release } = await acquire_thread_import_lock({ thread_dir })
  try {
    metadata = await read_metadata(metadata_path)
    if (!('source' in metadata)) {
      return { status: 'already_migrated_under_lock' }
    }

    const source_value = metadata.source
    const had_collision = 'external_session' in metadata
    if (had_collision) {
      console.error(
        `${thread_id}: collision -- overwriting legacy external_session with source. ` +
          `legacy=${JSON.stringify(metadata.external_session)}`
      )
    }

    metadata.external_session = source_value
    delete metadata.source

    await write_metadata_atomic(metadata_path, metadata)
    return {
      status: had_collision ? 'collision_resolved' : 'migrated'
    }
  } finally {
    await release()
  }
}

const verify_thread = async (thread_id) => {
  const thread_dir = path.join(thread_root, thread_id)
  const metadata_path = path.join(thread_dir, 'metadata.json')
  let metadata
  try {
    metadata = await read_metadata(metadata_path)
  } catch (error) {
    if (error.code === 'ENOENT') return { ok: true, status: 'no_metadata' }
    return { ok: false, status: 'read_error', error: error.message }
  }
  try {
    await assert_valid_thread_metadata(metadata)
    return { ok: true, status: 'valid' }
  } catch (error) {
    return { ok: false, status: 'invalid', error: error.message }
  }
}

const run_migrate = async () => {
  const thread_ids = await list_thread_dirs()
  console.log(`Scanning ${thread_ids.length} thread dirs under ${thread_root}`)

  const counters = {
    native_skip: 0,
    already_migrated: 0,
    already_migrated_under_lock: 0,
    migrated: 0,
    collision_resolved: 0,
    skipped_no_metadata: 0,
    errors: 0
  }

  for (const thread_id of thread_ids) {
    try {
      const result = await migrate_thread(thread_id)
      counters[result.status] = (counters[result.status] || 0) + 1
    } catch (error) {
      counters.errors += 1
      console.error(`${thread_id}: migration error: ${error.message}`)
    }
  }

  console.log('Migration summary:')
  for (const [key, count] of Object.entries(counters)) {
    console.log(`  ${key}: ${count}`)
  }

  if (counters.errors > 0) process.exit(1)
}

const run_verify = async () => {
  const thread_ids = await list_thread_dirs()
  console.log(
    `Verifying ${thread_ids.length} thread dirs under ${thread_root}`
  )

  let valid = 0
  let invalid = 0
  for (const thread_id of thread_ids) {
    const result = await verify_thread(thread_id)
    if (result.ok) {
      valid += 1
    } else {
      invalid += 1
      console.error(`${thread_id}: ${result.status}: ${result.error || ''}`)
    }
  }

  console.log(`verify: ${valid} valid, ${invalid} invalid`)
  if (invalid > 0) process.exit(1)
}

if (verify_only) {
  await run_verify()
} else {
  await run_migrate()
}
