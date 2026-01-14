import { expect } from 'chai'
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

describe('list_import_history_files', () => {
  it('should list files for specific entity', async () => {
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

      expect(result.length).to.equal(1)
      expect(result[0].external_system).to.equal(external_system)
      expect(result[0].entity_id).to.equal(entity_id)
      expect(result[0].raw_files.length).to.equal(3)
      expect(result[0].processed_files.length).to.equal(3)
      expect(result[0].total_files).to.equal(6)

      // Verify files are sorted by timestamp (newest first)
      const raw_files = result[0].raw_files
      for (let i = 0; i < raw_files.length - 1; i++) {
        expect(raw_files[i].timestamp >= raw_files[i + 1].timestamp).to.be.true
      }
    } finally {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should list files for external system', async () => {
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

      expect(result.length).to.equal(2) // Only notion entities

      const entity_ids = result.map((r) => r.entity_id).sort()
      expect(entity_ids).to.deep.equal([entity_1, entity_2].sort())

      // Verify total files
      const total_files = result.reduce((sum, r) => sum + r.total_files, 0)
      expect(total_files).to.equal(10) // (2+3) * 2 (raw + processed)
    } finally {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should list all entities when no filters', async () => {
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

      expect(result.length).to.equal(3)

      const systems = result.map((r) => r.external_system)
      expect(systems).to.include('github')
      expect(systems).to.include('notion')
    } finally {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should return empty array for non-existent directory', async () => {
    const temp_dir = await create_temp_import_history()

    try {
      const result = await list_import_history_files({
        external_system: 'github',
        import_history_base_directory: path.join(temp_dir, 'non-existent')
      })

      expect(result.length).to.equal(0)
    } finally {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should handle entity with only raw files', async () => {
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

      expect(result.length).to.equal(1)
      expect(result[0].raw_files.length).to.equal(1)
      expect(result[0].processed_files.length).to.equal(0)
      expect(result[0].total_files).to.equal(1)
    } finally {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should include file metadata', async () => {
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
      expect(raw_file.filename).to.exist
      expect(raw_file.filepath).to.exist
      expect(raw_file.timestamp).to.exist
      expect(raw_file.content_id).to.exist
      expect(typeof raw_file.size).to.equal('number')
      expect(raw_file.modified instanceof Date).to.be.true
    } finally {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })
})
