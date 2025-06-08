import { expect } from 'chai'
import db from '#db'
import { write_entity_to_database } from '#libs-server/entity/database/write/write-entity-to-database.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_temp_test_repo
} from '#tests/utils/index.mjs'
import { v4 as uuid } from 'uuid'
import path from 'path'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

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
      entity_content,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
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
      entity_content: original_content,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
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
      entity_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
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
      base_uri: 'sys:text/file',
      git_sha: '12345abcdef'
    }

    // Act
    const entity_id = await write_entity_to_database({
      entity_properties,
      entity_type,
      user_id: test_user_id,
      absolute_path: file_info.absolute_path,
      base_uri: file_info.base_uri,
      git_sha: file_info.git_sha
    })

    // Assert
    const entity = await db('entities').where({ entity_id }).first()
    expect(entity).to.exist
    expect(entity.absolute_path).to.equal(file_info.absolute_path)
    expect(entity.base_uri).to.equal(file_info.base_uri)
    expect(entity.git_sha).to.equal(file_info.git_sha)
  })

  it('should process entity relations when provided', async () => {
    // Arrange - set up a temp repo and create a related entity file
    const test_repo = await create_temp_test_repo({
      prefix: 'entity-rel-test-'
    })
    const user_repo_path = test_repo.user_path
    const related_entity_id = uuid()
    const related_base_uri = 'user:relations/related-entity.md'
    const related_file_path = path.join(
      user_repo_path,
      'relations',
      'related-entity.md'
    )
    const now = new Date()
    const later = new Date(now.getTime() + 1000)
    await write_entity_to_filesystem({
      absolute_path: related_file_path,
      entity_properties: {
        user_id: test_user_id,
        entity_id: related_entity_id,
        title: 'Related Entity',
        description: 'A related entity',
        type: 'task',
        created_at: now,
        updated_at: later
      },
      entity_type: 'task',
      entity_content: 'A related entity.'
    })
    await db('entities').insert({
      entity_id: related_entity_id,
      title: 'Related Entity',
      description: 'A related entity',
      type: 'task',
      user_id: test_user_id,
      created_at: now,
      updated_at: later,
      frontmatter: {
        entity_id: related_entity_id,
        title: 'Related Entity',
        description: 'A related entity',
        type: 'task',
        created_at: now,
        updated_at: later
      },
      base_uri: related_base_uri
    })
    // Create main entity with relation (using base_uri)
    const entity_properties = {
      title: 'Main Entity',
      description: 'Entity with relations',
      created_at: now,
      updated_at: later,
      entity_id: uuid()
    }
    const formatted_entity_metadata = {
      relations: [{ relation_type: 'references', base_uri: related_base_uri }]
    }
    // Act
    const entity_id = await write_entity_to_database({
      entity_properties,
      entity_type: 'task',
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1',
      formatted_entity_metadata
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
    // Clean up temp repo
    await test_repo.cleanup()
  })

  it('should process entity tags when provided', async () => {
    // Arrange - set up a temp repo and create a tag entity file
    const test_repo = await create_temp_test_repo({
      prefix: 'entity-tag-test-'
    })
    const user_repo_path = test_repo.user_path
    const tag_entity_id = uuid()
    const tag_base_uri = 'user:tags/entity-tag.md'
    const tag_file_path = path.join(user_repo_path, 'tags', 'entity-tag.md')
    const now = new Date()
    const later = new Date(now.getTime() + 1000)
    await write_entity_to_filesystem({
      absolute_path: tag_file_path,
      entity_properties: {
        user_id: test_user_id,
        entity_id: tag_entity_id,
        title: 'Entity Tag',
        description: 'A tag for entities',
        type: 'tag',
        created_at: now,
        updated_at: later
      },
      entity_type: 'tag',
      entity_content: 'A tag for entities.'
    })
    await db('entities').insert({
      entity_id: tag_entity_id,
      title: 'Entity Tag',
      description: 'A tag for entities',
      type: 'tag',
      user_id: test_user_id,
      created_at: now,
      updated_at: later,
      frontmatter: {
        entity_id: tag_entity_id,
        title: 'Entity Tag',
        description: 'A tag for entities',
        type: 'tag',
        created_at: now,
        updated_at: later
      },
      base_uri: tag_base_uri
    })
    // Create main entity with tag (using base_uri)
    const entity_properties = {
      title: 'Main Entity',
      description: 'Entity with tags',
      tags: [tag_base_uri],
      created_at: now,
      updated_at: later,
      entity_id: uuid()
    }
    // Act
    const entity_id = await write_entity_to_database({
      entity_properties,
      entity_type: 'task',
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
    })
    // Assert
    const tag_relation = await db('entity_tags')
      .where({
        entity_id,
        tag_entity_id
      })
      .first()
    expect(tag_relation).to.exist
    // Clean up temp repo
    await test_repo.cleanup()
  })

  it('should throw an error when entity_properties is not provided', async () => {
    try {
      await write_entity_to_database({
        entity_type: 'task',
        user_id: test_user_id,
        absolute_path: '/dummy/path.md',
        base_uri: 'sys:dummy/base/path',
        git_sha: 'dummysha1'
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
        user_id: test_user_id,
        absolute_path: '/dummy/path.md',
        base_uri: 'sys:dummy/base/path',
        git_sha: 'dummysha1'
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
        entity_type: 'task',
        absolute_path: '/dummy/path.md',
        base_uri: 'sys:dummy/base/path',
        git_sha: 'dummysha1'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.include('User ID is required')
    }
  })
})
