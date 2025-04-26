import { expect } from 'chai'
import get_tagged_entities from '#libs-server/tags/get-tagged-entities.mjs'
import create_tag from '#libs-server/tags/create-tag.mjs'
import { tag_entity } from '#libs-server/tags/tag-entity.mjs'
import db from '#db'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

describe('get_tagged_entities', () => {
  let test_user
  let other_user
  let test_tag_id
  let test_task_id
  let test_physical_item_id
  let test_digital_item_id
  let test_database_table_id
  let archived_entity_id

  before(async () => {
    await reset_all_tables()

    // Create test users
    test_user = await create_test_user()
    other_user = await create_test_user()

    // Create a test tag
    test_tag_id = await create_tag({
      title: 'Test Tag',
      description: 'A tag for testing get_tagged_entities',
      user_id: test_user.user_id,
      color: '#00FF00'
    })

    // Create test entities of different types

    // 1. Task
    const [task] = await db('entities')
      .insert({
        title: 'Test Task',
        description: 'A task for testing',
        user_id: test_user.user_id,
        type: 'task'
      })
      .returning('entity_id')

    test_task_id = task.entity_id

    await db('tasks').insert({
      entity_id: test_task_id,
      status: 'No status',
      priority: 'Medium'
    })

    // 2. Physical item
    const [physical_item] = await db('entities')
      .insert({
        title: 'Test Physical Item',
        description: 'A physical item for testing',
        user_id: test_user.user_id,
        type: 'physical_item'
      })
      .returning('entity_id')

    test_physical_item_id = physical_item.entity_id

    await db('physical_items').insert({
      entity_id: test_physical_item_id,
      storage_location: 'Test Location',
      importance: 'Standard'
    })

    // 3. Digital item
    const [digital_item] = await db('entities')
      .insert({
        title: 'Test Digital Item',
        description: 'A digital item for testing',
        user_id: test_user.user_id,
        type: 'digital_item'
      })
      .returning('entity_id')

    test_digital_item_id = digital_item.entity_id

    await db('digital_items').insert({
      entity_id: test_digital_item_id,
      file_mime_type: 'text/plain',
      file_uri: 'file:///test.txt'
    })

    // 4. Database table
    const [database_table] = await db('entities')
      .insert({
        title: 'Test Database Table',
        description: 'A database table for testing',
        user_id: test_user.user_id,
        type: 'database'
      })
      .returning('entity_id')

    test_database_table_id = database_table.entity_id

    await db('database_tables').insert({
      entity_id: test_database_table_id,
      table_name: 'test_table',
      table_description: 'Test table description',
      fields: JSON.stringify({
        id: { type: 'integer', primaryKey: true },
        name: { type: 'text' }
      })
    })

    // 5. Archived entity - Create with no archived_at first, then update
    const [archived] = await db('entities')
      .insert({
        title: 'Archived Entity',
        description: 'An archived entity for testing',
        user_id: test_user.user_id,
        type: 'task'
      })
      .returning('entity_id')

    archived_entity_id = archived.entity_id

    // Add the task data
    await db('tasks').insert({
      entity_id: archived_entity_id,
      status: 'Completed'
    })

    // Now update to set the archived_at date
    await db('entities')
      .where({
        entity_id: archived_entity_id
      })
      .update({
        archived_at: new Date()
      })

    // Tag all entities
    const entities = [
      test_task_id,
      test_physical_item_id,
      test_digital_item_id,
      test_database_table_id,
      archived_entity_id
    ]

    for (const entity_id of entities) {
      await tag_entity({
        entity_id,
        tag_id: test_tag_id,
        user_id: test_user.user_id
      })
    }
  })

  after(async () => {
    await reset_all_tables()
  })

  it('should get all unarchived entities tagged with a tag', async () => {
    const result = await get_tagged_entities({
      tag_id: test_tag_id,
      user_id: test_user.user_id
    })

    expect(result).to.be.an('object')
    expect(result.tag).to.be.an('object')
    expect(result.tag.entity_id).to.equal(test_tag_id)
    expect(result.tag.type).to.equal('tag')

    expect(result.tasks).to.be.an('array')
    expect(result.tasks).to.have.length(1)
    expect(result.tasks[0].entity_id).to.equal(test_task_id)
    expect(result.tasks[0].title).to.equal('Test Task')
    expect(result.tasks[0].status).to.equal('No status')

    expect(result.physical_items).to.be.an('array')
    expect(result.physical_items).to.have.length(1)
    expect(result.physical_items[0].entity_id).to.equal(test_physical_item_id)
    expect(result.physical_items[0].title).to.equal('Test Physical Item')
    expect(result.physical_items[0].storage_location).to.equal('Test Location')

    expect(result.digital_items).to.be.an('array')
    expect(result.digital_items).to.have.length(1)
    expect(result.digital_items[0].entity_id).to.equal(test_digital_item_id)
    expect(result.digital_items[0].title).to.equal('Test Digital Item')
    expect(result.digital_items[0].file_mime_type).to.equal('text/plain')

    expect(result.databases).to.be.an('array')
    expect(result.databases).to.have.length(1)
    expect(result.databases[0].entity_id).to.equal(test_database_table_id)
    expect(result.databases[0].title).to.equal('Test Database Table')
    expect(result.databases[0].table_name).to.equal('test_table')

    // No archived entities should be included
    const all_entities = [
      ...result.tasks.map((t) => t.entity_id),
      ...result.physical_items.map((p) => p.entity_id),
      ...result.digital_items.map((d) => d.entity_id),
      ...result.databases.map((d) => d.entity_id),
      ...(result.other_entities || []).map((e) => e.entity_id)
    ]

    expect(all_entities).to.not.include(archived_entity_id)
  })

  it('should include archived entities when requested', async () => {
    const result = await get_tagged_entities({
      tag_id: test_tag_id,
      user_id: test_user.user_id,
      archived: true
    })

    expect(result).to.be.an('object')

    expect(result.tasks).to.be.an('array')
    expect(result.tasks).to.have.length(1)
    expect(result.tasks[0].entity_id).to.equal(archived_entity_id)
    expect(result.tasks[0].title).to.equal('Archived Entity')
    expect(result.tasks[0].status).to.equal('Completed')
  })

  it('should filter by entity types', async () => {
    const result = await get_tagged_entities({
      tag_id: test_tag_id,
      user_id: test_user.user_id,
      entity_types: ['task', 'digital_item'] // Only include these types
    })

    expect(result).to.be.an('object')

    expect(result.tasks).to.be.an('array')
    expect(result.tasks).to.have.length(1)
    expect(result.tasks[0].entity_id).to.equal(test_task_id)

    expect(result.digital_items).to.be.an('array')
    expect(result.digital_items).to.have.length(1)
    expect(result.digital_items[0].entity_id).to.equal(test_digital_item_id)

    expect(result.physical_items).to.be.an('array')
    expect(result.physical_items).to.have.length(0)

    expect(result.databases).to.be.an('array')
    expect(result.databases).to.have.length(0)
  })

  it('should return null when tag does not exist', async () => {
    const fake_id = '00000000-0000-0000-0000-000000000000'
    const result = await get_tagged_entities({
      tag_id: fake_id,
      user_id: test_user.user_id
    })

    expect(result).to.be.null
  })

  it('should return null when tag belongs to different user', async () => {
    const result = await get_tagged_entities({
      tag_id: test_tag_id,
      user_id: other_user.user_id
    })

    expect(result).to.be.null
  })

  it('should reject invalid tag ID', async () => {
    try {
      await get_tagged_entities({
        tag_id: 'not-a-valid-uuid',
        user_id: test_user.user_id
      })
      expect.fail('Should have thrown an error for invalid tag ID')
    } catch (error) {
      expect(error).to.be.an('error')
    }
  })
})
