import { v4 as uuid } from 'uuid'
import { expect } from 'chai'
import db from '#db'
import write_tag_to_database from '#libs-server/entity/database/write/write-tag-to-database.mjs'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

describe('write_tag_to_database', () => {
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

  it('should create a new tag entity in the database', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const tag_properties = {
      entity_id: uuid(),
      title: 'Test Tag',
      description: 'Test tag description',
      color: '#FF5733',
      created_at: now,
      updated_at: later
    }
    const tag_content = '# Test Tag\n\nTag body content'

    // Act
    const tag_entity_id = await write_tag_to_database({
      tag_properties,
      user_id: test_user_id,
      tag_content
    })

    // Assert
    expect(tag_entity_id).to.be.a('string')

    // Verify entity was created in database
    const entity = await db('entities')
      .where({ entity_id: tag_entity_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(tag_properties.title)
    expect(entity.description).to.equal(tag_properties.description)
    expect(entity.type).to.equal('tag')
    expect(entity.user_id).to.equal(test_user_id)
    expect(entity.markdown).to.equal(tag_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(tag_properties.title)
    expect(frontmatter.description).to.equal(tag_properties.description)
    expect(frontmatter.color).to.equal(tag_properties.color)
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      tag_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      tag_properties.updated_at.getTime(),
      1000
    )

    // Verify tag-specific data was created
    const tag_data = await db('tags')
      .where({ entity_id: tag_entity_id })
      .first()
    expect(tag_data).to.exist
    expect(tag_data.color).to.equal(tag_properties.color)
  })

  it('should update an existing tag in the database', async () => {
    // Arrange - first create a tag
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later
    const entity_id = uuid()

    const original_properties = {
      entity_id,
      title: 'Original Tag',
      description: 'Original description',
      color: '#AABBCC',
      created_at: now,
      updated_at: later
    }
    const original_content = 'Original tag content'

    const tag_entity_id = await write_tag_to_database({
      tag_properties: original_properties,
      user_id: test_user_id,
      tag_content: original_content
    })

    // Create updated tag properties
    const even_later = new Date(later.getTime() + 1000) // 2 seconds after original created_at
    const updated_properties = {
      entity_id,
      title: 'Updated Tag',
      description: 'Updated description',
      color: '#112233',
      created_at: now, // keep original created_at
      updated_at: even_later
    }
    const updated_content = 'Updated tag content'

    // Act - update the tag
    await write_tag_to_database({
      tag_properties: updated_properties,
      user_id: test_user_id,
      tag_content: updated_content,
      entity_id: tag_entity_id
    })

    // Assert - verify entity was updated
    const entity = await db('entities')
      .where({ entity_id: tag_entity_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(updated_properties.title)
    expect(entity.description).to.equal(updated_properties.description)
    expect(entity.markdown).to.equal(updated_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(updated_properties.title)
    expect(frontmatter.description).to.equal(updated_properties.description)
    expect(frontmatter.color).to.equal(updated_properties.color)
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      updated_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      updated_properties.updated_at.getTime(),
      1000
    )

    // Verify tag-specific data was updated
    const tag_data = await db('tags')
      .where({ entity_id: tag_entity_id })
      .first()
    expect(tag_data).to.exist
    expect(tag_data.color).to.equal(updated_properties.color)
  })

  it('should handle file info correctly', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const tag_properties = {
      entity_id: uuid(),
      title: 'File Info Tag',
      description: 'Tag with file info',
      color: '#778899',
      created_at: now,
      updated_at: later
    }
    const file_info = {
      absolute_path: '/path/to/tag.md',
      git_sha: '123456abcdef'
    }

    // Act
    const tag_entity_id = await write_tag_to_database({
      tag_properties,
      user_id: test_user_id,
      file_info
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: tag_entity_id })
      .first()
    expect(entity).to.exist
    expect(entity.absolute_path).to.equal(file_info.absolute_path)
    expect(entity.git_sha).to.equal(file_info.git_sha)
  })

  it('should handle partial tag properties', async () => {
    // Arrange - minimal properties
    const tag_properties = {
      entity_id: uuid(),
      title: 'Minimal Tag'
      // Only providing title, all other fields should be handled as null or defaults
    }

    // Act
    const tag_entity_id = await write_tag_to_database({
      tag_properties,
      user_id: test_user_id
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: tag_entity_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(tag_properties.title)
    expect(entity.type).to.equal('tag')

    // Verify optional fields in tags table are null
    const tag_data = await db('tags')
      .where({ entity_id: tag_entity_id })
      .first()
    expect(tag_data).to.exist
    expect(tag_data.color).to.be.null
  })

  it('should handle meta-tagging (tags on tags)', async () => {
    // Arrange - first create two parent tags
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // Create first parent tag
    const parent_tag1_properties = {
      entity_id: uuid(),
      title: 'Parent Tag 1',
      description: 'A parent tag',
      color: '#AADDEE',
      created_at: now,
      updated_at: later
    }

    const parent_tag1_id = await write_tag_to_database({
      tag_properties: parent_tag1_properties,
      user_id: test_user_id
    })

    // Create second parent tag
    const parent_tag2_properties = {
      entity_id: uuid(),
      title: 'Parent Tag 2',
      description: 'Another parent tag',
      color: '#EEDDAA',
      created_at: now,
      updated_at: later
    }

    const parent_tag2_id = await write_tag_to_database({
      tag_properties: parent_tag2_properties,
      user_id: test_user_id
    })

    // Create child tag with both parent tags
    const child_tag_properties = {
      entity_id: uuid(),
      title: 'Child Tag',
      description: 'Tag with parent tags',
      color: '#BBCCDD',
      tags: [parent_tag1_id, parent_tag2_id],
      created_at: now,
      updated_at: later
    }

    // Act
    const child_tag_entity_id = await write_tag_to_database({
      tag_properties: child_tag_properties,
      user_id: test_user_id
    })

    // Assert
    // Verify first parent tag relation
    const tag_relation1 = await db('entity_tags')
      .where({
        entity_id: child_tag_entity_id,
        tag_entity_id: parent_tag1_id
      })
      .first()

    expect(tag_relation1).to.exist

    // Verify second parent tag relation
    const tag_relation2 = await db('entity_tags')
      .where({
        entity_id: child_tag_entity_id,
        tag_entity_id: parent_tag2_id
      })
      .first()

    expect(tag_relation2).to.exist
  })

  it('should handle archived status correctly', async () => {
    // Arrange
    const now = new Date()
    const archive_date = new Date(now.getTime() + 86400000) // 1 day later

    const tag_properties = {
      entity_id: uuid(),
      title: 'Archived Tag',
      description: 'This tag is archived',
      color: '#999999',
      created_at: now,
      updated_at: now,
      archived_at: archive_date
    }

    // Act
    const tag_entity_id = await write_tag_to_database({
      tag_properties,
      user_id: test_user_id
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: tag_entity_id })
      .first()
    expect(entity).to.exist
    expect(entity.archived_at).to.not.be.null
    expect(new Date(entity.archived_at).getTime()).to.be.closeTo(
      archive_date.getTime(),
      1000
    )
  })
})
