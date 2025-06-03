import { v4 as uuid } from 'uuid'
import { expect } from 'chai'
import db from '#db'
import write_digital_item_to_database from '#libs-server/entity/database/write/write-digital-item-to-database.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_temp_test_repo
} from '#tests/utils/index.mjs'
import path from 'path'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

describe('write_digital_item_to_database', () => {
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

  it('should create a new digital item entity in the database', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const digital_item_properties = {
      entity_id: uuid(),
      title: 'Test Digital Item',
      description: 'Test digital item description',
      file_mime_type: 'application/pdf',
      file_uri: 'https://example.com/test-file.pdf',
      file_size: '1024000',
      file_cid: 'QmExample123456',
      created_at: now,
      updated_at: later
    }
    const digital_item_content =
      '# Test Digital Item\n\nDigital item body content'

    // Act
    const digital_item_id = await write_digital_item_to_database({
      digital_item_properties,
      user_id: test_user_id,
      digital_item_content,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert
    expect(digital_item_id).to.be.a('string')

    // Verify entity was created in database
    const entity = await db('entities')
      .where({ entity_id: digital_item_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(digital_item_properties.title)
    expect(entity.description).to.equal(digital_item_properties.description)
    expect(entity.type).to.equal('digital_item')
    expect(entity.user_id).to.equal(test_user_id)
    expect(entity.markdown).to.equal(digital_item_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(digital_item_properties.title)
    expect(frontmatter.description).to.equal(
      digital_item_properties.description
    )
    expect(frontmatter.file_mime_type).to.equal(
      digital_item_properties.file_mime_type
    )
    expect(frontmatter.file_uri).to.equal(digital_item_properties.file_uri)
    expect(frontmatter.file_size).to.equal(digital_item_properties.file_size)
    expect(frontmatter.file_cid).to.equal(digital_item_properties.file_cid)
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      digital_item_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      digital_item_properties.updated_at.getTime(),
      1000
    )

    // Verify digital item-specific data was created
    const digital_item_data = await db('digital_items')
      .where({ entity_id: digital_item_id })
      .first()
    expect(digital_item_data).to.exist
    expect(digital_item_data.file_mime_type).to.equal(
      digital_item_properties.file_mime_type
    )
    expect(digital_item_data.file_uri).to.equal(
      digital_item_properties.file_uri
    )
    expect(digital_item_data.file_size).to.equal(
      digital_item_properties.file_size
    )
    expect(digital_item_data.file_cid).to.equal(
      digital_item_properties.file_cid
    )
  })

  it('should update an existing digital item in the database', async () => {
    // Arrange - first create a digital item
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later
    const entity_id = uuid()

    const original_properties = {
      entity_id,
      title: 'Original Digital Item',
      description: 'Original description',
      file_mime_type: 'text/plain',
      file_uri: 'https://example.com/original.txt',
      file_size: '512',
      file_cid: 'QmOriginal123',
      created_at: now,
      updated_at: later
    }
    const original_content = 'Original digital item content'

    const digital_item_id = await write_digital_item_to_database({
      digital_item_properties: original_properties,
      user_id: test_user_id,
      digital_item_content: original_content,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Create updated digital item properties
    const even_later = new Date(later.getTime() + 1000) // 2 seconds after original created_at
    const updated_properties = {
      entity_id,
      title: 'Updated Digital Item',
      description: 'Updated description',
      file_mime_type: 'image/jpeg',
      file_uri: 'https://example.com/updated.jpg',
      file_size: '2048000',
      file_cid: 'QmUpdated456',
      text: 'Some extracted text from image',
      html: '<p>HTML representation</p>',
      created_at: now, // keep original created_at
      updated_at: even_later
    }
    const updated_content = 'Updated digital item content'

    // Act - update the digital item
    await write_digital_item_to_database({
      digital_item_properties: updated_properties,
      user_id: test_user_id,
      digital_item_content: updated_content,
      digital_item_id,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert - verify entity was updated
    const entity = await db('entities')
      .where({ entity_id: digital_item_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(updated_properties.title)
    expect(entity.description).to.equal(updated_properties.description)
    expect(entity.markdown).to.equal(updated_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(updated_properties.title)
    expect(frontmatter.description).to.equal(updated_properties.description)
    expect(frontmatter.file_mime_type).to.equal(
      updated_properties.file_mime_type
    )
    expect(frontmatter.file_uri).to.equal(updated_properties.file_uri)
    expect(frontmatter.file_size).to.equal(updated_properties.file_size)
    expect(frontmatter.file_cid).to.equal(updated_properties.file_cid)
    expect(frontmatter.text).to.equal(updated_properties.text)
    expect(frontmatter.html).to.equal(updated_properties.html)
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      updated_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      updated_properties.updated_at.getTime(),
      1000
    )

    // Verify digital item-specific data was updated
    const digital_item_data = await db('digital_items')
      .where({ entity_id: digital_item_id })
      .first()
    expect(digital_item_data).to.exist
    expect(digital_item_data.file_mime_type).to.equal(
      updated_properties.file_mime_type
    )
    expect(digital_item_data.file_uri).to.equal(updated_properties.file_uri)
    expect(digital_item_data.file_size).to.equal(updated_properties.file_size)
    expect(digital_item_data.file_cid).to.equal(updated_properties.file_cid)
    expect(digital_item_data.text).to.equal(updated_properties.text)
    expect(digital_item_data.html).to.equal(updated_properties.html)
  })

  it('should handle file info correctly', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const digital_item_properties = {
      entity_id: uuid(),
      title: 'File Info Digital Item',
      description: 'Digital item with file info',
      file_mime_type: 'application/json',
      created_at: now,
      updated_at: later
    }
    const file_info = {
      absolute_path: '/path/to/digital-item.md',
      git_sha: '98765abcdef',
      base_relative_path: 'dummy/base/path'
    }

    // Act
    const digital_item_id = await write_digital_item_to_database({
      digital_item_properties,
      user_id: test_user_id,
      absolute_path: file_info.absolute_path,
      base_relative_path: file_info.base_relative_path,
      git_sha: file_info.git_sha
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: digital_item_id })
      .first()
    expect(entity).to.exist
    expect(entity.absolute_path).to.equal(file_info.absolute_path)
    expect(entity.git_sha).to.equal(file_info.git_sha)
  })

  it('should handle partial digital item properties', async () => {
    // Arrange - minimal properties
    const digital_item_properties = {
      entity_id: uuid(),
      title: 'Minimal Digital Item'
      // Only providing title, all other fields should be handled as null or defaults
    }

    // Act
    const digital_item_id = await write_digital_item_to_database({
      digital_item_properties,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: digital_item_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(digital_item_properties.title)
    expect(entity.type).to.equal('digital_item')

    // Verify all optional fields in digital_items table are null
    const digital_item_data = await db('digital_items')
      .where({ entity_id: digital_item_id })
      .first()
    expect(digital_item_data).to.exist
    expect(digital_item_data.file_mime_type).to.be.null
    expect(digital_item_data.file_uri).to.be.null
    expect(digital_item_data.file_size).to.be.null
    expect(digital_item_data.file_cid).to.be.null
    expect(digital_item_data.text).to.be.null
    expect(digital_item_data.html).to.be.null
  })

  it('should store digital item with text and html content', async () => {
    // Arrange
    const digital_item_properties = {
      entity_id: uuid(),
      title: 'Text and HTML Digital Item',
      description: 'Digital item with text and HTML content',
      text: 'This is plain text extracted from a document',
      html: '<h1>Document Title</h1><p>This is the HTML representation of a document</p>'
    }

    // Act
    const digital_item_id = await write_digital_item_to_database({
      digital_item_properties,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert
    const digital_item_data = await db('digital_items')
      .where({ entity_id: digital_item_id })
      .first()
    expect(digital_item_data).to.exist
    expect(digital_item_data.text).to.equal(digital_item_properties.text)
    expect(digital_item_data.html).to.equal(digital_item_properties.html)
  })

  it('should store digital item with relationships', async () => {
    // Arrange - set up a temp repo and create a tag entity file
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // 1. Create a temp repo
    const test_repo = await create_temp_test_repo({
      prefix: 'digital-item-tag-test-'
    })
    const user_repo_path = test_repo.user_path
    const tag_entity_id = uuid()
    const tag_base_relative_path = 'user/tags/digital-tag.md'
    const tag_file_path = path.join(user_repo_path, 'tags', 'digital-tag.md')

    // 2. Write the tag entity file using write_entity_to_filesystem
    await write_entity_to_filesystem({
      absolute_path: tag_file_path,
      entity_properties: {
        user_id: test_user_id,
        entity_id: tag_entity_id,
        title: 'Digital Tag',
        description: 'A tag for digital items',
        type: 'tag',
        created_at: now,
        updated_at: later
      },
      entity_type: 'tag',
      entity_content: 'A tag for digital items.'
    })

    // 3. Insert the tag entity into the database
    await db('entities').insert({
      entity_id: tag_entity_id,
      title: 'Digital Tag',
      description: 'A tag for digital items',
      type: 'tag',
      user_id: test_user_id,
      created_at: now,
      updated_at: later,
      frontmatter: {
        entity_id: tag_entity_id,
        title: 'Digital Tag',
        description: 'A tag for digital items',
        type: 'tag',
        created_at: now,
        updated_at: later
      },
      base_relative_path: tag_base_relative_path
    })
    await db('tags').insert({ entity_id: tag_entity_id })

    // 4. Create digital item with tag (using base_relative_path)
    const digital_item_properties = {
      entity_id: uuid(),
      title: 'Tagged Digital Item',
      description: 'Digital item with tags',
      file_mime_type: 'application/pdf',
      tags: [tag_base_relative_path],
      created_at: now,
      updated_at: later
    }

    // Act
    const digital_item_id = await write_digital_item_to_database({
      digital_item_properties,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1',
      root_base_directory: test_repo.path
    })

    // Assert
    const tag_relation = await db('entity_tags')
      .where({
        entity_id: digital_item_id,
        tag_entity_id
      })
      .first()

    expect(tag_relation).to.exist

    // Clean up temp repo
    await test_repo.cleanup()
  })
})
