import { expect } from 'chai'
import { sync } from '#libs-server'
import { create_test_user } from '#tests/utils/index.mjs'
import db from '#db'

describe('Sync Core Tests', () => {
  let test_user
  let test_entity

  // Set up test environment
  before(async () => {
    // Create test user
    test_user = await create_test_user()

    // Create a test entity for testing sync operations
    const [entity] = await db('entities')
      .insert({
        title: 'Test Entity for Sync Core',
        type: 'task',
        user_id: test_user.user_id,
        description: 'This is a test entity for sync core tests.'
      })
      .returning('*')

    test_entity = entity

    // Create task extension
    await db('tasks').insert({
      entity_id: test_entity.entity_id,
      status: 'Started',
      priority: 'Medium'
    })
  })

  // Clean up after tests
  after(async () => {
    // Clean up all test data
    await db('entities').where({ user_id: test_user.user_id }).delete()
  })

  describe('create_content_identifier', () => {
    it('should generate a content identifier for an object', async () => {
      const test_data = {
        title: 'Test Object',
        description: 'Test description',
        tags: ['test', 'sync'],
        created_at: '2023-06-01T12:00:00Z'
      }

      const cid = await sync.create_content_identifier(test_data)

      expect(cid).to.be.a('string')
      expect(cid).to.have.lengthOf.at.least(40) // CIDs are reasonably long

      // Generate it again to verify determinism
      const cid2 = await sync.create_content_identifier(test_data)
      expect(cid2).to.equal(cid)

      // Modify the data and verify CID changes
      const modified_data = {
        ...test_data,
        title: 'Modified Title'
      }

      const modified_cid = await sync.create_content_identifier(modified_data)
      expect(modified_cid).to.not.equal(cid)
    })
  })

  describe('detect_field_changes', () => {
    it('should detect changes between two objects', () => {
      const previous_data = {
        title: 'Previous Title',
        description: 'Previous description',
        status: 'open',
        priority: 'high'
      }

      const current_data = {
        title: 'Current Title',
        description: 'Previous description', // unchanged
        status: 'closed',
        priority: 'high' // unchanged
      }

      const changes = sync.detect_field_changes({
        current_data,
        previous_data
      })

      expect(changes).to.be.an('object')
      expect(changes).to.have.property('title')
      expect(changes).to.have.property('status')
      expect(changes).to.not.have.property('description')
      expect(changes).to.not.have.property('priority')

      expect(changes.title).to.have.property('from', 'Previous Title')
      expect(changes.title).to.have.property('to', 'Current Title')
      expect(changes.title).to.have.property('changed', true)

      expect(changes.status).to.have.property('from', 'open')
      expect(changes.status).to.have.property('to', 'closed')
      expect(changes.status).to.have.property('changed', true)
    })

    it('should handle null values and whitespace correctly', () => {
      const previous_data = {
        title: 'Previous Title',
        description: 'Description',
        notes: null
      }

      const current_data = {
        title: 'Previous Title  ', // Same but with trailing whitespace
        description: '', // Empty string
        notes: 'New notes' // Previously null
      }

      const changes = sync.detect_field_changes({
        current_data,
        previous_data
      })

      expect(changes).to.be.an('object')
      expect(changes).to.not.have.property('title')
      expect(changes).to.have.property('description')
      expect(changes).to.have.property('notes')

      expect(changes.description).to.have.property('from', 'Description')
      expect(changes.description).to.have.property('to', '')

      // Test null handling in format_value_for_comparison
      // Here, the from value is null which gets converted to '' for comparison
      expect(changes.notes.from).to.equal(null)
      expect(changes.notes.to).to.equal('New notes')
      expect(changes.notes.changed).to.equal(true)
    })
  })

  describe('get_or_create_sync_record', () => {
    it('should create a new sync record when none exists', async () => {
      const external_system = 'test-system'
      const external_id = 'test-id-123'

      const sync_record = await sync.get_or_create_sync_record({
        entity_id: test_entity.entity_id,
        external_system,
        external_id
      })

      expect(sync_record).to.be.an('object')
      expect(sync_record).to.have.property('sync_id')
      expect(sync_record).to.have.property('entity_id', test_entity.entity_id)
      expect(sync_record).to.have.property('external_system', external_system)
      expect(sync_record).to.have.property('external_id', external_id)
      expect(sync_record).to.have.property('sync_status', 'new')

      // Verify record exists in the database
      const db_record = await db('external_syncs')
        .where({
          entity_id: test_entity.entity_id,
          external_system
        })
        .first()

      expect(db_record).to.be.an('object')
      expect(db_record).to.have.property('sync_id', sync_record.sync_id)
    })

    it('should return existing sync record when one exists', async () => {
      const external_system = 'test-system'
      const external_id = 'test-id-123'

      // Should return the one we created in the previous test
      const sync_record = await sync.get_or_create_sync_record({
        entity_id: test_entity.entity_id,
        external_system,
        external_id
      })

      expect(sync_record).to.be.an('object')
      expect(sync_record).to.have.property('external_id', external_id)

      // Count records to ensure we didn't create a duplicate
      const record_count = await db('external_syncs')
        .where({
          entity_id: test_entity.entity_id,
          external_system
        })
        .count('* as count')
        .first()

      // Parse count as an integer since it might be returned as string
      const count = parseInt(record_count.count, 10)
      expect(count).to.equal(1)
    })
  })

  describe('find_entity_by_external_id', () => {
    it('should find an entity using its external ID', async () => {
      // Create a test entity with external ID in metadata
      const [entity] = await db('entities')
        .insert({
          title: 'Entity with External ID',
          type: 'task',
          user_id: test_user.user_id,
          description: 'Entity for testing find_entity_by_external_id'
        })
        .returning('*')

      // Add external ID to metadata
      const external_system = 'test-find-system'
      const external_id = 'test-find-id-456'

      await db('entity_metadata').insert({
        entity_id: entity.entity_id,
        key: 'external_id',
        value: `${external_system}:${external_id}`
      })

      // Test finding the entity
      const found_entity = await sync.find_entity_by_external_id({
        external_system,
        external_id
      })

      expect(found_entity).to.be.an('object')
      expect(found_entity).to.have.property('entity_id', entity.entity_id)
      expect(found_entity).to.have.property('title', entity.title)
    })

    it('should return null when no entity with that external ID exists', async () => {
      const result = await sync.find_entity_by_external_id({
        external_system: 'nonexistent-system',
        external_id: 'nonexistent-id'
      })

      expect(result).to.be.null
    })
  })

  describe('get_entity_sync_config', () => {
    it('should create a default sync config when none exists', async () => {
      const external_system = 'test-sync-system'

      const config = await sync.get_entity_sync_config({
        entity_id: test_entity.entity_id,
        external_system
      })

      expect(config).to.be.an('object')
      expect(config).to.have.property('config_id')
      expect(config).to.have.property('entity_type', test_entity.type)
      expect(config).to.have.property('external_system', external_system)
      expect(config).to.have.property('field_strategies')

      // Verify default field strategies
      const strategies = config.field_strategies
      expect(strategies).to.be.an('object')
      expect(strategies).to.have.property('title', 'newest_wins')
      expect(strategies).to.have.property('description', 'newest_wins')
      expect(strategies).to.have.property('status', 'newest_wins')
      expect(strategies).to.have.property('priority', 'newest_wins')
      expect(strategies).to.have.property('updated_at', 'newest_wins')

      // Verify it was saved to the database
      const db_config = await db('sync_configs')
        .where({
          entity_type: test_entity.type,
          external_system
        })
        .first()

      expect(db_config).to.be.an('object')
      expect(db_config).to.have.property('config_id', config.config_id)
    })

    it('should return existing entity-type config', async () => {
      const external_system = 'test-sync-system'

      // This should return the type-level config we created in the previous test
      const config = await sync.get_entity_sync_config({
        entity_id: test_entity.entity_id,
        external_system
      })

      expect(config).to.be.an('object')
      expect(config).to.have.property('external_system', external_system)
      expect(config).to.have.property('entity_type', test_entity.type)
      expect(config.entity_id).to.be.null
    })

    it('should prioritize entity-specific config over type config', async () => {
      const external_system = 'test-sync-system'

      // Create entity-specific config
      const entity_specific_strategies = {
        title: 'external_wins',
        description: 'external_wins',
        status: 'newest_wins',
        priority: 'newest_wins'
      }

      await db('sync_configs').insert({
        entity_id: test_entity.entity_id,
        external_system,
        field_strategies: entity_specific_strategies
      })

      // Get config
      const config = await sync.get_entity_sync_config({
        entity_id: test_entity.entity_id,
        external_system
      })

      expect(config).to.be.an('object')
      expect(config).to.have.property('entity_id', test_entity.entity_id)
      expect(config).to.have.property('field_strategies')

      // Verify entity-specific strategies were returned
      const strategies = config.field_strategies
      expect(strategies).to.deep.equal(entity_specific_strategies)
    })
  })

  describe('update_field_last_updated_timestamps', () => {
    it('should update timestamps for specified fields', async () => {
      // Create a fresh sync record
      const external_system = 'timestamp-test-system'
      const external_id = 'timestamp-test-id'

      const sync_record = await sync.get_or_create_sync_record({
        entity_id: test_entity.entity_id,
        external_system,
        external_id
      })

      // Update fields - update with object format
      const updated_fields = {
        title: 'New Title',
        status: 'Completed'
      }

      await sync.update_field_last_updated_timestamps({
        sync_id: sync_record.sync_id,
        updated_fields
      })

      // Verify timestamps were updated
      const updated_record = await db('external_syncs')
        .where({ sync_id: sync_record.sync_id })
        .first()

      expect(updated_record).to.be.an('object')
      expect(updated_record).to.have.property('field_last_updated')
      expect(updated_record).to.have.property('last_internal_update_at')

      const field_timestamps = updated_record.field_last_updated

      expect(field_timestamps).to.be.an('object')
      expect(field_timestamps).to.have.property('title')
      expect(field_timestamps).to.have.property('status')

      // Verify timestamps are recent
      const now = new Date()
      const title_timestamp = new Date(field_timestamps.title)
      const status_timestamp = new Date(field_timestamps.status)

      expect(now - title_timestamp).to.be.lessThan(5000)
      expect(now - status_timestamp).to.be.lessThan(5000)
    })

    it('should update timestamps for array of fields', async () => {
      // Create a fresh sync record
      const external_system = 'timestamp-test-system-array'
      const external_id = 'timestamp-test-id-array'

      const sync_record = await sync.get_or_create_sync_record({
        entity_id: test_entity.entity_id,
        external_system,
        external_id
      })

      // Update fields - update with array format
      const updated_fields = ['description', 'priority']

      await sync.update_field_last_updated_timestamps({
        sync_id: sync_record.sync_id,
        updated_fields
      })

      // Verify timestamps were updated
      const updated_record = await db('external_syncs')
        .where({ sync_id: sync_record.sync_id })
        .first()

      expect(updated_record).to.be.an('object')
      expect(updated_record).to.have.property('field_last_updated')

      const field_timestamps = updated_record.field_last_updated

      expect(field_timestamps).to.be.an('object')
      expect(field_timestamps).to.have.property('description')
      expect(field_timestamps).to.have.property('priority')

      // Verify timestamps are recent
      const now = new Date()
      const description_timestamp = new Date(field_timestamps.description)
      const priority_timestamp = new Date(field_timestamps.priority)

      expect(now - description_timestamp).to.be.lessThan(5000)
      expect(now - priority_timestamp).to.be.lessThan(5000)
    })

    it('should use provided custom timestamp', async () => {
      // Create a fresh sync record
      const external_system = 'timestamp-test-custom'
      const external_id = 'timestamp-test-id-custom'

      const sync_record = await sync.get_or_create_sync_record({
        entity_id: test_entity.entity_id,
        external_system,
        external_id
      })

      // Custom timestamp - one day ago
      const custom_date = new Date()
      custom_date.setDate(custom_date.getDate() - 1)
      const custom_timestamp = custom_date.toISOString()

      // Update fields with custom timestamp
      await sync.update_field_last_updated_timestamps({
        sync_id: sync_record.sync_id,
        updated_fields: ['status'],
        timestamp: custom_timestamp
      })

      // Verify timestamps were updated
      const updated_record = await db('external_syncs')
        .where({ sync_id: sync_record.sync_id })
        .first()

      const field_timestamps = updated_record.field_last_updated

      expect(field_timestamps).to.have.property('status')

      // Verify custom timestamp was used
      const status_timestamp = new Date(field_timestamps.status)
      const one_day_ms = 24 * 60 * 60 * 1000

      expect(new Date() - status_timestamp).to.be.approximately(
        one_day_ms,
        5000
      )
    })
  })

  describe('get_entity_data_with_extensions', () => {
    it('should retrieve entity data with extension data merged', async () => {
      // Create a new test entity with a different type for this test
      const [text_entity] = await db('entities')
        .insert({
          title: 'Test Text for Extensions',
          type: 'text',
          user_id: test_user.user_id,
          description:
            'Test text entity for testing get_entity_data_with_extensions',
          markdown: '# Test Markdown Content\n\nThis is test content.',
          frontmatter: JSON.stringify({ title: 'Test Text' }),
          file_path: '/test/test-text.md'
        })
        .returning('*')

      // Test the function
      const merged_entity =
        await sync.get_entity_data_with_extensions(text_entity)

      // Verify base entity properties are present
      expect(merged_entity).to.be.an('object')
      expect(merged_entity).to.have.property('entity_id', text_entity.entity_id)
      expect(merged_entity).to.have.property('title', text_entity.title)
      expect(merged_entity).to.have.property('type', 'text')
      expect(merged_entity).to.have.property(
        'description',
        text_entity.description
      )

      // For 'text' entities, we don't have an extension table, so it should just return the entity
      expect(merged_entity).to.deep.equal(text_entity)
    })

    it('should handle entities with no extension table', async () => {
      // Create entity with a type that doesn't have an extension table
      const [tag_entity] = await db('entities')
        .insert({
          title: 'Test Tag Entity',
          type: 'tag', // A simple entity type
          user_id: test_user.user_id,
          description:
            'Entity for testing get_entity_data_with_extensions with no extension table'
        })
        .returning('*')

      // Test the function - should not throw error
      const result = await sync.get_entity_data_with_extensions(tag_entity)

      // Should return the entity as is
      expect(result).to.be.an('object')
      expect(result).to.have.property('entity_id', tag_entity.entity_id)
      expect(result).to.have.property('title', tag_entity.title)
      expect(result).to.have.property('type', 'tag')
      expect(result).to.deep.equal(tag_entity)
    })

    it('should handle tasks with status and priority from extension table', async () => {
      // We already have a task entity from the before hook
      // Test the function with our existing test_entity
      const merged_task =
        await sync.get_entity_data_with_extensions(test_entity)

      // Verify base entity properties
      expect(merged_task).to.be.an('object')
      expect(merged_task).to.have.property('entity_id', test_entity.entity_id)
      expect(merged_task).to.have.property('title', test_entity.title)
      expect(merged_task).to.have.property('type', 'task')

      // Verify task-specific fields from extension table
      expect(merged_task).to.have.property('status', 'Started')
      expect(merged_task).to.have.property('priority', 'Medium')
    })

    it('should handle non-existent extension tables gracefully', async () => {
      // Create an entity with a type that might not have a defined extension table
      const [custom_entity] = await db('entities')
        .insert({
          title: 'Custom Entity Type',
          type: 'type_extension', // A valid type that might not have a dedicated table
          user_id: test_user.user_id,
          description:
            'Entity for testing error handling in get_entity_data_with_extensions'
        })
        .returning('*')

      // Test the function - should not throw error even when the extension table doesn't exist
      try {
        const result = await sync.get_entity_data_with_extensions(custom_entity)

        // Should return the entity with no extension data
        expect(result).to.be.an('object')
        expect(result).to.have.property('entity_id', custom_entity.entity_id)
        expect(result).to.deep.equal(custom_entity)
      } catch (error) {
        // If it throws, that means we need to modify the function to handle this case better
        expect.fail(
          `get_entity_data_with_extensions threw an error: ${error.message}`
        )
      }
    })
  })
})
