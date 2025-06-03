import { v4 as uuid } from 'uuid'
import { expect } from 'chai'
import path from 'path'
import db from '#db'
import write_workflow_to_database from '#libs-server/entity/database/write/write-workflow-to-database.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_temp_test_repo
} from '#tests/utils/index.mjs'

describe('write_workflow_to_database', () => {
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

  it('should create a new workflow entity in the database', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const workflow_properties = {
      entity_id: uuid(),
      title: 'Test Workflow',
      description: 'Test workflow description',
      created_at: now,
      updated_at: later
    }
    const workflow_content = '# Test Workflow\n\nWorkflow body content'

    // Act
    const workflow_entity_id = await write_workflow_to_database({
      workflow_properties,
      user_id: test_user_id,
      workflow_content,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert
    expect(workflow_entity_id).to.be.a('string')

    // Verify entity was created in database
    const entity = await db('entities')
      .where({ entity_id: workflow_entity_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(workflow_properties.title)
    expect(entity.description).to.equal(workflow_properties.description)
    expect(entity.type).to.equal('workflow')
    expect(entity.user_id).to.equal(test_user_id)
    expect(entity.markdown).to.equal(workflow_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(workflow_properties.title)
    expect(frontmatter.description).to.equal(workflow_properties.description)
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      workflow_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      workflow_properties.updated_at.getTime(),
      1000
    )

    // Verify workflow-specific data was created
    const workflow_data = await db('workflows')
      .where({ entity_id: workflow_entity_id })
      .first()
    expect(workflow_data).to.exist
  })

  it('should update an existing workflow in the database', async () => {
    // Arrange - first create a workflow
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later
    const entity_id = uuid()

    const original_properties = {
      entity_id,
      title: 'Original Workflow',
      description: 'Original description',
      created_at: now,
      updated_at: later
    }
    const original_content = 'Original workflow content'

    const workflow_entity_id = await write_workflow_to_database({
      workflow_properties: original_properties,
      user_id: test_user_id,
      workflow_content: original_content,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Create updated workflow properties
    const even_later = new Date(later.getTime() + 1000) // 2 seconds after original created_at
    const updated_properties = {
      entity_id,
      title: 'Updated Workflow',
      description: 'Updated description',
      created_at: now, // keep original created_at
      updated_at: even_later
    }
    const updated_content = 'Updated workflow content'

    // Act - update the workflow
    await write_workflow_to_database({
      workflow_properties: updated_properties,
      user_id: test_user_id,
      workflow_content: updated_content,
      entity_id: workflow_entity_id,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert - verify entity was updated
    const entity = await db('entities')
      .where({ entity_id: workflow_entity_id })
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

    const workflow_properties = {
      entity_id: uuid(),
      title: 'File Workflow',
      description: 'Workflow with file info',
      created_at: now,
      updated_at: later
    }
    const file_info = {
      absolute_path: '/path/to/workflow.md',
      git_sha: '12345abcdef'
    }

    // Act
    const workflow_entity_id = await write_workflow_to_database({
      workflow_properties,
      user_id: test_user_id,
      file_info,
      absolute_path: file_info.absolute_path,
      base_relative_path: 'dummy/base/path',
      git_sha: file_info.git_sha
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: workflow_entity_id })
      .first()
    expect(entity).to.exist
    expect(entity.absolute_path).to.equal(file_info.absolute_path)
    expect(entity.git_sha).to.equal(file_info.git_sha)
  })

  it('should store workflow with relationships', async () => {
    // Arrange - set up a temp repo and create a tag entity file
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // 1. Create a temp repo
    const test_repo = await create_temp_test_repo({
      prefix: 'workflow-tag-test-'
    })
    const user_repo_path = test_repo.user_path
    const tag_entity_id = uuid()
    const tag_base_relative_path = 'user/tags/workflow-tag.md'
    const tag_file_path = path.join(user_repo_path, 'tags', 'workflow-tag.md')

    // 2. Write the tag entity file using write_entity_to_filesystem
    await write_entity_to_filesystem({
      absolute_path: tag_file_path,
      entity_properties: {
        entity_id: tag_entity_id,
        user_id: test_user_id,
        title: 'Workflow Tag',
        description: 'A tag for workflows',
        type: 'tag',
        created_at: now,
        updated_at: later
      },
      entity_type: 'tag',
      entity_content: 'A tag for workflows.'
    })

    // 3. Insert the tag entity into the database
    await db('entities').insert({
      entity_id: tag_entity_id,
      title: 'Workflow Tag',
      description: 'A tag for workflows',
      type: 'tag',
      user_id: test_user_id,
      created_at: now,
      updated_at: later,
      frontmatter: {
        entity_id: tag_entity_id,
        title: 'Workflow Tag',
        description: 'A tag for workflows',
        type: 'tag',
        created_at: now,
        updated_at: later
      },
      base_relative_path: tag_base_relative_path
    })
    await db('tags').insert({ entity_id: tag_entity_id })

    // Create a related task entity for relation testing
    const task_entity_id = uuid()
    const task_base_relative_path = 'user/tasks/related-task.md'
    const task_file_path = path.join(user_repo_path, 'tasks', 'related-task.md')

    // Write the task entity file
    await write_entity_to_filesystem({
      absolute_path: task_file_path,
      entity_properties: {
        entity_id: task_entity_id,
        user_id: test_user_id,
        title: 'Related Task',
        description: 'A task related to the workflow',
        type: 'task',
        status: 'Planned',
        created_at: now,
        updated_at: later
      },
      entity_type: 'task',
      entity_content: 'A task related to the workflow.'
    })

    // Insert the task entity into the database
    await db('entities').insert({
      entity_id: task_entity_id,
      title: 'Related Task',
      description: 'A task related to the workflow',
      type: 'task',
      user_id: test_user_id,
      created_at: now,
      updated_at: later,
      frontmatter: {
        entity_id: task_entity_id,
        title: 'Related Task',
        description: 'A task related to the workflow',
        type: 'task',
        status: 'Planned',
        created_at: now,
        updated_at: later
      },
      base_relative_path: task_base_relative_path
    })
    await db('tasks').insert({ entity_id: task_entity_id, status: 'Planned' })

    // Create workflow with tags (using base_relative_path)
    const workflow_properties = {
      entity_id: uuid(),
      title: 'Related Workflow',
      description: 'Workflow with tags and relations',
      tags: [tag_base_relative_path],
      created_at: now,
      updated_at: later
    }

    // Set up formatted_entity_metadata with relations
    const formatted_entity_metadata = {
      property_tags: [{ base_relative_path: tag_base_relative_path }],
      relations: [
        { relation_type: 'contains', entity_path: task_base_relative_path }
      ]
    }

    const workflow_content = '# Related Workflow\n\nThis has relations.'

    // Act
    const workflow_entity_id = await write_workflow_to_database({
      workflow_properties,
      user_id: test_user_id,
      workflow_content,
      absolute_path: '/path/to/related.md',
      base_relative_path: 'path/to/related',
      git_sha: 'abcdef',
      root_base_directory: test_repo.path,
      formatted_entity_metadata
    })

    // Assert - check entity tags
    const entity_tags = await db('entity_tags')
      .where({ entity_id: workflow_entity_id })
      .select('tag_entity_id')

    expect(entity_tags).to.have.lengthOf(1)
    expect(entity_tags[0].tag_entity_id).to.equal(tag_entity_id)

    // Check entity relations
    const entity_relations = await db('entity_relations')
      .where({ source_entity_id: workflow_entity_id })
      .select('relation_type', 'target_entity_id')

    expect(entity_relations).to.have.lengthOf(1)
    expect(entity_relations[0].relation_type).to.equal('contains')
    expect(entity_relations[0].target_entity_id).to.equal(task_entity_id)

    // Clean up temp repo
    await test_repo.cleanup()
  })
})
