import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'

import {
  get_import_directory_paths,
  save_import_data,
  find_previous_import_files,
  record_import_history,
  get_sync_history,
  find_recent_conflicts
} from '#libs-server/integrations/sync/import-manager.mjs'
import {
  create_temp_test_directory,
  reset_all_tables,
  create_test_user
} from '#tests/utils/index.mjs'
import db from '#db'

describe('Import Manager Unit Tests', () => {
  let temp_dir
  let test_sync_id
  let test_entity_id
  let test_external_system
  let test_user

  before(async () => {
    // Create a temporary directory for tests
    temp_dir = create_temp_test_directory('import-manager-test-')

    // Reset database tables
    await reset_all_tables()

    // Create a test user
    test_user = await create_test_user()

    // Set up test constants using proper UUIDs
    test_sync_id = uuid()
    test_entity_id = uuid()
    test_external_system = 'github-test'

    // First create an entity in the database (needed due to foreign key constraint)
    await db('entities').insert({
      entity_id: test_entity_id,
      title: 'Test Entity for Import Manager',
      type: 'task',
      user_id: test_user.user_id,
      description: 'Test entity for import manager tests',
      content: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    // Then insert a test sync record for use in tests
    await db('external_syncs').insert({
      sync_id: test_sync_id,
      entity_id: test_entity_id,
      external_system: test_external_system,
      external_id: 'ext-123',
      last_sync_at: new Date().toISOString()
    })
  })

  after(async () => {
    // Clean up temporary directory after tests
    if (temp_dir) {
      temp_dir.cleanup()
    }

    // Clean up database in reverse order to respect foreign key constraints
    await db('sync_conflicts').where('sync_id', test_sync_id).delete()
    await db('external_syncs').where('sync_id', test_sync_id).delete()
    await db('entities').where('entity_id', test_entity_id).delete()
  })

  describe('get_import_directory_paths', () => {
    it('should return paths with default base directory', () => {
      const paths = get_import_directory_paths({
        external_system: 'github',
        entity_id: '12345'
      })

      expect(paths).to.have.property('base_path')
      expect(paths).to.have.property('system_path')
      expect(paths).to.have.property('entity_path')
      expect(paths).to.have.property('raw_path')
      expect(paths).to.have.property('processed_path')

      expect(paths.system_path).to.include('github')
      expect(paths.entity_path).to.include('12345')
    })

    it('should use a custom base directory when provided', () => {
      const paths = get_import_directory_paths({
        external_system: 'github',
        entity_id: '12345',
        import_history_base_directory: temp_dir.path
      })

      expect(paths.base_path).to.equal(temp_dir.path)
      expect(paths.system_path).to.equal(path.join(temp_dir.path, 'github'))
      expect(paths.entity_path).to.equal(
        path.join(temp_dir.path, 'github', '12345')
      )
      expect(paths.raw_path).to.equal(
        path.join(temp_dir.path, 'github', '12345', 'raw')
      )
      expect(paths.processed_path).to.equal(
        path.join(temp_dir.path, 'github', '12345', 'processed')
      )
    })
  })

  describe('save_import_data and find_previous_import_files', () => {
    const external_system = 'github'
    const entity_id = 'test-entity-123'
    const test_data = {
      id: 123,
      name: 'Test Issue',
      description: 'This is a test issue'
    }
    const processed_data = {
      id: '123',
      name: 'Test Issue (Processed)',
      description: 'Processed description'
    }

    it('should save raw and processed import data to the specified directory', async () => {
      const result = await save_import_data({
        external_system,
        entity_id,
        raw_data: test_data,
        processed_data,
        import_history_base_directory: temp_dir.path
      })

      expect(result).to.have.property('raw_filepath')
      expect(result).to.have.property('processed_filepath')
      expect(result).to.have.property('raw_data_cid')
      expect(result).to.have.property('timestamp')

      // Verify files were created
      expect(fs.existsSync(result.raw_filepath)).to.be.true
      expect(fs.existsSync(result.processed_filepath)).to.be.true

      // Verify file content
      const raw_content = JSON.parse(
        fs.readFileSync(result.raw_filepath, 'utf8')
      )
      const processed_content = JSON.parse(
        fs.readFileSync(result.processed_filepath, 'utf8')
      )

      expect(raw_content).to.deep.equal(test_data)
      expect(processed_content).to.deep.equal(processed_data)
    })

    it('should find previous import files', async () => {
      const previous = find_previous_import_files({
        external_system,
        entity_id,
        import_history_base_directory: temp_dir.path
      })

      expect(previous).to.not.be.null
      expect(previous).to.have.property('raw_filepath')
      expect(previous).to.have.property('processed_filepath')
      expect(previous).to.have.property('import_cid')
      expect(previous).to.have.property('raw_data')
      expect(previous).to.have.property('processed_data')

      expect(previous.raw_data).to.deep.equal(test_data)
      expect(previous.processed_data).to.deep.equal(processed_data)
    })

    it('should return null when no previous imports exist', () => {
      const nonexistent_entity = 'nonexistent-entity'
      const previous = find_previous_import_files({
        external_system,
        entity_id: nonexistent_entity,
        import_history_base_directory: temp_dir.path
      })

      expect(previous).to.be.null
    })
  })

  describe('record_import_history', () => {
    const raw_data = { id: 456, title: 'Test Import Record' }
    let import_cid

    before(async () => {
      // Generate a unique import CID for testing
      import_cid = 'import-cid-' + Date.now()
    })

    after(async () => {
      // Clean up test records
      await db('sync_conflicts')
        .where({
          sync_id: test_sync_id,
          import_cid
        })
        .delete()
    })

    it('should create a new history record when none exists', async () => {
      const result = await record_import_history({
        sync_id: test_sync_id,
        raw_data,
        import_cid
      })

      expect(result).to.be.an('object')
      expect(result).to.have.property('sync_id', test_sync_id)
      expect(result).to.have.property('import_cid', import_cid)
      expect(result).to.have.property('status', 'new')

      // Verify the record was actually created in the database
      const db_record = await db('sync_conflicts')
        .where({
          sync_id: test_sync_id,
          import_cid
        })
        .first()

      expect(db_record).to.not.be.null
      expect(db_record.sync_id).to.equal(test_sync_id)
      expect(db_record.import_cid).to.equal(import_cid)
    })

    it('should return existing record when import already exists', async () => {
      // First call should have created the record, so this should find it
      const result = await record_import_history({
        sync_id: test_sync_id,
        raw_data,
        import_cid
      })

      expect(result).to.be.an('object')
      expect(result).to.have.property('sync_id', test_sync_id)
      expect(result).to.have.property('import_cid', import_cid)

      // No new record should have been created
      const records = await db('sync_conflicts')
        .where({
          sync_id: test_sync_id,
          import_cid
        })
        .count('* as count')

      expect(parseInt(records[0].count)).to.equal(1)
    })

    it('should handle an invalid sync_id gracefully', async () => {
      const invalid_sync_id = uuid() // Use a valid UUID format that doesn't exist

      try {
        await record_import_history({
          sync_id: invalid_sync_id,
          raw_data,
          import_cid: 'new-import-cid'
        })

        // The function should handle foreign key constraints
        // If it doesn't throw, make sure a record wasn't created
        const record = await db('sync_conflicts')
          .where({
            sync_id: invalid_sync_id,
            import_cid: 'new-import-cid'
          })
          .first()

        expect(record).to.be.undefined
      } catch (error) {
        // It's also acceptable if it throws due to FK constraint
        expect(error.message).to.include('foreign key constraint')
      }
    })
  })

  describe('get_sync_history', () => {
    const import_cids = []

    before(async () => {
      // Create multiple history records for testing
      for (let i = 0; i < 3; i++) {
        const import_cid = `test-history-cid-${i}-${Date.now()}`
        import_cids.push(import_cid)

        await db('sync_conflicts').insert({
          sync_id: test_sync_id,
          import_cid,
          conflicts: {},
          status: i === 0 ? 'pending' : 'resolved',
          created_at: new Date(Date.now() - i * 60000).toISOString() // Each one is a minute older
        })
      }
    })

    after(async () => {
      // Clean up test records
      for (const cid of import_cids) {
        await db('sync_conflicts')
          .where({
            sync_id: test_sync_id,
            import_cid: cid
          })
          .delete()
      }
    })

    it('should retrieve sync history records with default limit', async () => {
      const result = await get_sync_history({
        sync_id: test_sync_id
      })

      expect(result).to.be.an('array')
      expect(result).to.have.length(2) // Default limit is 2

      // Should be ordered by created_at desc
      if (result.length >= 2) {
        expect(new Date(result[0].created_at)).to.be.greaterThan(
          new Date(result[1].created_at)
        )
      }

      // Verify these are the correct records
      expect(result[0].import_cid).to.equal(import_cids[0])
      if (result.length >= 2) {
        expect(result[1].import_cid).to.equal(import_cids[1])
      }
    })

    it('should respect custom limit parameter', async () => {
      const result = await get_sync_history({
        sync_id: test_sync_id,
        limit: 3
      })

      expect(result).to.be.an('array')
      expect(result).to.have.length(3) // Custom limit of 3

      // Verify all records are returned
      const returned_cids = result.map((r) => r.import_cid).sort()
      const expected_cids = [...import_cids].sort()
      expect(returned_cids).to.deep.equal(expected_cids)
    })

    it('should handle empty results for non-existent sync_id', async () => {
      const nonexistent_sync_id = uuid() // Use a valid UUID that doesn't exist

      const result = await get_sync_history({
        sync_id: nonexistent_sync_id
      })

      expect(result).to.be.an('array')
      expect(result).to.have.length(0)
    })
  })

  describe('find_recent_conflicts', () => {
    let conflict_import_cid

    before(async () => {
      // Create a conflict record for testing
      conflict_import_cid = `test-conflict-cid-${Date.now()}`

      await db('sync_conflicts').insert({
        sync_id: test_sync_id,
        import_cid: conflict_import_cid,
        conflicts: {
          title: {
            field_name: 'title',
            internal_value: 'Local Title Value',
            external_value: 'Remote Title Value'
          }
        },
        status: 'pending',
        created_at: new Date().toISOString()
      })
    })

    after(async () => {
      // Clean up test records
      await db('sync_conflicts')
        .where({
          sync_id: test_sync_id,
          import_cid: conflict_import_cid
        })
        .delete()
    })

    it('should find recent conflicts when they exist', async () => {
      const result = await find_recent_conflicts({
        entity_id: test_entity_id,
        external_system: test_external_system
      })

      expect(result).to.be.an('object')
      expect(result).to.have.property('sync_id', test_sync_id)
      expect(result).to.have.property('import_cid', conflict_import_cid)
      expect(result).to.have.property('status', 'pending')
      expect(result).to.have.property('conflicts')
      expect(result.conflicts).to.have.property('title')
      expect(result.conflicts.title).to.have.property(
        'internal_value',
        'Local Title Value'
      )
    })

    it('should return null when no sync record exists', async () => {
      const nonexistent_entity_id = uuid() // Use a valid UUID that doesn't exist

      const result = await find_recent_conflicts({
        entity_id: nonexistent_entity_id,
        external_system: test_external_system
      })

      expect(result).to.be.undefined
    })

    it('should return undefined when sync record exists but no conflicts found', async () => {
      // Create a new test entity and sync record with no conflicts
      const no_conflicts_entity_id = uuid() // Use a valid UUID
      const no_conflicts_sync_id = uuid() // Use a valid UUID

      // Create entity first (required for foreign key constraint)
      await db('entities').insert({
        entity_id: no_conflicts_entity_id,
        title: 'Another Test Entity',
        type: 'task',
        user_id: test_user.user_id,
        description: 'Another test entity for tests',
        content: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

      // Then create sync record
      await db('external_syncs').insert({
        sync_id: no_conflicts_sync_id,
        entity_id: no_conflicts_entity_id,
        external_system: test_external_system,
        external_id: 'ext-no-conflicts',
        last_sync_at: new Date().toISOString()
      })

      const result = await find_recent_conflicts({
        entity_id: no_conflicts_entity_id,
        external_system: test_external_system
      })

      expect(result).to.be.undefined

      // Clean up in reverse order
      await db('external_syncs').where('sync_id', no_conflicts_sync_id).delete()
      await db('entities').where('entity_id', no_conflicts_entity_id).delete()
    })
  })
})
