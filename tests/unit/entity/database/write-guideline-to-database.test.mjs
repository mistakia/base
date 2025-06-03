import { v4 as uuid } from 'uuid'
import { expect } from 'chai'
import db from '#db'
import write_guideline_to_database from '#libs-server/entity/database/write/write-guideline-to-database.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_temp_test_repo
} from '#tests/utils/index.mjs'
import path from 'path'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

describe('write_guideline_to_database', () => {
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

  it('should create a new guideline entity in the database', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later
    // Use a fixed date for effective_date to avoid timezone issues
    const effective_date = new Date('2025-01-03T00:00:00Z')

    const guideline_properties = {
      entity_id: uuid(),
      title: 'Test Guideline',
      description: 'Test guideline description',
      created_at: now,
      updated_at: later,
      guideline_status: 'Draft',
      effective_date,
      globs: ['*.js', '*.mjs'],
      always_apply: false
    }

    const guideline_content = '# Test Guideline\n\nGuideline body content'

    // Act
    const guideline_entity_id = await write_guideline_to_database({
      guideline_properties,
      user_id: test_user_id,
      guideline_content,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert
    expect(guideline_entity_id).to.be.a('string')

    // Verify entity was created in database
    const entity = await db('entities')
      .where({ entity_id: guideline_entity_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(guideline_properties.title)
    expect(entity.description).to.equal(guideline_properties.description)
    expect(entity.type).to.equal('guideline')
    expect(entity.user_id).to.equal(test_user_id)
    expect(entity.markdown).to.equal(guideline_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(guideline_properties.title)
    expect(frontmatter.description).to.equal(guideline_properties.description)
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      guideline_properties.created_at.getTime(),
      1000000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      guideline_properties.updated_at.getTime(),
      1000000
    )

    // Verify guideline-specific data was created
    const guideline_data = await db('guidelines')
      .where({ entity_id: guideline_entity_id })
      .first()
    expect(guideline_data).to.exist
    expect(guideline_data.guideline_status).to.equal(
      guideline_properties.guideline_status
    )
    expect(new Date(guideline_data.effective_date).getTime()).to.be.closeTo(
      guideline_properties.effective_date.getTime(),
      1000000
    )
    expect(guideline_data.globs).to.deep.equal(guideline_properties.globs)
    expect(guideline_data.always_apply).to.equal(
      guideline_properties.always_apply
    )
  })

  it('should update an existing guideline in the database', async () => {
    // Arrange - first create a guideline
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later
    // Use a fixed date for effective_date to avoid timezone issues
    const effective_date = new Date('2025-01-03T00:00:00Z')
    const updated_effective_date = new Date('2025-01-04T00:00:00Z')
    const entity_id = uuid()

    const original_properties = {
      entity_id,
      title: 'Original Guideline',
      description: 'Original description',
      created_at: now,
      updated_at: later,
      guideline_status: 'Draft',
      effective_date,
      globs: ['*.js'],
      always_apply: false
    }
    const original_content = 'Original guideline content'

    const guideline_entity_id = await write_guideline_to_database({
      guideline_properties: original_properties,
      user_id: test_user_id,
      guideline_content: original_content,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Create updated guideline properties
    const even_later = new Date(later.getTime() + 1000) // 2 seconds after original created_at
    const updated_properties = {
      entity_id,
      title: 'Updated Guideline',
      description: 'Updated description',
      created_at: now, // keep original created_at
      updated_at: even_later,
      guideline_status: 'Approved',
      effective_date: updated_effective_date,
      globs: ['*.js', '*.mjs', '*.cjs'],
      always_apply: true
    }
    const updated_content = 'Updated guideline content'

    // Act - update the guideline
    await write_guideline_to_database({
      guideline_properties: updated_properties,
      user_id: test_user_id,
      guideline_content: updated_content,
      entity_id: guideline_entity_id,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert - verify entity was updated
    const entity = await db('entities')
      .where({ entity_id: guideline_entity_id })
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
      1000000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      updated_properties.updated_at.getTime(),
      1000000
    )

    // Verify guideline-specific data was updated
    const guideline_data = await db('guidelines')
      .where({ entity_id: guideline_entity_id })
      .first()
    expect(guideline_data).to.exist
    expect(guideline_data.guideline_status).to.equal(
      updated_properties.guideline_status
    )
    expect(new Date(guideline_data.effective_date).getTime()).to.be.closeTo(
      updated_properties.effective_date.getTime(),
      1000000
    )
    expect(guideline_data.globs).to.deep.equal(updated_properties.globs)
    expect(guideline_data.always_apply).to.equal(
      updated_properties.always_apply
    )
  })

  it('should handle file info correctly', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const guideline_properties = {
      entity_id: uuid(),
      title: 'File Guideline',
      description: 'Guideline with file info',
      created_at: now,
      updated_at: later,
      guideline_status: 'Draft'
    }
    const file_info = {
      absolute_path: '/path/to/guideline.md',
      git_sha: '12345abcdef',
      base_relative_path: 'dummy/base/path'
    }

    // Act
    const guideline_entity_id = await write_guideline_to_database({
      guideline_properties,
      user_id: test_user_id,
      absolute_path: file_info.absolute_path,
      base_relative_path: file_info.base_relative_path,
      git_sha: file_info.git_sha
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: guideline_entity_id })
      .first()
    expect(entity).to.exist
    expect(entity.absolute_path).to.equal(file_info.absolute_path)
    expect(entity.git_sha).to.equal(file_info.git_sha)
  })

  it('should store guideline with tags', async () => {
    // Arrange - set up a temp repo and create a tag entity file
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // 1. Create a temp repo
    const test_repo = await create_temp_test_repo({
      prefix: 'guideline-tag-test-'
    })
    const user_repo_path = test_repo.user_path
    const tag_entity_id = uuid()
    const tag_base_relative_path = 'user/tags/guideline-tag.md'
    const tag_file_path = path.join(user_repo_path, 'tags', 'guideline-tag.md')

    // 2. Write the tag entity file using write_entity_to_filesystem
    await write_entity_to_filesystem({
      absolute_path: tag_file_path,
      entity_properties: {
        user_id: test_user_id,
        entity_id: tag_entity_id,
        title: 'Guideline Tag',
        description: 'A tag for guidelines',
        type: 'tag',
        created_at: now,
        updated_at: later
      },
      entity_type: 'tag',
      entity_content: 'A tag for guidelines.'
    })

    // 3. Insert the tag entity into the database
    await db('entities').insert({
      entity_id: tag_entity_id,
      title: 'Guideline Tag',
      description: 'A tag for guidelines',
      type: 'tag',
      user_id: test_user_id,
      created_at: now,
      updated_at: later,
      frontmatter: {
        entity_id: tag_entity_id,
        title: 'Guideline Tag',
        description: 'A tag for guidelines',
        type: 'tag',
        created_at: now,
        updated_at: later
      },
      base_relative_path: tag_base_relative_path
    })
    await db('tags').insert({ entity_id: tag_entity_id })

    // 4. Create guideline with tag (using base_relative_path)
    const guideline_properties = {
      entity_id: uuid(),
      title: 'Tagged Guideline',
      description: 'Guideline with tags',
      tags: [tag_base_relative_path],
      created_at: now,
      updated_at: later
    }

    // Act
    const guideline_entity_id = await write_guideline_to_database({
      guideline_properties,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1',
      root_base_directory: test_repo.path
    })

    // Assert
    const tag_relation = await db('entity_tags')
      .where({
        entity_id: guideline_entity_id,
        tag_entity_id
      })
      .first()

    expect(tag_relation).to.exist

    // Clean up temp repo
    await test_repo.cleanup()
  })

  it('should handle transaction parameter correctly', async () => {
    // Arrange
    const guideline_properties = {
      entity_id: uuid(),
      title: 'Transaction Guideline',
      description: 'Testing transaction handling',
      guideline_status: 'Draft'
    }

    // Start a transaction
    const trx = await db.transaction()

    try {
      // Act
      const guideline_entity_id = await write_guideline_to_database({
        guideline_properties,
        user_id: test_user_id,
        trx,
        absolute_path: '/dummy/path.md',
        base_relative_path: 'dummy/base/path',
        git_sha: 'dummysha1'
      })

      // Check that entity exists in transaction
      const entity_in_trx = await trx('entities')
        .where({ entity_id: guideline_entity_id })
        .first()
      expect(entity_in_trx).to.exist

      // But doesn't exist in main DB yet (uncommitted)
      const entity_in_db = await db('entities')
        .where({ entity_id: guideline_entity_id })
        .first()
      expect(entity_in_db).to.not.exist

      // Commit the transaction
      await trx.commit()

      // Now it should exist in the main DB
      const committed_entity = await db('entities')
        .where({ entity_id: guideline_entity_id })
        .first()
      expect(committed_entity).to.exist
      expect(committed_entity.title).to.equal(guideline_properties.title)
    } catch (error) {
      await trx.rollback()
      throw error
    }
  })
})
