import { v4 as uuid } from 'uuid'
import { expect } from 'chai'
import db from '#db'
import write_database_table_view_to_database from '#libs-server/entity/database/write/write-database-table-view-to-database.mjs'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

describe('write_database_table_view_to_database', () => {
  let test_user
  let test_user_id
  let test_database_table_id

  beforeEach(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
    test_user_id = test_user.user_id

    // Create a test database table to use in the tests
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // Insert the base entity for the database table
    const [database_table_entity] = await db('entities')
      .insert({
        title: 'Test Database Table',
        description: 'A test database table',
        type: 'database',
        user_id: test_user_id,
        created_at: now,
        updated_at: later,
        frontmatter: {
          title: 'Test Database Table',
          description: 'A test database table',
          created_at: now,
          updated_at: later
        }
      })
      .returning('entity_id')

    test_database_table_id = database_table_entity.entity_id

    // Insert the database-specific data
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
  })

  it('should create a new database table view entity in the database', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const database_view_properties = {
      entity_id: uuid(),
      title: 'Test View',
      description: 'Test view description',
      view_name: 'test_view',
      view_description: 'Detailed view description',
      table_name: 'test_table',
      database_table_entity_id: test_database_table_id,
      created_at: now,
      updated_at: later,
      table_state: {
        sortBy: 'name',
        filterFields: ['description'],
        visibleColumns: ['id', 'name', 'description']
      }
    }
    const database_view_content = '# Test View\n\nView body content'

    // Act
    const database_view_id = await write_database_table_view_to_database({
      database_view_properties,
      user_id: test_user_id,
      database_view_content
    })

    // Assert
    expect(database_view_id).to.be.a('string')

    // Verify entity was created in database
    const entity = await db('entities')
      .where({ entity_id: database_view_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(database_view_properties.title)
    expect(entity.description).to.equal(database_view_properties.description)
    expect(entity.type).to.equal('database_view')
    expect(entity.user_id).to.equal(test_user_id)
    expect(entity.markdown).to.equal(database_view_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(database_view_properties.title)
    expect(frontmatter.description).to.equal(
      database_view_properties.description
    )
    expect(frontmatter.view_name).to.equal(database_view_properties.view_name)
    expect(frontmatter.table_name).to.equal(database_view_properties.table_name)
    expect(frontmatter.database_table_entity_id).to.equal(
      database_view_properties.database_table_entity_id
    )
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      database_view_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      database_view_properties.updated_at.getTime(),
      1000
    )

    // Verify view-specific data was created
    const view_data = await db('database_table_views')
      .where({ entity_id: database_view_id })
      .first()
    expect(view_data).to.exist
    expect(view_data.view_name).to.equal(database_view_properties.view_name)
    expect(view_data.view_description).to.equal(
      database_view_properties.view_description
    )
    expect(view_data.database_table_name).to.equal(
      database_view_properties.table_name
    )
    expect(view_data.database_table_entity_id).to.equal(
      database_view_properties.database_table_entity_id
    )
    expect(view_data.table_state).to.deep.equal(
      database_view_properties.table_state
    )
  })

  it('should update an existing database table view in the database', async () => {
    // Arrange - first create a database table view
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later
    const entity_id = uuid()

    const original_properties = {
      entity_id,
      title: 'Original View',
      description: 'Original description',
      view_name: 'original_view',
      view_description: 'Original view description',
      table_name: 'test_table',
      database_table_entity_id: test_database_table_id,
      created_at: now,
      updated_at: later,
      table_state: {
        sortBy: 'id',
        visibleColumns: ['id', 'name']
      }
    }
    const original_content = 'Original view content'

    const database_view_id = await write_database_table_view_to_database({
      database_view_properties: original_properties,
      user_id: test_user_id,
      database_view_content: original_content
    })

    // Create updated view properties
    const even_later = new Date(later.getTime() + 1000) // 2 seconds after original created_at
    const updated_properties = {
      entity_id,
      title: 'Updated View',
      description: 'Updated description',
      view_name: 'updated_view',
      view_description: 'Updated view description',
      table_name: 'test_table',
      database_table_entity_id: test_database_table_id,
      created_at: now, // keep original created_at
      updated_at: even_later,
      table_state: {
        sortBy: 'name',
        filterFields: ['description'],
        visibleColumns: ['id', 'name', 'description']
      }
    }
    const updated_content = 'Updated view content'

    // Act - update the view
    await write_database_table_view_to_database({
      database_view_properties: updated_properties,
      user_id: test_user_id,
      database_view_content: updated_content,
      database_view_id
    })

    // Assert - verify entity was updated
    const entity = await db('entities')
      .where({ entity_id: database_view_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(updated_properties.title)
    expect(entity.description).to.equal(updated_properties.description)
    expect(entity.markdown).to.equal(updated_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(updated_properties.title)
    expect(frontmatter.description).to.equal(updated_properties.description)
    expect(frontmatter.view_name).to.equal(updated_properties.view_name)
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      updated_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      updated_properties.updated_at.getTime(),
      1000
    )

    // Verify view-specific data was updated
    const view_data = await db('database_table_views')
      .where({ entity_id: database_view_id })
      .first()
    expect(view_data).to.exist
    expect(view_data.view_name).to.equal(updated_properties.view_name)
    expect(view_data.view_description).to.equal(
      updated_properties.view_description
    )
    expect(view_data.table_state).to.deep.equal(updated_properties.table_state)
  })

  it('should handle file info correctly', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const database_view_properties = {
      entity_id: uuid(),
      title: 'File View',
      description: 'View with file info',
      view_name: 'file_view',
      table_name: 'test_table',
      database_table_entity_id: test_database_table_id,
      created_at: now,
      updated_at: later
    }
    const file_info = {
      absolute_path: '/path/to/view.md',
      git_sha: '12345abcdef'
    }

    // Act
    const database_view_id = await write_database_table_view_to_database({
      database_view_properties,
      user_id: test_user_id,
      file_info
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: database_view_id })
      .first()
    expect(entity).to.exist
    expect(entity.absolute_path).to.equal(file_info.absolute_path)
    expect(entity.git_sha).to.equal(file_info.git_sha)
  })

  it('should throw error when required properties are missing', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const database_view_properties = {
      entity_id: uuid(),
      title: 'Missing Properties View',
      description: 'View with missing properties',
      created_at: now,
      updated_at: later
      // Missing required view_name, table_name, and database_table_entity_id
    }

    // Act & Assert - should throw error for missing view_name
    try {
      await write_database_table_view_to_database({
        database_view_properties,
        user_id: test_user_id
      })
      expect.fail('Should have thrown an error for missing view_name')
    } catch (error) {
      expect(error.message).to.include('View name is required')
    }

    // Add view_name and test for missing table_name
    database_view_properties.view_name = 'test_view'
    try {
      await write_database_table_view_to_database({
        database_view_properties,
        user_id: test_user_id
      })
      expect.fail('Should have thrown an error for missing table_name')
    } catch (error) {
      expect(error.message).to.include('Table name is required')
    }

    // Add table_name and test for missing database_table_entity_id
    database_view_properties.table_name = 'test_table'
    try {
      await write_database_table_view_to_database({
        database_view_properties,
        user_id: test_user_id
      })
      expect.fail(
        'Should have thrown an error for missing database_table_entity_id'
      )
    } catch (error) {
      expect(error.message).to.include('Database table entity ID is required')
    }
  })

  it('should store database view with tags', async () => {
    // Arrange - first create a related tag entity
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // Create a tag to use for the view
    const tag_properties = {
      title: 'View Tag',
      description: 'A tag for database views',
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

    // Create view with tag
    const database_view_properties = {
      entity_id: uuid(),
      title: 'Tagged View',
      description: 'Database view with tags',
      view_name: 'tagged_view',
      table_name: 'test_table',
      database_table_entity_id: test_database_table_id,
      // TODO should be base_relative_path
      tags: [tag_entity_id],
      created_at: now,
      updated_at: later
    }

    // Act
    const database_view_id = await write_database_table_view_to_database({
      database_view_properties,
      user_id: test_user_id
    })

    // Assert tag relationship
    const tag_relation = await db('entity_tags')
      .where({
        entity_id: database_view_id,
        tag_entity_id
      })
      .first()

    expect(tag_relation).to.exist
  })
})
