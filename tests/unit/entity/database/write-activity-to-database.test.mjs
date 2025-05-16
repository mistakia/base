import { expect } from 'chai'
import db from '#db'
import write_activity_to_database from '#libs-server/entity/database/write/write-activity-to-database.mjs'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

describe('write_activity_to_database', () => {
  let test_user
  let test_user_id

  beforeEach(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
    test_user_id = test_user.user_id
  })

  afterEach(async () => {
    await reset_all_tables()
  })

  it('should create a new activity entity in the database', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const activity_properties = {
      title: 'Test Activity',
      description: 'Test activity description',
      created_at: now,
      updated_at: later
    }
    const activity_content = '# Test Activity\n\nActivity body content'

    // Act
    const activity_entity_id = await write_activity_to_database({
      activity_properties,
      user_id: test_user_id,
      activity_content
    })

    // Assert
    expect(activity_entity_id).to.be.a('string')

    // Verify entity was created in database
    const entity = await db('entities')
      .where({ entity_id: activity_entity_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(activity_properties.title)
    expect(entity.description).to.equal(activity_properties.description)
    expect(entity.type).to.equal('activity')
    expect(entity.user_id).to.equal(test_user_id)
    expect(entity.markdown).to.equal(activity_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(activity_properties.title)
    expect(frontmatter.description).to.equal(activity_properties.description)
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      activity_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      activity_properties.updated_at.getTime(),
      1000
    )

    // Verify activity-specific data was created
    const activity_data = await db('activities')
      .where({ entity_id: activity_entity_id })
      .first()
    expect(activity_data).to.exist
  })

  it('should update an existing activity in the database', async () => {
    // Arrange - first create an activity
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const original_properties = {
      title: 'Original Activity',
      description: 'Original description',
      created_at: now,
      updated_at: later
    }
    const original_content = 'Original activity content'

    const activity_entity_id = await write_activity_to_database({
      activity_properties: original_properties,
      user_id: test_user_id,
      activity_content: original_content
    })

    // Create updated activity properties
    const even_later = new Date(later.getTime() + 1000) // 2 seconds after original created_at
    const updated_properties = {
      title: 'Updated Activity',
      description: 'Updated description',
      created_at: now, // keep original created_at
      updated_at: even_later
    }
    const updated_content = 'Updated activity content'

    // Act - update the activity
    await write_activity_to_database({
      activity_properties: updated_properties,
      user_id: test_user_id,
      activity_content: updated_content,
      entity_id: activity_entity_id
    })

    // Assert - verify entity was updated
    const entity = await db('entities')
      .where({ entity_id: activity_entity_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(updated_properties.title)
    expect(entity.description).to.equal(updated_properties.description)
    expect(entity.markdown).to.equal(updated_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(updated_properties.title)
    expect(frontmatter.description).to.equal(updated_properties.description)
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      updated_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      updated_properties.updated_at.getTime(),
      1000
    )
  })

  it('should handle file info correctly', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const activity_properties = {
      title: 'File Activity',
      description: 'Activity with file info',
      created_at: now,
      updated_at: later
    }
    const file_info = {
      absolute_path: '/path/to/activity.md',
      git_sha: '12345abcdef'
    }

    // Act
    const activity_entity_id = await write_activity_to_database({
      activity_properties,
      user_id: test_user_id,
      file_info
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: activity_entity_id })
      .first()
    expect(entity).to.exist
    expect(entity.absolute_path).to.equal(file_info.absolute_path)
    expect(entity.git_sha).to.equal(file_info.git_sha)
  })

  it('should store activity with relationships', async () => {
    // Arrange - first create a related tag entity
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // Create a tag to use for the activity
    const tag_properties = {
      title: 'Activity Tag',
      description: 'A tag for activities',
      created_at: now,
      updated_at: later
    }

    const tag_entity_id = await db('entities')
      .insert({
        title: tag_properties.title,
        description: tag_properties.description,
        type: 'tag',
        user_id: test_user_id,
        created_at: tag_properties.created_at,
        updated_at: tag_properties.updated_at,
        frontmatter: tag_properties
      })
      .returning('entity_id')
      .then((rows) => rows[0].entity_id)

    await db('tags').insert({ entity_id: tag_entity_id })

    // Create a related task entity for relation testing
    const task_properties = {
      title: 'Related Task',
      description: 'A task related to the activity',
      type: 'task',
      created_at: now,
      updated_at: later
    }

    const task_entity_id = await db('entities')
      .insert({
        title: task_properties.title,
        description: task_properties.description,
        type: 'task',
        user_id: test_user_id,
        created_at: task_properties.created_at,
        updated_at: task_properties.updated_at,
        frontmatter: task_properties
      })
      .returning('entity_id')
      .then((rows) => rows[0].entity_id)

    await db('tasks').insert({ entity_id: task_entity_id, status: 'Planned' })

    // Create activity with tag and relation
    const activity_properties = {
      title: 'Related Activity',
      description: 'Activity with tags and relations',
      tags: [tag_entity_id],
      relations: {
        contains: [task_entity_id]
      },
      created_at: now,
      updated_at: later
    }

    // Act
    const activity_entity_id = await write_activity_to_database({
      activity_properties,
      user_id: test_user_id
    })

    // Assert tag relationship
    const tag_relation = await db('entity_tags')
      .where({
        entity_id: activity_entity_id,
        tag_entity_id
      })
      .first()

    expect(tag_relation).to.exist

    // Assert entity relationship
    const entity_relation = await db('entity_relations')
      .where({
        source_entity_id: activity_entity_id,
        target_entity_id: task_entity_id,
        relation_type: 'contains'
      })
      .first()

    expect(entity_relation).to.exist
  })
})
