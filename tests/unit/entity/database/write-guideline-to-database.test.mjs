import { v4 as uuid } from 'uuid'
import { expect } from 'chai'
import db from '#db'
import write_guideline_to_database from '#libs-server/entity/database/write/write-guideline-to-database.mjs'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

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
      guideline_content
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
      guideline_content: original_content
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
      entity_id: guideline_entity_id
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
      git_sha: '12345abcdef'
    }

    // Act
    const guideline_entity_id = await write_guideline_to_database({
      guideline_properties,
      user_id: test_user_id,
      file_info
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
    // Arrange - first create a related tag entity
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // Create a tag to use for the guideline
    const tag_properties = {
      title: 'Guideline Tag',
      description: 'A tag for guidelines',
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

    // Create guideline with tag
    const guideline_properties = {
      entity_id: uuid(),
      title: 'Tagged Guideline',
      description: 'Guideline with tags',
      tags: [tag_entity_id],
      created_at: now,
      updated_at: later,
      guideline_status: 'Draft'
    }

    // Act
    const guideline_entity_id = await write_guideline_to_database({
      guideline_properties,
      user_id: test_user_id
    })

    // Assert tag relationship
    const tag_relation = await db('entity_tags')
      .where({
        entity_id: guideline_entity_id,
        tag_entity_id
      })
      .first()

    expect(tag_relation).to.exist
  })

  it('should handle activities relationships', async () => {
    // TODO fix this test, it should save the related activities to a guideline (base_relative_path)
    // // Arrange - first create an activity entity
    // const now = new Date()
    // const later = new Date(now.getTime() + 1000) // 1 second later
    // // Create an activity to relate to the guideline
    // const activity_properties = {
    //   title: 'Test Activity',
    //   description: 'A test activity',
    //   created_at: now,
    //   updated_at: later
    // }
    // const activity_entity_id = await db('entities')
    //   .insert({
    //     title: activity_properties.title,
    //     description: activity_properties.description,
    //     type: 'activity',
    //     user_id: test_user_id,
    //     created_at: activity_properties.created_at,
    //     updated_at: activity_properties.updated_at,
    //     frontmatter: activity_properties
    //   })
    //   .returning('entity_id')
    //   .then((rows) => rows[0].entity_id)
    // await db('activities').insert({ entity_id: activity_entity_id })
    // // Create guideline with activity relation
    // const guideline_properties = {
    //   title: 'Activity Guideline',
    //   description: 'Guideline with activity relation',
    //   created_at: now,
    //   updated_at: later,
    //   guideline_status: 'Draft',
    //   // TODO fix this, should be base_relative_path format
    //   activities: [activity_entity_id]
    // }
    // // Act
    // const guideline_entity_id = await write_guideline_to_database({
    //   guideline_properties,
    //   user_id: test_user_id
    // })
    // // Assert activity relationship
    // const activity_relation = await db('entity_relations')
    //   .where({
    //     source_entity_id: guideline_entity_id,
    //     relation_type: 'activities',
    //     target_entity_id: activity_entity_id
    //   })
    //   .first()
    // expect(activity_relation).to.exist
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
        trx
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
