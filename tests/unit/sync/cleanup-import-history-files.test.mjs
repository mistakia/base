import { test } from 'node:test'
import assert from 'node:assert'
import fs from 'fs/promises'
import path from 'path'
import { tmpdir } from 'os'

import {
  cleanup_import_history_files,
  get_cleanup_summary
} from '#libs-server/sync/cleanup-import-history-files.mjs'
import { save_import_data } from '#libs-server/sync/save-import-data.mjs'

async function create_temp_import_history() {
  const temp_dir = await fs.mkdtemp(path.join(tmpdir(), 'cleanup-test-'))
  return temp_dir
}

async function create_sample_import_data(
  base_dir,
  external_system,
  entity_id,
  count = 3
) {
  const files = []

  for (let i = 0; i < count; i++) {
    const raw_data = {
      id: `test-item-${i}`,
      name: `Test Item ${i}`,
      timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000) // Past days
    }

    const processed_data = {
      entity_id,
      name: raw_data.name,
      type: 'test',
      normalized_timestamp: raw_data.timestamp
    }

    const result = await save_import_data({
      external_system,
      entity_id,
      raw_data,
      processed_data,
      import_history_base_directory: base_dir
    })

    files.push(result)
  }

  return files
}

async function count_files_in_directory(dir_path) {
  try {
    const files = await fs.readdir(dir_path)
    return files.filter((f) => f.endsWith('.json')).length
  } catch {
    return 0
  }
}

