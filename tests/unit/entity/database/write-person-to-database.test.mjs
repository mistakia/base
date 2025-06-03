import { expect } from 'chai'
import { v4 as uuid } from 'uuid'
import db from '#db'
import write_person_to_database from '#libs-server/entity/database/write/write-person-to-database.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_temp_test_repo
} from '#tests/utils/index.mjs'
import path from 'path'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

describe('write_person_to_database', () => {
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

  it('should create a new person entity in the database', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const person_properties = {
      entity_id: uuid(),
      title: 'John Doe',
      first_name: 'John',
      last_name: 'Doe',
      description: 'Test person description',
      email: 'john.doe@example.com',
      mobile_phone: '123-456-7890',
      website_url: 'https://johndoe.example.com',
      created_at: now,
      updated_at: later
    }
    const person_content = '# John Doe\n\nPerson biography content'

    // Act
    const person_id = await write_person_to_database({
      person_properties,
      user_id: test_user_id,
      person_content,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert
    expect(person_id).to.be.a('string')

    // Verify entity was created in database
    const entity = await db('entities').where({ entity_id: person_id }).first()
    expect(entity).to.exist
    expect(entity.title).to.equal(person_properties.title)
    expect(entity.description).to.equal(person_properties.description)
    expect(entity.type).to.equal('person')
    expect(entity.user_id).to.equal(test_user_id)
    expect(entity.markdown).to.equal(person_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(person_properties.title)
    expect(frontmatter.description).to.equal(person_properties.description)
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      person_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      person_properties.updated_at.getTime(),
      1000
    )

    // Verify person-specific data was created
    const person_data = await db('persons')
      .where({ entity_id: person_id })
      .first()
    expect(person_data).to.exist
    expect(person_data.first_name).to.equal(person_properties.first_name)
    expect(person_data.last_name).to.equal(person_properties.last_name)
    expect(person_data.email).to.equal(person_properties.email)
    expect(person_data.mobile_phone).to.equal(person_properties.mobile_phone)
    expect(person_data.website_url).to.equal(person_properties.website_url)
  })

  it('should update an existing person in the database', async () => {
    // Arrange - first create a person
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later
    const entity_id = uuid()

    const original_properties = {
      entity_id,
      title: 'Original Person',
      first_name: 'Original',
      last_name: 'Person',
      description: 'Original description',
      email: 'original.person@example.com',
      created_at: now,
      updated_at: later
    }
    const original_content = 'Original person content'

    const person_id = await write_person_to_database({
      person_properties: original_properties,
      user_id: test_user_id,
      person_content: original_content,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Create updated person properties
    const even_later = new Date(later.getTime() + 1000) // 2 seconds after original created_at
    const updated_properties = {
      entity_id,
      title: 'Updated Person',
      first_name: 'Updated',
      last_name: 'Person',
      description: 'Updated description',
      email: 'updated.person@example.com',
      mobile_phone: '987-654-3210',
      website_url: 'https://updated.example.com',
      created_at: now, // keep original created_at
      updated_at: even_later
    }
    const updated_content = 'Updated person content'

    // Act - update the person
    await write_person_to_database({
      person_properties: updated_properties,
      user_id: test_user_id,
      person_content: updated_content,
      person_id,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert - verify entity was updated
    const entity = await db('entities').where({ entity_id: person_id }).first()
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

    // Verify person-specific data was updated
    const person_data = await db('persons')
      .where({ entity_id: person_id })
      .first()
    expect(person_data).to.exist
    expect(person_data.first_name).to.equal(updated_properties.first_name)
    expect(person_data.last_name).to.equal(updated_properties.last_name)
    expect(person_data.email).to.equal(updated_properties.email)
    expect(person_data.mobile_phone).to.equal(updated_properties.mobile_phone)
    expect(person_data.website_url).to.equal(updated_properties.website_url)
  })

  it('should handle file info correctly', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const person_properties = {
      entity_id: uuid(),
      title: 'File Person',
      first_name: 'File',
      last_name: 'Person',
      description: 'Person with file info',
      created_at: now,
      updated_at: later
    }
    const file_info = {
      absolute_path: '/path/to/person.md',
      git_sha: '12345abcdef'
    }

    // Act
    const person_id = await write_person_to_database({
      person_properties,
      user_id: test_user_id,
      absolute_path: file_info.absolute_path,
      base_relative_path: 'dummy/base/path',
      git_sha: file_info.git_sha
    })

    // Assert
    const entity = await db('entities').where({ entity_id: person_id }).first()
    expect(entity).to.exist
    expect(entity.absolute_path).to.equal(file_info.absolute_path)
    expect(entity.git_sha).to.equal(file_info.git_sha)
  })

  it('should store person with tags', async () => {
    // Arrange - set up a temp repo and create a tag entity file
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // 1. Create a temp repo
    const test_repo = await create_temp_test_repo({
      prefix: 'person-tag-test-'
    })
    const user_repo_path = test_repo.user_path
    const tag_entity_id = uuid()
    const tag_base_relative_path = 'user/tags/person-tag.md'
    const tag_file_path = path.join(user_repo_path, 'tags', 'person-tag.md')

    // 2. Write the tag entity file using write_entity_to_filesystem
    await write_entity_to_filesystem({
      absolute_path: tag_file_path,
      entity_properties: {
        user_id: test_user_id,
        entity_id: tag_entity_id,
        title: 'Person Tag',
        description: 'A tag for persons',
        type: 'tag',
        created_at: now,
        updated_at: later
      },
      entity_type: 'tag',
      entity_content: 'A tag for persons.'
    })

    // 3. Insert the tag entity into the database
    await db('entities').insert({
      entity_id: tag_entity_id,
      title: 'Person Tag',
      description: 'A tag for persons',
      type: 'tag',
      user_id: test_user_id,
      created_at: now,
      updated_at: later,
      frontmatter: {
        entity_id: tag_entity_id,
        title: 'Person Tag',
        description: 'A tag for persons',
        type: 'tag',
        created_at: now,
        updated_at: later
      },
      base_relative_path: tag_base_relative_path
    })
    await db('tags').insert({ entity_id: tag_entity_id })

    // 4. Create person with tag (using base_relative_path)
    const person_properties = {
      entity_id: uuid(),
      title: 'Tagged Person',
      description: 'Person with tags',
      tags: [tag_base_relative_path],
      created_at: now,
      updated_at: later,
      first_name: 'Tagged',
      last_name: 'Person'
    }

    // Act
    const person_id = await write_person_to_database({
      person_properties,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1',
      root_base_directory: test_repo.path
    })

    // Assert
    const tag_relation = await db('entity_tags')
      .where({
        entity_id: person_id,
        tag_entity_id
      })
      .first()

    expect(tag_relation).to.exist

    // Clean up temp repo
    await test_repo.cleanup()
  })

  it('should throw error when required properties are missing', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // Missing first_name
    const missing_first_name = {
      entity_id: uuid(),
      title: 'Missing First Name',
      last_name: 'Person',
      created_at: now,
      updated_at: later
    }

    // Act & Assert for missing first_name
    try {
      await write_person_to_database({
        person_properties: missing_first_name,
        user_id: test_user_id,
        absolute_path: '/dummy/path.md',
        base_relative_path: 'dummy/base/path',
        git_sha: 'dummysha1'
      })
      expect.fail('Should have thrown an error for missing first_name')
    } catch (error) {
      expect(error.message).to.include('First name is required')
    }

    // Missing last_name
    const missing_last_name = {
      entity_id: uuid(),
      title: 'Missing Last Name',
      first_name: 'Missing',
      created_at: now,
      updated_at: later
    }

    // Act & Assert for missing last_name
    try {
      await write_person_to_database({
        person_properties: missing_last_name,
        user_id: test_user_id,
        absolute_path: '/dummy/path.md',
        base_relative_path: 'dummy/base/path',
        git_sha: 'dummysha1'
      })
      expect.fail('Should have thrown an error for missing last_name')
    } catch (error) {
      expect(error.message).to.include('Last name is required')
    }
  })

  it('should handle transaction parameter correctly', async () => {
    // Arrange
    const person_properties = {
      entity_id: uuid(),
      title: 'Transaction Person',
      first_name: 'Transaction',
      last_name: 'Person',
      description: 'Testing transaction handling'
    }

    // Start a transaction
    const trx = await db.transaction()

    try {
      // Act
      const person_id = await write_person_to_database({
        person_properties,
        user_id: test_user_id,
        trx,
        absolute_path: '/dummy/path.md',
        base_relative_path: 'dummy/base/path',
        git_sha: 'dummysha1'
      })

      // Check that entity exists in transaction
      const entity_in_trx = await trx('entities')
        .where({ entity_id: person_id })
        .first()
      expect(entity_in_trx).to.exist

      // But doesn't exist in main DB yet (uncommitted)
      const entity_in_db = await db('entities')
        .where({ entity_id: person_id })
        .first()
      expect(entity_in_db).to.not.exist

      // Commit the transaction
      await trx.commit()

      // Now it should exist in the main DB
      const committed_entity = await db('entities')
        .where({ entity_id: person_id })
        .first()
      expect(committed_entity).to.exist
      expect(committed_entity.title).to.equal(person_properties.title)

      // Verify person-specific data was created
      const person_data = await db('persons')
        .where({ entity_id: person_id })
        .first()
      expect(person_data).to.exist
      expect(person_data.first_name).to.equal(person_properties.first_name)
      expect(person_data.last_name).to.equal(person_properties.last_name)
    } catch (error) {
      await trx.rollback()
      throw error
    }
  })
})
