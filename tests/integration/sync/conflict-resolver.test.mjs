import { expect } from 'chai'

import { sync } from '#libs-server'
import { create_test_user, reset_all_tables } from '#tests/utils/index.mjs'
import db from '#db'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'

describe('Conflict Resolver Tests', () => {
  let test_user
  let test_entity
  let sync_record

  // Set up test environment
  before(async () => {
    await reset_all_tables()

    // Create test user
    test_user = await create_test_user()

    // Create a test entity for testing sync operations
    const [entity] = await db('entities')
      .insert({
        title: 'Test Entity for Conflict Resolver',
        type: 'task',
        user_id: test_user.user_id,
        description: 'This is a test entity for conflict resolver tests.'
      })
      .returning('*')

    test_entity = entity

    // Create task extension
    await db('tasks').insert({
      entity_id: test_entity.entity_id,
      status: TASK_STATUS.IN_PROGRESS,
      priority: TASK_PRIORITY.MEDIUM
    })

    // Create sync record
    const [new_sync_record] = await db('external_syncs')
      .insert({
        entity_id: test_entity.entity_id,
        external_system: 'test-system',
        external_id: 'test-id-conflict',
        sync_status: 'synced',
        field_last_updated: {
          title: '2023-01-01T12:00:00Z',
          description: '2023-01-01T12:00:00Z',
          status: '2023-01-01T12:00:00Z',
          priority: '2023-01-01T12:00:00Z'
        }
      })
      .returning('*')

    sync_record = new_sync_record
  })

  // Clean up after tests
  after(async () => {
    // Clean up all test data
    await db('entities').where({ user_id: test_user.user_id }).delete()
  })

  describe('detect_conflicts', () => {
    it('should detect conflicts between entity and external data', async () => {
      const external_data = {
        title: 'Changed Title',
        body: 'Changed Description',
        status: 'completed',
        priority: 'high',
        updated_at: '2023-01-02T12:00:00Z'
      }

      const field_mappings = {
        title: 'title',
        description: 'body',
        status: (data) =>
          data.status === 'completed'
            ? TASK_STATUS.COMPLETED
            : TASK_STATUS.IN_PROGRESS,
        priority: (data) =>
          data.priority === 'high' ? TASK_PRIORITY.HIGH : TASK_PRIORITY.MEDIUM
      }

      const detected_conflicts = await sync.detect_conflicts({
        entity: test_entity,
        external_data,
        field_mappings,
        sync_record,
        changes: {
          title: { from: 'Test Entity', to: 'Changed Title' },
          description: { from: 'This is a test', to: 'Changed Description' },
          status: { from: TASK_STATUS.IN_PROGRESS, to: TASK_STATUS.COMPLETED },
          priority: { from: TASK_PRIORITY.MEDIUM, to: TASK_PRIORITY.HIGH }
        },
        import_cid: 'test-cid'
      })

      expect(detected_conflicts).to.be.an('object')
      expect(Object.keys(detected_conflicts)).to.have.length.greaterThan(0)
      expect(detected_conflicts).to.have.property('title')
      expect(detected_conflicts).to.have.property('status')
    })

    it('should handle empty changes with no conflicts', async () => {
      const external_data = {
        title: 'Test Entity for Conflict Resolver',
        body: 'This is a test entity for conflict resolver tests.',
        updated_at: '2023-01-02T12:00:00Z'
      }

      const field_mappings = {
        title: 'title',
        description: 'body'
      }

      const detected_conflicts = await sync.detect_conflicts({
        entity: test_entity,
        external_data,
        field_mappings,
        sync_record,
        changes: null,
        import_cid: 'test-cid-2'
      })

      expect(detected_conflicts).to.be.an('object')
      expect(Object.keys(detected_conflicts)).to.have.length(0)
    })

    it('should handle missing field mappings gracefully', async () => {
      const external_data = {
        title: 'Changed Title Again',
        body: 'Changed Description Again',
        custom_field: 'Custom Value',
        updated_at: '2023-01-03T12:00:00Z'
      }

      const field_mappings = {
        title: 'title',
        description: 'body',
        nonexistent_field: 'doesnt_exist'
      }

      const detected_conflicts = await sync.detect_conflicts({
        entity: test_entity,
        external_data,
        field_mappings,
        sync_record,
        changes: {
          title: { from: 'Test Entity', to: 'Changed Title Again' },
          description: {
            from: 'This is a test',
            to: 'Changed Description Again'
          }
        },
        import_cid: 'test-cid-3'
      })

      expect(detected_conflicts).to.be.an('object')
      expect(Object.keys(detected_conflicts)).to.have.length.greaterThan(0)
      expect(detected_conflicts).to.have.property('title')
      expect(detected_conflicts).to.not.have.property('nonexistent_field')
    })
  })

  describe('resolution_strategies', () => {
    it('should resolve conflicts using internal_wins strategy', async () => {
      const conflict = {
        field_name: 'title',
        internal_value: 'Internal Title',
        external_value: 'External Title',
        internal_updated_at: '2023-01-03T12:00:00Z',
        external_updated_at: '2023-01-02T12:00:00Z',
        changed_in_current_import: true
      }

      const resolution = sync.resolution_strategies.internal_wins(conflict)

      expect(resolution).to.be.an('object')
      expect(resolution).to.have.property('value', 'Internal Title')
      expect(resolution).to.have.property('target', 'external')
      expect(resolution).to.have.property('reason', 'internal_strategy')
    })

    it('should resolve conflicts using external_wins strategy', async () => {
      const conflict = {
        field_name: 'title',
        internal_value: 'Internal Title',
        external_value: 'External Title',
        internal_updated_at: '2023-01-02T12:00:00Z',
        external_updated_at: '2023-01-03T12:00:00Z',
        changed_in_current_import: true
      }

      const resolution = sync.resolution_strategies.external_wins(conflict)

      expect(resolution).to.be.an('object')
      expect(resolution).to.have.property('value', 'External Title')
      expect(resolution).to.have.property('target', 'internal')
      expect(resolution).to.have.property('reason', 'external_strategy')
    })

    it('should resolve conflicts using newest_wins strategy with newer external', async () => {
      const conflict = {
        field_name: 'title',
        internal_value: 'Internal Title',
        external_value: 'External Title',
        internal_updated_at: '2023-01-02T12:00:00Z',
        external_updated_at: '2023-01-03T12:00:00Z',
        changed_in_current_import: true
      }

      const resolution = sync.resolution_strategies.newest_wins(conflict)

      expect(resolution).to.be.an('object')
      expect(resolution).to.have.property('value', 'External Title')
      expect(resolution).to.have.property('target', 'internal')
      expect(resolution).to.have.property('reason', 'external_newer')
    })

    it('should resolve conflicts using newest_wins strategy with newer internal', async () => {
      const conflict = {
        field_name: 'title',
        internal_value: 'Internal Title',
        external_value: 'External Title',
        internal_updated_at: '2023-01-03T12:00:00Z',
        external_updated_at: '2023-01-02T12:00:00Z',
        changed_in_current_import: true
      }

      const resolution = sync.resolution_strategies.newest_wins(conflict)

      expect(resolution).to.be.an('object')
      expect(resolution).to.have.property('value', 'Internal Title')
      expect(resolution).to.have.property('target', 'external')
      expect(resolution).to.have.property('reason', 'internal_newer')
    })

    it('should default to internal_wins when unchanged in current import', async () => {
      const conflict = {
        field_name: 'title',
        internal_value: 'Internal Title',
        external_value: 'External Title',
        internal_updated_at: '2023-01-02T12:00:00Z',
        external_updated_at: '2023-01-03T12:00:00Z',
        changed_in_current_import: false
      }

      const resolution = sync.resolution_strategies.newest_wins(conflict)

      expect(resolution).to.be.an('object')
      expect(resolution).to.have.property('value', 'Internal Title')
      expect(resolution).to.have.property('target', 'external')
      expect(resolution).to.have.property('reason', 'internal_strategy')
    })
  })

  describe('resolve_entity_conflicts', () => {
    beforeEach(async () => {
      // Set up sync config for testing
      await db('sync_configs').delete()

      await db('sync_configs').insert({
        entity_type: 'task',
        external_system: 'test-system',
        field_strategies: {
          title: 'newest_wins',
          description: 'internal_wins',
          status: 'external_wins',
          priority: 'manual'
        }
      })
    })

    it('should resolve conflicts using different strategies for different fields', async () => {
      // Create test conflicts
      const conflicts = {
        title: {
          field_name: 'title',
          internal_value: 'Internal Title',
          external_value: 'External Title',
          internal_updated_at: '2023-01-03T12:00:00Z', // Newer internal
          external_updated_at: '2023-01-02T12:00:00Z',
          changed_in_current_import: true,
          sync_id: sync_record.sync_id,
          import_cid: 'test-resolve-cid'
        },
        description: {
          field_name: 'description',
          internal_value: 'Internal Description',
          external_value: 'External Description',
          internal_updated_at: '2023-01-02T12:00:00Z',
          external_updated_at: '2023-01-03T12:00:00Z', // Newer external
          changed_in_current_import: true,
          sync_id: sync_record.sync_id,
          import_cid: 'test-resolve-cid'
        },
        status: {
          field_name: 'status',
          internal_value: TASK_STATUS.IN_PROGRESS,
          external_value: TASK_STATUS.COMPLETED,
          internal_updated_at: '2023-01-03T12:00:00Z',
          external_updated_at: '2023-01-02T12:00:00Z',
          changed_in_current_import: true,
          sync_id: sync_record.sync_id,
          import_cid: 'test-resolve-cid'
        },
        priority: {
          field_name: 'priority',
          internal_value: TASK_PRIORITY.MEDIUM,
          external_value: TASK_PRIORITY.HIGH,
          internal_updated_at: '2023-01-02T12:00:00Z',
          external_updated_at: '2023-01-03T12:00:00Z',
          changed_in_current_import: true,
          sync_id: sync_record.sync_id,
          import_cid: 'test-resolve-cid'
        }
      }

      const result = await sync.resolve_entity_conflicts({
        entity_id: test_entity.entity_id,
        conflicts,
        external_system: 'test-system'
      })

      expect(result).to.be.an('object')
      expect(result).to.have.property('resolutions')
      expect(result).to.have.property('has_manual_conflicts', true)

      const resolutions = result.resolutions

      // Check title (newest_wins strategy, internal is newer)
      expect(resolutions.title).to.have.property('value', 'Internal Title')
      expect(resolutions.title).to.have.property('target', 'external')
      expect(resolutions.title).to.have.property('reason', 'internal_newer')

      // Check description (internal_wins strategy)
      expect(resolutions.description).to.have.property(
        'value',
        'Internal Description'
      )
      expect(resolutions.description).to.have.property('target', 'external')
      expect(resolutions.description).to.have.property(
        'reason',
        'internal_strategy'
      )

      // Check status (external_wins strategy)
      expect(resolutions.status).to.have.property(
        'value',
        TASK_STATUS.COMPLETED
      )
      expect(resolutions.status).to.have.property('target', 'internal')
      expect(resolutions.status).to.have.property('reason', 'external_strategy')

      // Check priority (manual strategy)
      expect(resolutions.priority).to.have.property('target', 'none')
      expect(resolutions.priority).to.have.property(
        'reason',
        'pending_manual_resolution'
      )

      // Verify that a conflict record was created
      const conflict_record = await db('sync_conflicts')
        .where({
          sync_id: sync_record.sync_id,
          status: 'pending'
        })
        .first()

      expect(conflict_record).to.be.an('object')
      expect(conflict_record.conflicts).to.have.property('priority')
    })

    it('should handle missing sync config by creating default', async () => {
      // Delete all sync configs to force default creation
      await db('sync_configs').delete()

      const conflicts = {
        title: {
          field_name: 'title',
          internal_value: 'Internal Title Default',
          external_value: 'External Title Default',
          internal_updated_at: '2023-01-02T12:00:00Z',
          external_updated_at: '2023-01-03T12:00:00Z', // Newer external
          changed_in_current_import: true,
          sync_id: sync_record.sync_id,
          import_cid: 'test-default-cid'
        }
      }

      const result = await sync.resolve_entity_conflicts({
        entity_id: test_entity.entity_id,
        conflicts,
        external_system: 'test-system'
      })

      expect(result).to.be.an('object')
      expect(result).to.have.property('resolutions')

      const resolutions = result.resolutions

      // With default config, title should use newest_wins (external is newer)
      expect(resolutions.title).to.have.property(
        'value',
        'External Title Default'
      )
      expect(resolutions.title).to.have.property('target', 'internal')
      expect(resolutions.title).to.have.property('reason', 'external_newer')

      // Verify config was created
      const created_config = await db('sync_configs')
        .where({
          entity_type: 'task',
          external_system: 'test-system'
        })
        .first()

      expect(created_config).to.be.an('object')
      expect(created_config.field_strategies).to.have.property(
        'title',
        'newest_wins'
      )
    })

    it('should handle unknown resolution strategy gracefully', async () => {
      // Create config with invalid strategy
      await db('sync_configs').delete()

      await db('sync_configs').insert({
        entity_type: 'task',
        external_system: 'test-system',
        field_strategies: {
          title: 'nonexistent_strategy'
        }
      })

      const conflicts = {
        title: {
          field_name: 'title',
          internal_value: 'Internal Title Strategy',
          external_value: 'External Title Strategy',
          internal_updated_at: '2023-01-03T12:00:00Z',
          external_updated_at: '2023-01-02T12:00:00Z',
          changed_in_current_import: true,
          sync_id: sync_record.sync_id,
          import_cid: 'test-strategy-cid'
        }
      }

      const result = await sync.resolve_entity_conflicts({
        entity_id: test_entity.entity_id,
        conflicts,
        external_system: 'test-system'
      })

      expect(result).to.be.an('object')
      expect(result).to.have.property('resolutions')
      expect(result).to.have.property('has_manual_conflicts', true)

      const resolutions = result.resolutions

      // With invalid strategy, should fall back to manual resolution
      expect(resolutions.title).to.have.property('target', 'none')
      expect(resolutions.title).to.have.property(
        'reason',
        'pending_manual_resolution'
      )
    })
  })

  describe('apply_resolutions', () => {
    it('should apply internal updates to entities and extension tables', async () => {
      // Create resolutions with internal updates
      const resolutions = {
        title: {
          value: 'Updated Title from Test',
          target: 'internal',
          reason: 'test_reason'
        },
        status: {
          value: TASK_STATUS.COMPLETED,
          target: 'internal',
          reason: 'test_reason'
        }
      }

      // Create mock external update function
      const update_external_entity = async (external_id, updates) => {
        // Just for verification
        return { external_id, updates }
      }

      const result = await sync.apply_resolutions({
        entity_id: test_entity.entity_id,
        resolutions,
        update_external_entity,
        external_id: 'test-external-id'
      })

      // Verify result
      expect(result).to.be.an('object')
      expect(result.internal_updates).to.have.property(
        'title',
        'Updated Title from Test'
      )
      expect(result.internal_updates).to.have.property(
        'status',
        TASK_STATUS.COMPLETED
      )
      expect(Object.keys(result.external_updates)).to.have.length(0)

      // Verify entity was updated
      const updated_entity = await db('entities')
        .where({ entity_id: test_entity.entity_id })
        .first()

      expect(updated_entity.title).to.equal('Updated Title from Test')

      // Verify extension table was updated
      const updated_task = await db('tasks')
        .where({ entity_id: test_entity.entity_id })
        .first()

      expect(updated_task.status).to.equal(TASK_STATUS.COMPLETED)

      // Verify timestamps were updated
      const sync_record_after = await db('external_syncs')
        .where({ entity_id: test_entity.entity_id })
        .first()

      expect(sync_record_after.field_last_updated).to.have.property('title')
      expect(sync_record_after.field_last_updated).to.have.property('status')
    })

    it('should handle date fields correctly for different entity types', async () => {
      // Create resolutions with date updates for tasks
      const date_now = new Date()
      const tomorrow = new Date(date_now)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const start_by_date_str = tomorrow.toISOString()
      const finish_by_date_str = new Date(
        tomorrow.getTime() + 86400000
      ).toISOString()

      const resolutions = {
        title: {
          value: 'Task with Dates',
          target: 'internal',
          reason: 'test_reason'
        },
        start_by: {
          value: start_by_date_str,
          target: 'internal',
          reason: 'test_reason'
        },
        finish_by: {
          value: finish_by_date_str,
          target: 'internal',
          reason: 'test_reason'
        }
      }

      const result = await sync.apply_resolutions({
        entity_id: test_entity.entity_id,
        resolutions,
        update_external_entity: null,
        external_id: 'test-external-id-dates'
      })

      // Verify result has our date fields
      expect(result.internal_updates).to.have.property(
        'start_by',
        start_by_date_str
      )
      expect(result.internal_updates).to.have.property(
        'finish_by',
        finish_by_date_str
      )

      // Verify task extension table was updated with proper Date objects
      const updated_task = await db('tasks')
        .where({ entity_id: test_entity.entity_id })
        .first()

      expect(updated_task.start_by).to.be.an.instanceof(Date)
      expect(updated_task.finish_by).to.be.an.instanceof(Date)

      // Verifying the dates are approximately equal (within 1 second)
      const start_by_expected = new Date(start_by_date_str)
      const finish_by_expected = new Date(finish_by_date_str)

      expect(Math.abs(updated_task.start_by - start_by_expected) < 1000).to.be
        .true
      expect(Math.abs(updated_task.finish_by - finish_by_expected) < 1000).to.be
        .true
    })

    it('should apply external updates when update function is provided', async () => {
      // Create resolutions with external updates
      const resolutions = {
        title: {
          value: 'External Title Update',
          target: 'external',
          reason: 'test_reason'
        },
        description: {
          value: 'External Description Update',
          target: 'external',
          reason: 'test_reason'
        }
      }

      // Create a spy for external update function
      let external_update_called = false
      let external_update_args = null

      const update_external_entity = async (external_id, updates) => {
        external_update_called = true
        external_update_args = { external_id, updates }
        return true
      }

      const result = await sync.apply_resolutions({
        entity_id: test_entity.entity_id,
        resolutions,
        update_external_entity,
        external_id: 'test-external-id-2'
      })

      // Verify result
      expect(result).to.be.an('object')
      expect(Object.keys(result.internal_updates)).to.have.length(0)
      expect(result.external_updates).to.have.property(
        'title',
        'External Title Update'
      )
      expect(result.external_updates).to.have.property(
        'description',
        'External Description Update'
      )

      // Verify external update was called
      expect(external_update_called).to.be.true
      expect(external_update_args.external_id).to.equal('test-external-id-2')
      expect(external_update_args.updates).to.have.property(
        'title',
        'External Title Update'
      )
      expect(external_update_args.updates).to.have.property(
        'description',
        'External Description Update'
      )
    })

    it('should handle missing entities gracefully', async () => {
      // Create a non-existent entity id
      const non_existent_id = '00000000-0000-0000-0000-000000000000'

      // Create resolutions with internal updates
      const resolutions = {
        title: {
          value: 'This should fail',
          target: 'internal',
          reason: 'test_reason'
        }
      }

      try {
        await sync.apply_resolutions({
          entity_id: non_existent_id,
          resolutions,
          update_external_entity: null,
          external_id: 'test-external-id'
        })

        // Should not reach here
        expect.fail('Should have thrown an error for non-existent entity')
      } catch (error) {
        expect(error.message).to.include(`Entity ${non_existent_id} not found`)
      }
    })
  })

  describe('queue_for_manual_resolution', () => {
    it('should create a new conflict record if none exists', async () => {
      // Create test conflict
      const conflict = {
        field_name: 'test_field',
        internal_value: 'Internal Test Value',
        external_value: 'External Test Value',
        internal_updated_at: '2023-01-01T12:00:00Z',
        external_updated_at: '2023-01-02T12:00:00Z',
        sync_id: sync_record.sync_id,
        import_cid: 'test-import-cid-new'
      }

      // Ensure no conflict record exists
      await db('sync_conflicts')
        .where({
          sync_id: conflict.sync_id,
          import_cid: conflict.import_cid
        })
        .delete()

      const result = await sync.resolution_strategies.manual(conflict)

      // Verify result
      expect(result).to.be.an('object')
      expect(result.value).to.equal('Internal Test Value')
      expect(result.target).to.equal('none')
      expect(result.reason).to.equal('pending_manual_resolution')

      // Verify conflict record was created
      const conflict_record = await db('sync_conflicts')
        .where({
          sync_id: conflict.sync_id,
          import_cid: conflict.import_cid,
          status: 'pending'
        })
        .first()

      expect(conflict_record).to.be.an('object')
      expect(conflict_record.conflicts).to.have.property('test_field')
      expect(conflict_record.conflicts.test_field.internal_value).to.equal(
        'Internal Test Value'
      )
      expect(conflict_record.conflicts.test_field.external_value).to.equal(
        'External Test Value'
      )
    })

    it('should update existing conflict record with new fields', async () => {
      // Create an initial conflict record
      const [initial_record] = await db('sync_conflicts')
        .insert({
          sync_id: sync_record.sync_id,
          import_cid: 'test-import-cid-existing',
          conflicts: {
            existing_field: {
              field_name: 'existing_field',
              internal_value: 'Existing Internal',
              external_value: 'Existing External',
              internal_updated_at: '2023-01-01T12:00:00Z',
              external_updated_at: '2023-01-02T12:00:00Z'
            }
          },
          status: 'pending'
        })
        .returning('*')

      // Create a new conflict for a different field
      const conflict = {
        field_name: 'new_field',
        internal_value: 'New Internal Value',
        external_value: 'New External Value',
        internal_updated_at: '2023-01-03T12:00:00Z',
        external_updated_at: '2023-01-04T12:00:00Z',
        sync_id: sync_record.sync_id,
        import_cid: 'test-import-cid-existing'
      }

      const result = await sync.resolution_strategies.manual(conflict)

      // Verify result
      expect(result).to.be.an('object')
      expect(result.value).to.equal('New Internal Value')
      expect(result.target).to.equal('none')
      expect(result.reason).to.equal('pending_manual_resolution')

      // Verify conflict record was updated
      const updated_record = await db('sync_conflicts')
        .where({ conflict_id: initial_record.conflict_id })
        .first()

      expect(updated_record).to.be.an('object')
      expect(updated_record.conflicts).to.have.property('existing_field')
      expect(updated_record.conflicts).to.have.property('new_field')
      expect(updated_record.conflicts.new_field.internal_value).to.equal(
        'New Internal Value'
      )
      expect(updated_record.conflicts.new_field.external_value).to.equal(
        'New External Value'
      )
    })
  })

  describe('manual_resolve_conflicts', () => {
    let conflict_record

    // Set up a test conflict for each test
    beforeEach(async () => {
      // Create a conflict record with multiple fields
      const [new_conflict] = await db('sync_conflicts')
        .insert({
          sync_id: sync_record.sync_id,
          import_cid: 'test-manual-resolve-cid',
          conflicts: {
            title: {
              field_name: 'title',
              internal_value: 'Internal Title Conflict',
              external_value: 'External Title Conflict',
              internal_updated_at: '2023-01-01T12:00:00Z',
              external_updated_at: '2023-01-02T12:00:00Z'
            },
            description: {
              field_name: 'description',
              internal_value: 'Internal Description Conflict',
              external_value: 'External Description Conflict',
              internal_updated_at: '2023-01-03T12:00:00Z',
              external_updated_at: '2023-01-04T12:00:00Z'
            },
            status: {
              field_name: 'status',
              internal_value: TASK_STATUS.IN_PROGRESS,
              external_value: TASK_STATUS.COMPLETED,
              internal_updated_at: '2023-01-05T12:00:00Z',
              external_updated_at: '2023-01-06T12:00:00Z'
            }
          },
          status: 'pending'
        })
        .returning('*')

      conflict_record = new_conflict
    })

    it('should resolve conflicts with internal choice', async () => {
      // Create resolutions that choose internal values
      const resolutions = {
        title: { choice: 'internal' },
        status: { choice: 'internal' }
      }

      const result = await sync.manual_resolve_conflicts(
        conflict_record.conflict_id,
        resolutions,
        test_user.user_id
      )

      // Verify result
      expect(result).to.be.an('object')
      expect(result.conflict_id).to.equal(conflict_record.conflict_id)
      expect(result.entity_id).to.equal(test_entity.entity_id)
      expect(result.resolved_fields).to.include('title')
      expect(result.resolved_fields).to.include('status')
      expect(result.internal_updates).to.be.empty
      expect(result.external_updates).to.have.property(
        'title',
        'Internal Title Conflict'
      )
      expect(result.external_updates).to.have.property(
        'status',
        TASK_STATUS.IN_PROGRESS
      )

      // Verify conflict record was updated
      const updated_conflict = await db('sync_conflicts')
        .where({ conflict_id: conflict_record.conflict_id })
        .first()

      expect(updated_conflict.status).to.equal('resolved')
      expect(updated_conflict.resolved_by).to.equal(test_user.user_id)
      expect(updated_conflict.resolved_at).to.not.be.null
      expect(updated_conflict.resolutions.title.reason).to.equal(
        'manual_resolution'
      )
      expect(updated_conflict.resolutions.status.reason).to.equal(
        'manual_resolution'
      )
    })

    it('should resolve conflicts with external choice', async () => {
      // Create resolutions that choose external values
      const resolutions = {
        title: { choice: 'external' },
        description: { choice: 'external' }
      }

      const result = await sync.manual_resolve_conflicts(
        conflict_record.conflict_id,
        resolutions,
        test_user.user_id
      )

      // Verify result
      expect(result).to.be.an('object')
      expect(result.conflict_id).to.equal(conflict_record.conflict_id)
      expect(result.entity_id).to.equal(test_entity.entity_id)
      expect(result.resolved_fields).to.include('title')
      expect(result.resolved_fields).to.include('description')
      expect(result.external_updates).to.be.empty
      expect(result.internal_updates).to.have.property(
        'title',
        'External Title Conflict'
      )
      expect(result.internal_updates).to.have.property(
        'description',
        'External Description Conflict'
      )

      // Verify entity was updated
      const updated_entity = await db('entities')
        .where({ entity_id: test_entity.entity_id })
        .first()

      expect(updated_entity.title).to.equal('External Title Conflict')
      expect(updated_entity.description).to.equal(
        'External Description Conflict'
      )
    })

    it('should resolve conflicts with custom choice', async () => {
      // Create resolutions with custom values
      const resolutions = {
        title: {
          choice: 'custom',
          custom_value: 'Custom Title Resolution',
          target: 'internal'
        },
        status: {
          choice: 'custom',
          custom_value: TASK_STATUS.BLOCKED,
          target: 'both'
        }
      }

      const result = await sync.manual_resolve_conflicts(
        conflict_record.conflict_id,
        resolutions,
        test_user.user_id
      )

      // Verify result
      expect(result).to.be.an('object')
      expect(result.conflict_id).to.equal(conflict_record.conflict_id)
      expect(result.resolved_fields).to.include('title')
      expect(result.resolved_fields).to.include('status')

      // Custom with target:internal should update internal only
      expect(result.internal_updates).to.have.property(
        'title',
        'Custom Title Resolution'
      )

      // Custom with target:both should update both internal and external
      expect(result.internal_updates).to.have.property(
        'status',
        TASK_STATUS.BLOCKED
      )
      expect(result.external_updates).to.have.property(
        'status',
        TASK_STATUS.BLOCKED
      )

      // Verify entity was updated
      const updated_entity = await db('entities')
        .where({ entity_id: test_entity.entity_id })
        .first()

      expect(updated_entity.title).to.equal('Custom Title Resolution')

      // Verify task was updated
      const updated_task = await db('tasks')
        .where({ entity_id: test_entity.entity_id })
        .first()

      expect(updated_task.status).to.equal(TASK_STATUS.BLOCKED)
    })

    it('should handle missing conflict records', async () => {
      const non_existent_id = '00000000-0000-0000-0000-000000000000'
      const resolutions = {
        title: { choice: 'internal' }
      }

      try {
        await sync.manual_resolve_conflicts(
          non_existent_id,
          resolutions,
          test_user.user_id
        )

        // Should not reach here
        expect.fail('Should have thrown an error for non-existent conflict')
      } catch (error) {
        expect(error.message).to.include(
          `Conflict record ${non_existent_id} not found`
        )
      }
    })

    it('should handle invalid resolution choices', async () => {
      // Create resolutions with invalid choice
      const resolutions = {
        title: { choice: 'invalid_choice' }
      }

      const result = await sync.manual_resolve_conflicts(
        conflict_record.conflict_id,
        resolutions,
        test_user.user_id
      )

      // Should not have any updates for the invalid choice
      expect(result.resolved_fields).to.have.length(0)
      expect(result.internal_updates).to.be.empty
      expect(result.external_updates).to.be.empty

      // Verify conflict record was still updated to resolved
      const updated_conflict = await db('sync_conflicts')
        .where({ conflict_id: conflict_record.conflict_id })
        .first()

      expect(updated_conflict.status).to.equal('resolved')
      expect(updated_conflict.resolved_by).to.equal(test_user.user_id)
    })
  })
})
