#!/usr/bin/env bun

/**
 * One-time migration script to remove dead tool names from thread metadata.
 *
 * Removes tool names that were injected by the deleted internal agent loop:
 * - Thread tools: archive_thread, pause_execution, message_notify, message_ask
 * - DEFAULT_THREAD_TOOLS: task_get, list_tasks, task_create, task_update, task_delete,
 *   file_read, file_list, file_write, file_delete, file_diff, file_search,
 *   message_notify_creator, message_ask_creator
 *
 * Also cleans source.provider if it equals "base" (deleted provider).
 *
 * Usage:
 *   node cli/cleanup-thread-tools-metadata.mjs --dry-run   # Preview changes
 *   node cli/cleanup-thread-tools-metadata.mjs              # Apply changes
 */

import fs from 'fs/promises'
import path from 'path'

import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'

const DEAD_TOOL_NAMES = new Set([
  // Thread tools (from deleted thread-tools.mjs)
  'archive_thread',
  'pause_execution',
  'message_notify',
  'message_ask',
  // DEFAULT_THREAD_TOOLS (from deleted constant in thread-constants.mjs)
  'task_get',
  'list_tasks',
  'task_create',
  'task_update',
  'task_delete',
  'file_read',
  'file_list',
  'file_write',
  'file_delete',
  'file_diff',
  'file_search',
  'message_notify_creator',
  'message_ask_creator'
])

async function main() {
  const dry_run = process.argv.includes('--dry-run')

  if (dry_run) {
    console.log('[DRY RUN] No files will be modified.\n')
  }

  const user_base_directory = get_user_base_directory()
  const thread_base_directory = get_thread_base_directory({
    user_base_directory
  })

  let entries
  try {
    entries = await fs.readdir(thread_base_directory, { withFileTypes: true })
  } catch (error) {
    console.error(`Failed to read thread directory: ${error.message}`)
    process.exit(1)
  }

  const thread_dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)

  let modified_count = 0
  let skipped_count = 0
  let error_count = 0

  for (const thread_id of thread_dirs) {
    const metadata_path = path.join(
      thread_base_directory,
      thread_id,
      'metadata.json'
    )

    let raw
    try {
      raw = await fs.readFile(metadata_path, 'utf-8')
    } catch {
      // No metadata.json in this directory
      skipped_count++
      continue
    }

    let metadata
    try {
      metadata = JSON.parse(raw)
    } catch (error) {
      console.error(`  [ERROR] Invalid JSON in ${thread_id}: ${error.message}`)
      error_count++
      continue
    }

    let changed = false

    // Clean tools array
    if (Array.isArray(metadata.tools)) {
      const cleaned_tools = metadata.tools.filter(
        (t) => !DEAD_TOOL_NAMES.has(t)
      )
      if (cleaned_tools.length !== metadata.tools.length) {
        const removed = metadata.tools.filter((t) => DEAD_TOOL_NAMES.has(t))
        if (dry_run) {
          console.log(
            `  ${thread_id}: would remove ${removed.length} dead tools: ${removed.join(', ')}`
          )
        }
        metadata.tools = cleaned_tools
        changed = true
      }
    }

    // Clean source.provider if it equals "base"
    if (metadata.source && metadata.source.provider === 'base') {
      if (dry_run) {
        console.log(`  ${thread_id}: would remove source.provider "base"`)
      }
      delete metadata.source.provider
      changed = true
    }

    if (!changed) {
      skipped_count++
      continue
    }

    modified_count++

    if (!dry_run) {
      await fs.writeFile(
        metadata_path,
        JSON.stringify(metadata, null, 2) + '\n',
        'utf-8'
      )
    }
  }

  console.log(`\nSummary:`)
  console.log(`  Total threads: ${thread_dirs.length}`)
  console.log(`  Modified: ${modified_count}`)
  console.log(`  Skipped: ${skipped_count}`)
  if (error_count > 0) {
    console.log(`  Errors: ${error_count}`)
  }
  if (dry_run) {
    console.log(`\nRe-run without --dry-run to apply changes.`)
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`)
  process.exit(1)
})
