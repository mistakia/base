import { expect } from 'chai'
import db from '#db'
import { write_entity_to_database } from '#libs-server/entity/database/write/write-entity-to-database.mjs'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'
import { v4 as uuid } from 'uuid'

describe('write_entity_to_database', () => {
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

  it('should create a new entity in the database', async () => {
    // Arrange
    const entity_properties = {
      title: 'Test Entity',
      description: 'Test description',
      entity_id: uuid()
    }
    const entity_type = 'task'
    const entity_content = '# Test Entity\n\nContent body'

    // Act
    const entity_id = await write_entity_to_database({
      entity_properties,
      entity_type,
      user_id: test_user_id,
      entity_content
    })

    // Assert
    expect(entity_id).to.be.a('string')

    // Verify entity was created in database
    const entity = await db('entities').where({ entity_id }).first()
    expect(entity).to.exist
    expect(entity.title).to.equal(entity_properties.title)
    expect(entity.description).to.equal(entity_properties.description)
    expect(entity.type).to.equal(entity_type)
    expect(entity.user_id).to.equal(test_user_id)
    expect(entity.markdown).to.equal(entity_content)
    expect(entity.frontmatter).to.deep.equal(entity_properties)
  })

  it('should update an existing entity in the database', async () => {
    // Arrange - first create an entity
    const original_properties = {
      title: 'Original Title',
      description: 'Original description',
      entity_id: uuid()
    }
    const entity_type = 'task'
    const original_content = 'Original content'

    const entity_id = await write_entity_to_database({
      entity_properties: original_properties,
      entity_type,
      user_id: test_user_id,
      entity_content: original_content
    })

    // Update properties and content
    const updated_properties = {
      title: 'Updated Title',
      description: 'Updated description',
      entity_id
    }
    const updated_content = 'Updated content'

    // Act - update the entity
    await write_entity_to_database({
      entity_properties: updated_properties,
      entity_type,
      user_id: test_user_id,
      entity_content: updated_content,
      entity_id
    })

    // Assert
    const entity = await db('entities').where({ entity_id }).first()
    expect(entity).to.exist
    expect(entity.title).to.equal(updated_properties.title)
    expect(entity.description).to.equal(updated_properties.description)
    expect(entity.markdown).to.equal(updated_content)
    expect(entity.frontmatter).to.deep.equal(updated_properties)
  })

  it('should handle file info correctly', async () => {
    // Arrange
    const entity_properties = {
      title: 'File Entity',
      description: 'Entity with file info',
      entity_id: uuid()
    }
    const entity_type = 'task'
    const file_info = {
      absolute_path: '/path/to/file.md',
      base_relative_path: 'system/text/file',
      git_sha: '12345abcdef'
    }

    // Act
    const entity_id = await write_entity_to_database({
      entity_properties,
      entity_type,
      user_id: test_user_id,
      file_info
    })

    // Assert
    const entity = await db('entities').where({ entity_id }).first()
    expect(entity).to.exist
    expect(entity.absolute_path).to.equal(file_info.absolute_path)
    expect(entity.base_relative_path).to.equal(file_info.base_relative_path)
    expect(entity.git_sha).to.equal(file_info.git_sha)
  })

  it('should process entity relations when provided', async () => {
    // Arrange - create two related entities first
    const related_entity_id = await write_entity_to_database({
      entity_properties: {
        title: 'Related Entity',
        description: 'Related entity description',
        entity_id: uuid()
      },
      entity_type: 'task',
      user_id: test_user_id
    })

    // Create consistent timestamps to avoid constraint violations
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const entity_properties = {
      title: 'Main Entity',
      description: 'Entity with relations',
      relations: {
        references: [related_entity_id]
      },
      created_at: now,
      updated_at: later,
      entity_id: uuid()
    }

    // Act
    const entity_id = await write_entity_to_database({
      entity_properties,
      entity_type: 'task',
      user_id: test_user_id
    })

    // Assert
    const relations = await db('entity_relations')
      .where({
        source_entity_id: entity_id,
        target_entity_id: related_entity_id,
        relation_type: 'references'
      })
      .first()

    expect(relations).to.exist
  })

  it('should process entity tags when provided', async () => {
    // Create consistent timestamps to avoid constraint violations
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // Arrange - create a tag entity first
    const tag_entity_id = await write_entity_to_database({
      entity_properties: {
        title: 'Test Tag',
        description: 'A test tag',
        created_at: now,
        updated_at: later,
        entity_id: uuid()
      },
      entity_type: 'tag',
      user_id: test_user_id
    })

    const entity_properties = {
      title: 'Tagged Entity',
      description: 'Entity with tags',
      tags: [tag_entity_id],
      created_at: now,
      updated_at: later,
      entity_id: uuid()
    }

    // Act
    const entity_id = await write_entity_to_database({
      entity_properties,
      entity_type: 'task',
      user_id: test_user_id
    })

    // Assert
    const tag_relation = await db('entity_tags')
      .where({
        entity_id,
        tag_entity_id
      })
      .first()

    expect(tag_relation).to.exist
  })

  it('should throw an error when entity_properties is not provided', async () => {
    try {
      await write_entity_to_database({
        entity_type: 'task',
        user_id: test_user_id
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.include(
        'Entity properties must be a valid object'
      )
    }
  })

  it('should throw an error when entity_type is not provided', async () => {
    try {
      await write_entity_to_database({
        entity_properties: { title: 'Test', description: 'Test description' },
        user_id: test_user_id
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.include('Entity type is required')
    }
  })

  it('should throw an error when user_id is not provided', async () => {
    try {
      await write_entity_to_database({
        entity_properties: { title: 'Test', description: 'Test description' },
        entity_type: 'task'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.include('User ID is required')
    }
  })
})