test('cleanup_import_history_files - should keep specified number of files', async () => {
  const temp_dir = await create_temp_import_history()
  const entity_id = 'test-entity-cleanup'
  const external_system = 'github'

  try {
    // Create 5 files, keep 2
    await create_sample_import_data(temp_dir, external_system, entity_id, 5)

    const result = await cleanup_import_history_files({
      external_system,
      entity_id,
      keep_count: 2,
      import_history_base_directory: temp_dir
    })

    assert.strictEqual(result.entities_processed, 1)
    assert.strictEqual(result.raw_files_deleted, 3) // 5 - 2 = 3
    assert.strictEqual(result.processed_files_deleted, 3)
    assert.strictEqual(result.total_files_deleted, 6)
    assert.strictEqual(result.errors.length, 0)

    // Verify files remain
    const raw_dir = path.join(temp_dir, external_system, entity_id, 'raw')
    const processed_dir = path.join(
      temp_dir,
      external_system,
      entity_id,
      'processed'
    )

    assert.strictEqual(await count_files_in_directory(raw_dir), 2)
    assert.strictEqual(await count_files_in_directory(processed_dir), 2)
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test('cleanup_import_history_files - should handle dry run mode', async () => {
  const temp_dir = await create_temp_import_history()
  const entity_id = 'test-entity-dry-run'
  const external_system = 'notion'

  try {
    await create_sample_import_data(temp_dir, external_system, entity_id, 4)

    const result = await cleanup_import_history_files({
      external_system,
      entity_id,
      keep_count: 1,
      dry_run: true,
      import_history_base_directory: temp_dir
    })

    assert.strictEqual(result.entities_processed, 1)
    assert.strictEqual(result.total_files_deleted, 6) // Still counts what would be deleted
    assert.strictEqual(result.errors.length, 0)

    // Verify no files were actually deleted
    const raw_dir = path.join(temp_dir, external_system, entity_id, 'raw')
    const processed_dir = path.join(
      temp_dir,
      external_system,
      entity_id,
      'processed'
    )

    assert.strictEqual(await count_files_in_directory(raw_dir), 4)
    assert.strictEqual(await count_files_in_directory(processed_dir), 4)
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test('cleanup_import_history_files - should handle multiple entities', async () => {
  const temp_dir = await create_temp_import_history()
  const external_system = 'github'
  // Use UUID format entity_ids (required for directory scanning)
  const entity_1 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567801'
  const entity_2 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567802'
  const entity_3 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567803'

  try {
    await create_sample_import_data(temp_dir, external_system, entity_1, 3)
    await create_sample_import_data(temp_dir, external_system, entity_2, 4)
    await create_sample_import_data(temp_dir, 'notion', entity_3, 2) // Different system

    const result = await cleanup_import_history_files({
      external_system, // Only github
      keep_count: 1,
      import_history_base_directory: temp_dir
    })

    assert.strictEqual(result.entities_processed, 2) // Only github entities
    assert.strictEqual(result.raw_files_deleted, 5) // (3-1) + (4-1)
    assert.strictEqual(result.processed_files_deleted, 5)
    assert.strictEqual(result.total_files_deleted, 10)

    // Verify notion entity untouched
    const notion_raw_dir = path.join(temp_dir, 'notion', entity_3, 'raw')
    assert.strictEqual(await count_files_in_directory(notion_raw_dir), 2)
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test('cleanup_import_history_files - should not delete when files <= keep_count', async () => {
  const temp_dir = await create_temp_import_history()
  const entity_id = 'test-entity-no-delete'
  const external_system = 'github'

  try {
    await create_sample_import_data(temp_dir, external_system, entity_id, 2)

    const result = await cleanup_import_history_files({
      external_system,
      entity_id,
      keep_count: 5, // More than existing files
      import_history_base_directory: temp_dir
    })

    assert.strictEqual(result.entities_processed, 1)
    assert.strictEqual(result.total_files_deleted, 0)

    // Verify all files remain
    const raw_dir = path.join(temp_dir, external_system, entity_id, 'raw')
    const processed_dir = path.join(
      temp_dir,
      external_system,
      entity_id,
      'processed'
    )

    assert.strictEqual(await count_files_in_directory(raw_dir), 2)
    assert.strictEqual(await count_files_in_directory(processed_dir), 2)
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test('get_cleanup_summary - should provide accurate statistics', async () => {
  const temp_dir = await create_temp_import_history()
  // Use UUID format entity_ids (required for directory scanning)
  const entity_1 = 'b1c2d3e4-f5a6-7890-abcd-ef1234567801'
  const entity_2 = 'b1c2d3e4-f5a6-7890-abcd-ef1234567802'

  try {
    await create_sample_import_data(temp_dir, 'github', entity_1, 5)
    await create_sample_import_data(temp_dir, 'notion', entity_2, 3)

    const summary = await get_cleanup_summary({
      keep_count: 2,
      import_history_base_directory: temp_dir
    })

    assert.strictEqual(summary.entities_total, 2)
    assert.strictEqual(summary.entities_with_excess_files, 2)
    assert.strictEqual(summary.total_files, 16) // (5+3) * 2 files each
    assert.strictEqual(summary.files_to_delete, 8) // (5-2)*2 + (3-2)*2

    // Check by-system breakdown
    assert.ok(summary.by_system.github)
    assert.ok(summary.by_system.notion)
    assert.strictEqual(summary.by_system.github.entities, 1)
    assert.strictEqual(summary.by_system.notion.entities, 1)
    assert.strictEqual(summary.by_system.github.files_to_delete, 6) // (5-2)*2
    assert.strictEqual(summary.by_system.notion.files_to_delete, 2) // (3-2)*2
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test('get_cleanup_summary - should handle no entities', async () => {
  const temp_dir = await create_temp_import_history()

  try {
    const summary = await get_cleanup_summary({
      import_history_base_directory: temp_dir
    })

    assert.strictEqual(summary.entities_total, 0)
    assert.strictEqual(summary.entities_with_excess_files, 0)
    assert.strictEqual(summary.total_files, 0)
    assert.strictEqual(summary.files_to_delete, 0)
    assert.strictEqual(summary.bytes_total, 0)
    assert.strictEqual(summary.bytes_to_free, 0)
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test('cleanup_import_history_files - should handle entity with raw files only', async () => {
  const temp_dir = await create_temp_import_history()
  const entity_id = 'test-entity-raw-only'
  const external_system = 'github'

  try {
    // Create raw files only
    for (let i = 0; i < 3; i++) {
      await save_import_data({
        external_system,
        entity_id,
        raw_data: { test: `data-${i}` },
        // No processed_data
        import_history_base_directory: temp_dir
      })
    }

    const result = await cleanup_import_history_files({
      external_system,
      entity_id,
      keep_count: 1,
      import_history_base_directory: temp_dir
    })

    assert.strictEqual(result.raw_files_deleted, 2)
    assert.strictEqual(result.processed_files_deleted, 0)
    assert.strictEqual(result.total_files_deleted, 2)

    const raw_dir = path.join(temp_dir, external_system, entity_id, 'raw')
    assert.strictEqual(await count_files_in_directory(raw_dir), 1)
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})
