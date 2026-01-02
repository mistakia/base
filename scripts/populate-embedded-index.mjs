#!/usr/bin/env node
/**
 * Populate embedded database index from filesystem
 */

import fs from 'fs/promises'
import path from 'path'

import config from '#config'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import {
  count_tasks_in_duckdb,
  count_threads_in_duckdb
} from '#libs-server/embedded-database-index/duckdb/duckdb-table-queries.mjs'
import { get_duckdb_connection } from '#libs-server/embedded-database-index/duckdb/duckdb-database-client.mjs'

async function get_files_recursive(dir, pattern) {
  const files = []
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const full_path = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const sub_files = await get_files_recursive(full_path, pattern)
      files.push(...sub_files)
    } else if (entry.isFile() && entry.name.match(pattern)) {
      files.push(full_path)
    }
  }
  return files
}

async function populate_tasks() {
  const task_directory = path.join(config.user_base_directory, 'task')
  const task_files = await get_files_recursive(task_directory, /\.md$/)

  console.log(`Found ${task_files.length} task files`)

  let synced = 0
  let errors = 0

  for (const absolute_path of task_files) {
    try {
      const entity = await read_entity_from_filesystem({
        absolute_path
      })

      const entity_properties = entity?.entity_properties
      if (entity_properties && entity_properties.type === 'task') {
        const relative = path.relative(
          config.user_base_directory,
          absolute_path
        )
        await embedded_index_manager.sync_entity({
          base_uri: entity_properties.base_uri || `user:${relative}`,
          entity_data: entity_properties
        })
        synced++
      }
    } catch (error) {
      errors++
      if (!error.message.includes('ENOENT')) {
        console.error(`Error syncing ${absolute_path}:`, error.message)
      }
    }
  }

  console.log(`Synced ${synced} tasks (${errors} errors)`)
}

async function populate_threads() {
  const thread_directory = path.join(config.user_base_directory, 'thread')
  const thread_dirs = await fs.readdir(thread_directory, {
    withFileTypes: true
  })

  let synced = 0
  let errors = 0

  for (const entry of thread_dirs) {
    if (!entry.isDirectory()) continue

    const thread_id = entry.name
    const metadata_path = path.join(
      thread_directory,
      thread_id,
      'metadata.json'
    )

    try {
      const content = await fs.readFile(metadata_path, 'utf-8')
      const metadata = JSON.parse(content)

      await embedded_index_manager.sync_thread({
        thread_id,
        metadata
      })
      synced++
    } catch (error) {
      errors++
      if (!error.message.includes('ENOENT')) {
        console.error(`Error syncing thread ${thread_id}:`, error.message)
      }
    }
  }

  console.log(`Found and synced ${synced} threads (${errors} errors)`)
}

async function main() {
  console.log('Populating embedded database index...\n')

  try {
    console.log('1. Initializing index manager...')
    await embedded_index_manager.initialize()

    const status = embedded_index_manager.get_index_status()
    console.log(`   Kuzu ready: ${status.kuzu_ready}`)
    console.log(`   DuckDB ready: ${status.duckdb_ready}`)

    console.log('\n2. Populating tasks...')
    await populate_tasks()

    console.log('\n3. Populating threads...')
    await populate_threads()

    console.log('\n4. Verifying counts...')
    const duckdb_connection = await get_duckdb_connection()
    const task_count = await count_tasks_in_duckdb({
      connection: duckdb_connection
    })
    const thread_count = await count_threads_in_duckdb({
      connection: duckdb_connection
    })
    console.log(`   Tasks in index: ${task_count}`)
    console.log(`   Threads in index: ${thread_count}`)

    console.log('\n5. Shutting down...')
    await embedded_index_manager.shutdown()
    console.log('   Done!')

    console.log('\n=== Index population complete ===')
  } catch (error) {
    console.error('Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
