import { v4 as uuid } from 'uuid'
import { expect } from 'chai'
import db from '#db'
import write_tag_to_database from '#libs-server/entity/database/write/write-tag-to-database.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_temp_test_repo
} from '#tests/utils/index.mjs'
import path from 'path'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

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
      tag_content,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
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
      tag_content: original_content,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
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
      entity_id: tag_entity_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
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
      absolute_path: file_info.absolute_path,
      base_uri: 'sys:dummy/base/path',
      git_sha: file_info.git_sha
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
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
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
    // Arrange - set up a temp repo and create a tag entity file
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // 1. Create a temp repo
    const test_repo = await create_temp_test_repo({ prefix: 'meta-tag-test-' })
    const user_repo_path = test_repo.user_path
    const tag_entity_id = uuid()
    const tag_base_uri = 'user:tags/meta-tag.md'
    const tag_file_path = path.join(user_repo_path, 'tags', 'meta-tag.md')

    // 2. Write the tag entity file using write_entity_to_filesystem
    await write_entity_to_filesystem({
      absolute_path: tag_file_path,
      entity_properties: {
        user_id: test_user_id,
        entity_id: tag_entity_id,
        title: 'Meta Tag',
        description: 'A tag for tags',
        type: 'tag',
        created_at: now,
        updated_at: later
      },
      entity_type: 'tag',
      entity_content: 'A tag for tags.'
    })

    // 3. Insert the tag entity into the database
    await db('entities').insert({
      entity_id: tag_entity_id,
      title: 'Meta Tag',
      description: 'A tag for tags',
      type: 'tag',
      user_id: test_user_id,
      created_at: now,
      updated_at: later,
      frontmatter: {
        entity_id: tag_entity_id,
        title: 'Meta Tag',
        description: 'A tag for tags',
        type: 'tag',
        created_at: now,
        updated_at: later
      },
      base_uri: tag_base_uri
    })
    await db('tags').insert({ entity_id: tag_entity_id })

    // 4. Create tag with tag (using base_uri)
    const tag_properties = {
      entity_id: uuid(),
      title: 'Tagged Tag',
      description: 'Tag with meta-tag',
      color: '#BBCCDD',
      tags: [tag_base_uri],
      created_at: now,
      updated_at: later
    }

    // Act
    const tagged_tag_id = await write_tag_to_database({
      tag_properties,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert
    const tag_relation = await db('entity_tags')
      .where({
        entity_id: tagged_tag_id,
        tag_entity_id
      })
      .first()

    expect(tag_relation).to.exist

    // Clean up temp repo
    await test_repo.cleanup()
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
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
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
