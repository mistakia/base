import { v4 as uuid } from 'uuid'
import { expect } from 'chai'
import db from '#db'
import write_database_table_item_to_database from '#libs-server/entity/database/write/write-database-table-item-to-database.mjs'
import {
  reset_all_tables,
  create_test_user,
  setup_test_directories
} from '#tests/utils/index.mjs'
import path from 'path'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

describe('write_database_table_item_to_database', () => {
  let test_user
  let test_user_id
  let test_database_table_id
  let test_directories

  beforeEach(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
    test_user_id = test_user.user_id

    // Setup test directories and register them
    test_directories = setup_test_directories()

    // Create a test database table for our items
    test_database_table_id = await db('entities')
      .insert({
        title: 'Test Database Table',
        description: 'A test database table for items',
        type: 'database',
        user_id: test_user_id,
        created_at: new Date(),
        updated_at: new Date(),
        frontmatter: {
          title: 'Test Database Table',
          description: 'A test database table for items'
        }
      })
      .returning('entity_id')
      .then((rows) => rows[0].entity_id)

    await db('database_tables').insert({
      entity_id: test_database_table_id,
      table_name: 'test_table',
      table_description: 'Test table description',
      fields: JSON.stringify({
        id: { type: 'integer', primaryKey: true },
        name: { type: 'text' },
        description: { type: 'text' }
      })
    })
  })

  afterEach(async () => {
    await reset_all_tables()
    if (test_directories) {
      test_directories.cleanup()
    }
  })

  it('should create a new database table item entity in the database', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const database_item_properties = {
      entity_id: uuid(),
      title: 'Test Item',
      description: 'Test database table item description',
      database_table_id: test_database_table_id,
      field_values: {
        status: 'Active',
        score: 85,
        notes: 'Initial test notes'
      },
      created_at: now,
      updated_at: later
    }
    const database_item_content = '# Test Item\n\nItem body content'

    // Act
    const database_item_id = await write_database_table_item_to_database({
      database_item_properties,
      user_id: test_user_id,
      database_item_content,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert
    expect(database_item_id).to.be.a('string')

    // Verify entity was created in database
    const entity = await db('entities')
      .where({ entity_id: database_item_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(database_item_properties.title)
    expect(entity.description).to.equal(database_item_properties.description)
    expect(entity.type).to.equal('database_item')
    expect(entity.user_id).to.equal(test_user_id)
    expect(entity.markdown).to.equal(database_item_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(database_item_properties.title)
    expect(frontmatter.description).to.equal(
      database_item_properties.description
    )
    expect(frontmatter.database_table_id).to.equal(
      database_item_properties.database_table_id
    )
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      database_item_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      database_item_properties.updated_at.getTime(),
      1000
    )

    // Verify database table item-specific data was created
    const database_item_data = await db('database_table_items')
      .where({ entity_id: database_item_id })
      .first()
    expect(database_item_data).to.exist
    expect(database_item_data.database_table_id).to.equal(
      database_item_properties.database_table_id
    )
    expect(database_item_data.field_values).to.deep.equal(
      database_item_properties.field_values
    )
  })

  it('should update an existing database table item in the database', async () => {
    // Arrange - first create a database table item
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later
    const entity_id = uuid()

    const original_properties = {
      entity_id,
      title: 'Original Item',
      description: 'Original description',
      database_table_id: test_database_table_id,
      field_values: {
        status: 'Draft',
        score: 50,
        notes: 'Original notes'
      },
      created_at: now,
      updated_at: later
    }
    const original_content = 'Original item content'

    const database_item_id = await write_database_table_item_to_database({
      database_item_properties: original_properties,
      user_id: test_user_id,
      database_item_content: original_content,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Create updated item properties
    const even_later = new Date(later.getTime() + 1000) // 2 seconds after original created_at
    const updated_properties = {
      entity_id,
      title: 'Updated Item',
      description: 'Updated description',
      database_table_id: test_database_table_id,
      field_values: {
        status: 'Completed',
        score: 95,
        notes: 'Updated notes',
        new_field: 'New value'
      },
      created_at: now, // keep original created_at
      updated_at: even_later
    }
    const updated_content = 'Updated item content'

    // Act - update the item
    await write_database_table_item_to_database({
      database_item_properties: updated_properties,
      user_id: test_user_id,
      database_item_content: updated_content,
      database_item_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert - verify entity was updated
    const entity = await db('entities')
      .where({ entity_id: database_item_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(updated_properties.title)
    expect(entity.description).to.equal(updated_properties.description)
    expect(entity.markdown).to.equal(updated_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(updated_properties.title)
    expect(frontmatter.description).to.equal(updated_properties.description)
    expect(frontmatter.database_table_id).to.equal(
      updated_properties.database_table_id
    )
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      updated_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      updated_properties.updated_at.getTime(),
      1000
    )

    // Verify database table item-specific data was updated
    const database_item_data = await db('database_table_items')
      .where({ entity_id: database_item_id })
      .first()
    expect(database_item_data).to.exist
    expect(database_item_data.database_table_id).to.equal(
      updated_properties.database_table_id
    )
    expect(database_item_data.field_values).to.deep.equal(
      updated_properties.field_values
    )
  })

  it('should handle file info correctly', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const database_item_properties = {
      entity_id: uuid(),
      title: 'File Item',
      description: 'Item with file info',
      database_table_id: test_database_table_id,
      created_at: now,
      updated_at: later
    }
    const file_info = {
      absolute_path: '/path/to/item.md',
      git_sha: '12345abcdef',
      base_uri: 'sys:dummy/base/path'
    }

    // Act
    const database_item_id = await write_database_table_item_to_database({
      database_item_properties,
      user_id: test_user_id,
      absolute_path: file_info.absolute_path,
      base_uri: file_info.base_uri,
      git_sha: file_info.git_sha
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: database_item_id })
      .first()
    expect(entity).to.exist
    expect(entity.absolute_path).to.equal(file_info.absolute_path)
    expect(entity.git_sha).to.equal(file_info.git_sha)
  })

  it('should validate required fields', async () => {
    // Arrange
    const database_item_properties = {
      entity_id: uuid(),
      title: 'Missing Required Field',
      description: 'This item is missing the required database_table_id'
      // Deliberately omitting database_table_id
    }

    // Act & Assert
    try {
      await write_database_table_item_to_database({
        database_item_properties,
        user_id: test_user_id,
        absolute_path: '/dummy/path.md',
        base_uri: 'sys:dummy/base/path',
        git_sha: 'dummysha1'
      })
      // If we get here, the test should fail
      expect.fail('Should have thrown an error for missing database_table_id')
    } catch (error) {
      expect(error.message).to.include('Database table ID is required')
    }
  })

  it('should store database table item with complex field values', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const database_item_properties = {
      entity_id: uuid(),
      title: 'Complex Fields Item',
      description: 'Item with complex field values',
      database_table_id: test_database_table_id,
      field_values: {
        string_field: 'Text value',
        number_field: 42,
        boolean_field: true,
        date_field: new Date('2023-01-15'),
        array_field: ['one', 'two', 'three'],
        object_field: {
          nested_key1: 'nested value 1',
          nested_key2: 123
        }
      },
      created_at: now,
      updated_at: later
    }

    // Act
    const database_item_id = await write_database_table_item_to_database({
      database_item_properties,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert
    const database_item_data = await db('database_table_items')
      .where({ entity_id: database_item_id })
      .first()
    expect(database_item_data).to.exist

    // Check that all fields except date_field match exactly
    const { date_field, ...other_fields } = database_item_data.field_values
    const { date_field: expected_date, ...expected_other_fields } =
      database_item_properties.field_values

    expect(other_fields).to.deep.equal(expected_other_fields)

    // Check date field separately
    if (date_field) {
      // Check if it's an ISO string (the stored format)
      if (typeof date_field === 'string') {
        expect(new Date(date_field).toISOString()).to.equal(
          expected_date.toISOString()
        )
      } else {
        // Otherwise, handle as Date object
        expect(
          date_field instanceof Date ||
            date_field.toString() === expected_date.toString()
        ).to.be.true
      }
    }
  })

  it('should store database table item with relationships', async () => {
    // Arrange - create a tag entity file using registered directories
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const tag_entity_id = uuid()
    const tag_base_uri = 'user:tags/item-tag.md'
    const tag_file_path = path.join(
      test_directories.user_path,
      'tags',
      'item-tag.md'
    )

    // 1. Write the tag entity file using write_entity_to_filesystem
    await write_entity_to_filesystem({
      absolute_path: tag_file_path,
      entity_properties: {
        user_id: test_user_id,
        entity_id: tag_entity_id,
        title: 'Item Tag',
        description: 'A tag for database items',
        type: 'tag',
        created_at: now,
        updated_at: later
      },
      entity_type: 'tag',
      entity_content: 'A tag for database items.'
    })

    // 2. Insert the tag entity into the database
    await db('entities').insert({
      entity_id: tag_entity_id,
      title: 'Item Tag',
      description: 'A tag for database items',
      type: 'tag',
      user_id: test_user_id,
      created_at: now,
      updated_at: later,
      frontmatter: {
        entity_id: tag_entity_id,
        title: 'Item Tag',
        description: 'A tag for database items',
        type: 'tag',
        created_at: now,
        updated_at: later
      },
      base_uri: tag_base_uri
    })
    await db('tags').insert({ entity_id: tag_entity_id })

    // 3. Create database table item with tag (using base_uri)
    const database_item_properties = {
      entity_id: uuid(),
      title: 'Tagged Item',
      description: 'Item with tags',
      database_table_id: test_database_table_id,
      tags: [tag_base_uri],
      created_at: now,
      updated_at: later
    }

    // Act
    const database_item_id = await write_database_table_item_to_database({
      database_item_properties,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert
    const tag_relation = await db('entity_tags')
      .where({
        entity_id: database_item_id,
        tag_entity_id
      })
      .first()

    expect(tag_relation).to.exist
  })
})
