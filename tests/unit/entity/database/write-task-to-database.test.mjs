import { expect } from 'chai'
import db from '#db'
import write_task_to_database from '#libs-server/entity/database/write/write-task-to-database.mjs'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

describe('write_task_to_database', () => {
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

  it('should create a new task entity in the database', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const task_properties = {
      title: 'Test Task',
      description: 'Test task description',
      status: 'Planned',
      priority: 'Medium',
      created_at: now,
      updated_at: later
    }
    const task_content = '# Test Task\n\nTask body content'

    // Act
    const task_id = await write_task_to_database({
      task_properties,
      user_id: test_user_id,
      task_content
    })

    // Assert
    expect(task_id).to.be.a('string')

    // Verify entity was created in database
    const entity = await db('entities').where({ entity_id: task_id }).first()
    expect(entity).to.exist
    expect(entity.title).to.equal(task_properties.title)
    expect(entity.description).to.equal(task_properties.description)
    expect(entity.type).to.equal('task')
    expect(entity.user_id).to.equal(test_user_id)
    expect(entity.markdown).to.equal(task_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(task_properties.title)
    expect(frontmatter.description).to.equal(task_properties.description)
    expect(frontmatter.status).to.equal(task_properties.status)
    expect(frontmatter.priority).to.equal(task_properties.priority)
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      task_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      task_properties.updated_at.getTime(),
      1000
    )

    // Verify task-specific data was created
    const task_data = await db('tasks').where({ entity_id: task_id }).first()
    expect(task_data).to.exist
    expect(task_data.status).to.equal(task_properties.status)
    expect(task_data.priority).to.equal(task_properties.priority)
  })

  it('should update an existing task in the database', async () => {
    // Arrange - first create a task
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const original_properties = {
      title: 'Original Task',
      description: 'Original description',
      status: 'No status',
      priority: 'Low',
      created_at: now,
      updated_at: later
    }
    const original_content = 'Original task content'

    const task_id = await write_task_to_database({
      task_properties: original_properties,
      user_id: test_user_id,
      task_content: original_content
    })

    // Create updated task properties
    const even_later = new Date(later.getTime() + 1000) // 2 seconds after original created_at
    const updated_properties = {
      title: 'Updated Task',
      description: 'Updated description',
      status: 'In Progress',
      priority: 'High',
      created_at: now, // keep original created_at
      updated_at: even_later,
      start_by: new Date(even_later.getTime() + 86400000) // 1 day after
    }
    const updated_content = 'Updated task content'

    // Act - update the task
    await write_task_to_database({
      task_properties: updated_properties,
      user_id: test_user_id,
      task_content: updated_content,
      task_id
    })

    // Assert - verify entity was updated
    const entity = await db('entities').where({ entity_id: task_id }).first()
    expect(entity).to.exist
    expect(entity.title).to.equal(updated_properties.title)
    expect(entity.description).to.equal(updated_properties.description)
    expect(entity.markdown).to.equal(updated_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(updated_properties.title)
    expect(frontmatter.description).to.equal(updated_properties.description)
    expect(frontmatter.status).to.equal(updated_properties.status)
    expect(frontmatter.priority).to.equal(updated_properties.priority)
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      updated_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      updated_properties.updated_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.start_by).getTime()).to.be.closeTo(
      updated_properties.start_by.getTime(),
      1000
    )

    // Verify task-specific data was updated
    const task_data = await db('tasks').where({ entity_id: task_id }).first()
    expect(task_data).to.exist
    expect(task_data.status).to.equal(updated_properties.status)
    expect(task_data.priority).to.equal(updated_properties.priority)
    expect(task_data.start_by).to.be.a('date')
  })

  it('should handle file info correctly', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const task_properties = {
      title: 'File Task',
      description: 'Task with file info',
      created_at: now,
      updated_at: later
    }
    const file_info = {
      absolute_path: '/path/to/task.md',
      git_sha: '12345abcdef'
    }

    // Act
    const task_id = await write_task_to_database({
      task_properties,
      user_id: test_user_id,
      file_info
    })

    // Assert
    const entity = await db('entities').where({ entity_id: task_id }).first()
    expect(entity).to.exist
    expect(entity.file_path).to.equal(file_info.absolute_path)
    expect(entity.git_sha).to.equal(file_info.git_sha)
  })

  it('should store all task-specific fields correctly', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later
    const tomorrow = new Date(now.getTime() + 86400000) // 1 day later
    const next_week = new Date(now.getTime() + 7 * 86400000) // 7 days later

    const task_properties = {
      title: 'Detailed Task',
      description: 'Task with all fields populated',
      status: 'Started',
      priority: 'High',
      start_by: tomorrow,
      finish_by: next_week,
      planned_start: tomorrow,
      planned_finish: next_week,
      estimated_total_duration: 10,
      estimated_preparation_duration: 2,
      estimated_execution_duration: 6,
      estimated_cleanup_duration: 2,
      actual_duration: null,
      started_at: now,
      finished_at: null,
      snooze_until: null,
      assigned_to: 'Test User',
      created_at: now,
      updated_at: later
    }

    // Act
    const task_id = await write_task_to_database({
      task_properties,
      user_id: test_user_id
    })

    // Assert - verify entity was created
    const entity = await db('entities').where({ entity_id: task_id }).first()
    expect(entity).to.exist
    expect(entity.title).to.equal(task_properties.title)
    expect(entity.type).to.equal('task')

    // Verify task-specific data was stored correctly
    const task_data = await db('tasks').where({ entity_id: task_id }).first()
    expect(task_data).to.exist
    expect(task_data.status).to.equal(task_properties.status)
    expect(task_data.priority).to.equal(task_properties.priority)
    expect(task_data.start_by).to.be.a('date')
    expect(task_data.start_by.toISOString()).to.contain(
      tomorrow.toISOString().split('T')[0]
    )
    expect(task_data.finish_by).to.be.a('date')
    expect(task_data.finish_by.toISOString()).to.contain(
      next_week.toISOString().split('T')[0]
    )
    expect(task_data.planned_start).to.be.a('date')
    expect(task_data.planned_finish).to.be.a('date')
    expect(task_data.estimated_total_duration).to.equal(
      task_properties.estimated_total_duration
    )
    expect(task_data.estimated_preparation_duration).to.equal(
      task_properties.estimated_preparation_duration
    )
    expect(task_data.estimated_execution_duration).to.equal(
      task_properties.estimated_execution_duration
    )
    expect(task_data.estimated_cleanup_duration).to.equal(
      task_properties.estimated_cleanup_duration
    )
    expect(task_data.started_at).to.be.a('date')
    expect(task_data.started_at.toISOString()).to.contain(
      now.toISOString().split('T')[0]
    )
    expect(task_data.finished_at).to.be.null
    expect(task_data.assigned_to).to.equal(task_properties.assigned_to)
  })

  it('should store task with relationships', async () => {
    // Arrange - first create a related tag entity
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // Create a tag to use for the task
    const tag_properties = {
      title: 'Task Tag',
      description: 'A tag for tasks',
      created_at: now,
      updated_at: later
    }

    const tag_id = await db('entities')
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

    await db('tags').insert({ entity_id: tag_id })

    // Create task with tag
    const task_properties = {
      title: 'Tagged Task',
      description: 'Task with tags',
      status: 'Planned',
      tags: [tag_id],
      created_at: now,
      updated_at: later
    }

    // Act
    const task_id = await write_task_to_database({
      task_properties,
      user_id: test_user_id
    })

    // Assert
    const tag_relation = await db('entity_tags')
      .where({
        entity_id: task_id,
        tag_entity_id: tag_id
      })
      .first()

    expect(tag_relation).to.exist
  })
})
