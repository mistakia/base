import { test } from 'node:test'
import assert from 'node:assert'
import fs from 'fs/promises'
import path from 'path'
import { tmpdir } from 'os'

import { list_import_history_files } from '#libs-server/sync/list-import-history-files.mjs'
import { save_import_data } from '#libs-server/sync/save-import-data.mjs'

async function create_temp_import_history() {
  const temp_dir = await fs.mkdtemp(path.join(tmpdir(), 'import-history-test-'))
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

test('list_import_history_files - should list files for specific entity', async () => {
  const temp_dir = await create_temp_import_history()
  const entity_id = 'test-entity-123'
  const external_system = 'github'

  try {
    // Create sample data
    await create_sample_import_data(temp_dir, external_system, entity_id, 3)

    // List files for specific entity
    const result = await list_import_history_files({
      external_system,
      entity_id,
      import_history_base_directory: temp_dir
    })

    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].external_system, external_system)
    assert.strictEqual(result[0].entity_id, entity_id)
    assert.strictEqual(result[0].raw_files.length, 3)
    assert.strictEqual(result[0].processed_files.length, 3)
    assert.strictEqual(result[0].total_files, 6)

    // Verify files are sorted by timestamp (newest first)
    const raw_files = result[0].raw_files
    for (let i = 0; i < raw_files.length - 1; i++) {
      assert.ok(raw_files[i].timestamp >= raw_files[i + 1].timestamp)
    }
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test('list_import_history_files - should list files for external system', async () => {
  const temp_dir = await create_temp_import_history()
  const external_system = 'notion'
  // Use UUID format entity_ids (required for directory scanning)
  const entity_1 = 'c1d2e3f4-a5b6-7890-abcd-ef1234567801'
  const entity_2 = 'c1d2e3f4-a5b6-7890-abcd-ef1234567802'
  const entity_3 = 'c1d2e3f4-a5b6-7890-abcd-ef1234567803'

  try {
    // Create sample data for multiple entities
    await create_sample_import_data(temp_dir, external_system, entity_1, 2)
    await create_sample_import_data(temp_dir, external_system, entity_2, 3)
    await create_sample_import_data(temp_dir, 'github', entity_3, 1) // Different system

    // List files for specific external system
    const result = await list_import_history_files({
      external_system,
      import_history_base_directory: temp_dir
    })

    assert.strictEqual(result.length, 2) // Only notion entities

    const entity_ids = result.map((r) => r.entity_id).sort()
    assert.deepStrictEqual(entity_ids, [entity_1, entity_2].sort())

    // Verify total files
    const total_files = result.reduce((sum, r) => sum + r.total_files, 0)
    assert.strictEqual(total_files, 10) // (2+3) * 2 (raw + processed)
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test('list_import_history_files - should list all entities when no filters', async () => {
  const temp_dir = await create_temp_import_history()
  // Use UUID format entity_ids (required for directory scanning)
  const entity_1 = 'd1e2f3a4-b5c6-7890-abcd-ef1234567801'
  const entity_2 = 'd1e2f3a4-b5c6-7890-abcd-ef1234567802'
  const entity_3 = 'd1e2f3a4-b5c6-7890-abcd-ef1234567803'

  try {
    // Create sample data for multiple systems and entities
    await create_sample_import_data(temp_dir, 'github', entity_1, 2)
    await create_sample_import_data(temp_dir, 'notion', entity_2, 1)
    await create_sample_import_data(temp_dir, 'notion', entity_3, 3)

    // List all files
    const result = await list_import_history_files({
      import_history_base_directory: temp_dir
    })

    assert.strictEqual(result.length, 3)

    const systems = result.map((r) => r.external_system)
    assert.ok(systems.includes('github'))
    assert.ok(systems.includes('notion'))
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test('list_import_history_files - should return empty array for non-existent directory', async () => {
  const temp_dir = await create_temp_import_history()

  try {
    const result = await list_import_history_files({
      external_system: 'github',
      import_history_base_directory: path.join(temp_dir, 'non-existent')
    })

    assert.strictEqual(result.length, 0)
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test('list_import_history_files - should handle entity with only raw files', async () => {
  const temp_dir = await create_temp_import_history()
  const entity_id = 'test-entity-raw-only'
  const external_system = 'github'

  try {
    // Create only raw data (no processed)
    await save_import_data({
      external_system,
      entity_id,
      raw_data: { test: 'data' },
      import_history_base_directory: temp_dir
    })

    const result = await list_import_history_files({
      external_system,
      entity_id,
      import_history_base_directory: temp_dir
    })

    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].raw_files.length, 1)
    assert.strictEqual(result[0].processed_files.length, 0)
    assert.strictEqual(result[0].total_files, 1)
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})

test('list_import_history_files - should include file metadata', async () => {
  const temp_dir = await create_temp_import_history()
  const entity_id = 'test-entity-metadata'
  const external_system = 'notion'

  try {
    await create_sample_import_data(temp_dir, external_system, entity_id, 1)

    const result = await list_import_history_files({
      external_system,
      entity_id,
      import_history_base_directory: temp_dir
    })

    const raw_file = result[0].raw_files[0]
    assert.ok(raw_file.filename)
    assert.ok(raw_file.filepath)
    assert.ok(raw_file.timestamp)
    assert.ok(raw_file.content_id)
    assert.ok(typeof raw_file.size === 'number')
    assert.ok(raw_file.modified instanceof Date)
  } finally {
    await fs.rm(temp_dir, { recursive: true, force: true })
  }
})
