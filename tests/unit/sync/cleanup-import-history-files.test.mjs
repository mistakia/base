import { expect } from 'chai'
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

describe('cleanup_import_history_files', () => {
  it('should keep specified number of files', async () => {
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

      expect(result.entities_processed).to.equal(1)
      expect(result.raw_files_deleted).to.equal(3) // 5 - 2 = 3
      expect(result.processed_files_deleted).to.equal(3)
      expect(result.total_files_deleted).to.equal(6)
      expect(result.errors.length).to.equal(0)

      // Verify files remain
      const raw_dir = path.join(temp_dir, external_system, entity_id, 'raw')
      const processed_dir = path.join(
        temp_dir,
        external_system,
        entity_id,
        'processed'
      )

      expect(await count_files_in_directory(raw_dir)).to.equal(2)
      expect(await count_files_in_directory(processed_dir)).to.equal(2)
    } finally {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should handle dry run mode', async () => {
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

      expect(result.entities_processed).to.equal(1)
      expect(result.total_files_deleted).to.equal(6) // Still counts what would be deleted
      expect(result.errors.length).to.equal(0)

      // Verify no files were actually deleted
      const raw_dir = path.join(temp_dir, external_system, entity_id, 'raw')
      const processed_dir = path.join(
        temp_dir,
        external_system,
        entity_id,
        'processed'
      )

      expect(await count_files_in_directory(raw_dir)).to.equal(4)
      expect(await count_files_in_directory(processed_dir)).to.equal(4)
    } finally {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should handle multiple entities', async () => {
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

      expect(result.entities_processed).to.equal(2) // Only github entities
      expect(result.raw_files_deleted).to.equal(5) // (3-1) + (4-1)
      expect(result.processed_files_deleted).to.equal(5)
      expect(result.total_files_deleted).to.equal(10)

      // Verify notion entity untouched
      const notion_raw_dir = path.join(temp_dir, 'notion', entity_3, 'raw')
      expect(await count_files_in_directory(notion_raw_dir)).to.equal(2)
    } finally {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should not delete when files <= keep_count', async () => {
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

      expect(result.entities_processed).to.equal(1)
      expect(result.total_files_deleted).to.equal(0)

      // Verify all files remain
      const raw_dir = path.join(temp_dir, external_system, entity_id, 'raw')
      const processed_dir = path.join(
        temp_dir,
        external_system,
        entity_id,
        'processed'
      )

      expect(await count_files_in_directory(raw_dir)).to.equal(2)
      expect(await count_files_in_directory(processed_dir)).to.equal(2)
    } finally {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should handle entity with raw files only', async () => {
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

      expect(result.raw_files_deleted).to.equal(2)
      expect(result.processed_files_deleted).to.equal(0)
      expect(result.total_files_deleted).to.equal(2)

      const raw_dir = path.join(temp_dir, external_system, entity_id, 'raw')
      expect(await count_files_in_directory(raw_dir)).to.equal(1)
    } finally {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })
})

describe('get_cleanup_summary', () => {
  it('should provide accurate statistics', async () => {
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

      expect(summary.entities_total).to.equal(2)
      expect(summary.entities_with_excess_files).to.equal(2)
      expect(summary.total_files).to.equal(16) // (5+3) * 2 files each
      expect(summary.files_to_delete).to.equal(8) // (5-2)*2 + (3-2)*2

      // Check by-system breakdown
      expect(summary.by_system.github).to.exist
      expect(summary.by_system.notion).to.exist
      expect(summary.by_system.github.entities).to.equal(1)
      expect(summary.by_system.notion.entities).to.equal(1)
      expect(summary.by_system.github.files_to_delete).to.equal(6) // (5-2)*2
      expect(summary.by_system.notion.files_to_delete).to.equal(2) // (3-2)*2
    } finally {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should handle no entities', async () => {
    const temp_dir = await create_temp_import_history()

    try {
      const summary = await get_cleanup_summary({
        import_history_base_directory: temp_dir
      })

      expect(summary.entities_total).to.equal(0)
      expect(summary.entities_with_excess_files).to.equal(0)
      expect(summary.total_files).to.equal(0)
      expect(summary.files_to_delete).to.equal(0)
      expect(summary.bytes_total).to.equal(0)
      expect(summary.bytes_to_free).to.equal(0)
    } finally {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })
})
