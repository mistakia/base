import { expect } from 'chai'
import db from '#db'
import write_physical_location_to_database from '#libs-server/entity/database/write/write-physical-location-to-database.mjs'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

describe('write_physical_location_to_database', () => {
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

  it('should create a new physical location entity in the database', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const physical_location_properties = {
      title: 'Test Location',
      description: 'Test location description',
      latitude: 37.7749,
      longitude: -122.4194,
      mail_address: '123 Test Street',
      mail_address2: 'Suite 456',
      mail_careof: 'c/o Test Company',
      mail_street_number: '123',
      mail_street_name: 'Test',
      mail_street_type: 'Street',
      mail_unit_number: '456',
      mail_city: 'San Francisco',
      mail_state: 'CA',
      mail_zip: '94103',
      mail_country: 'USA',
      created_at: now,
      updated_at: later
    }
    const physical_location_content =
      '# Test Location\n\nLocation notes and details'

    // Act
    const physical_location_id = await write_physical_location_to_database({
      physical_location_properties,
      user_id: test_user_id,
      physical_location_content
    })

    // Assert
    expect(physical_location_id).to.be.a('string')

    // Verify entity was created in database
    const entity = await db('entities')
      .where({ entity_id: physical_location_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(physical_location_properties.title)
    expect(entity.description).to.equal(
      physical_location_properties.description
    )
    expect(entity.type).to.equal('physical_location')
    expect(entity.user_id).to.equal(test_user_id)
    expect(entity.markdown).to.equal(physical_location_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(physical_location_properties.title)
    expect(frontmatter.description).to.equal(
      physical_location_properties.description
    )
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      physical_location_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      physical_location_properties.updated_at.getTime(),
      1000
    )

    // Verify location-specific data was created
    const location_data = await db('physical_locations')
      .where({ entity_id: physical_location_id })
      .first()
    expect(location_data).to.exist
    expect(parseFloat(location_data.latitude)).to.equal(
      physical_location_properties.latitude
    )
    expect(parseFloat(location_data.longitude)).to.equal(
      physical_location_properties.longitude
    )
    expect(location_data.mail_address).to.equal(
      physical_location_properties.mail_address
    )
    expect(location_data.mail_address2).to.equal(
      physical_location_properties.mail_address2
    )
    expect(location_data.mail_careof).to.equal(
      physical_location_properties.mail_careof
    )
    expect(location_data.mail_street_number).to.equal(
      physical_location_properties.mail_street_number
    )
    expect(location_data.mail_street_name).to.equal(
      physical_location_properties.mail_street_name
    )
    expect(location_data.mail_street_type).to.equal(
      physical_location_properties.mail_street_type
    )
    expect(location_data.mail_unit_number).to.equal(
      physical_location_properties.mail_unit_number
    )
    expect(location_data.mail_city).to.equal(
      physical_location_properties.mail_city
    )
    expect(location_data.mail_state).to.equal(
      physical_location_properties.mail_state
    )
    expect(location_data.mail_zip).to.equal(
      physical_location_properties.mail_zip
    )
    expect(location_data.mail_country).to.equal(
      physical_location_properties.mail_country
    )
  })

  it('should update an existing physical location in the database', async () => {
    // Arrange - first create a location
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const original_properties = {
      title: 'Original Location',
      description: 'Original description',
      latitude: 37.7749,
      longitude: -122.4194,
      mail_address: '123 Original Street',
      mail_city: 'San Francisco',
      mail_state: 'CA',
      mail_zip: '94103',
      created_at: now,
      updated_at: later
    }
    const original_content = 'Original location content'

    const physical_location_id = await write_physical_location_to_database({
      physical_location_properties: original_properties,
      user_id: test_user_id,
      physical_location_content: original_content
    })

    // Create updated location properties
    const even_later = new Date(later.getTime() + 1000) // 2 seconds after original created_at
    const updated_properties = {
      title: 'Updated Location',
      description: 'Updated description',
      latitude: 34.0522,
      longitude: -118.2437,
      mail_address: '456 Updated Avenue',
      mail_address2: 'Floor 7',
      mail_city: 'Los Angeles',
      mail_state: 'CA',
      mail_zip: '90012',
      created_at: now, // keep original created_at
      updated_at: even_later
    }
    const updated_content = 'Updated location content'

    // Act - update the location
    await write_physical_location_to_database({
      physical_location_properties: updated_properties,
      user_id: test_user_id,
      physical_location_content: updated_content,
      physical_location_id
    })

    // Assert - verify entity was updated
    const entity = await db('entities')
      .where({ entity_id: physical_location_id })
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
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      updated_properties.updated_at.getTime(),
      1000
    )

    // Verify location-specific data was updated
    const location_data = await db('physical_locations')
      .where({ entity_id: physical_location_id })
      .first()
    expect(location_data).to.exist
    expect(parseFloat(location_data.latitude)).to.equal(
      updated_properties.latitude
    )
    expect(parseFloat(location_data.longitude)).to.equal(
      updated_properties.longitude
    )
    expect(location_data.mail_address).to.equal(updated_properties.mail_address)
    expect(location_data.mail_address2).to.equal(
      updated_properties.mail_address2
    )
    expect(location_data.mail_city).to.equal(updated_properties.mail_city)
    expect(location_data.mail_state).to.equal(updated_properties.mail_state)
    expect(location_data.mail_zip).to.equal(updated_properties.mail_zip)
  })

  it('should handle file info correctly', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const physical_location_properties = {
      title: 'File Location',
      description: 'Location with file info',
      latitude: 40.7128,
      longitude: -74.006,
      created_at: now,
      updated_at: later
    }
    const file_info = {
      absolute_path: '/path/to/location.md',
      git_sha: '12345abcdef'
    }

    // Act
    const physical_location_id = await write_physical_location_to_database({
      physical_location_properties,
      user_id: test_user_id,
      file_info
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: physical_location_id })
      .first()
    expect(entity).to.exist
    expect(entity.absolute_path).to.equal(file_info.absolute_path)
    expect(entity.git_sha).to.equal(file_info.git_sha)
  })

  it('should store physical location with tags', async () => {
    // Arrange - first create a related tag entity
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // Create a tag to use for the location
    const tag_properties = {
      title: 'Location Tag',
      description: 'A tag for locations',
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

    // Create location with tag
    const physical_location_properties = {
      title: 'Tagged Location',
      description: 'Location with tags',
      latitude: 51.5074,
      longitude: -0.1278,
      tags: [tag_entity_id],
      created_at: now,
      updated_at: later
    }

    // Act
    const physical_location_id = await write_physical_location_to_database({
      physical_location_properties,
      user_id: test_user_id
    })

    // Assert tag relationship
    const tag_relation = await db('entity_tags')
      .where({
        entity_id: physical_location_id,
        tag_entity_id
      })
      .first()

    expect(tag_relation).to.exist
  })

  it('should create a location with minimal information', async () => {
    // Arrange
    const physical_location_properties = {
      title: 'Minimal Location'
      // Only title is provided, all other fields are optional
    }

    // Act
    const physical_location_id = await write_physical_location_to_database({
      physical_location_properties,
      user_id: test_user_id
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: physical_location_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(physical_location_properties.title)
    expect(entity.type).to.equal('physical_location')

    // Verify location-specific data was created with null values
    const location_data = await db('physical_locations')
      .where({ entity_id: physical_location_id })
      .first()
    expect(location_data).to.exist
    expect(location_data.latitude).to.be.null
    expect(location_data.longitude).to.be.null
    expect(location_data.mail_address).to.be.null
    expect(location_data.mail_city).to.be.null
  })

  it('should handle transaction parameter correctly', async () => {
    // Arrange
    const physical_location_properties = {
      title: 'Transaction Location',
      description: 'Testing transaction handling',
      latitude: 48.8566,
      longitude: 2.3522
    }

    // Start a transaction
    const trx = await db.transaction()

    try {
      // Act
      const physical_location_id = await write_physical_location_to_database({
        physical_location_properties,
        user_id: test_user_id,
        trx
      })

      // Check that entity exists in transaction
      const entity_in_trx = await trx('entities')
        .where({ entity_id: physical_location_id })
        .first()
      expect(entity_in_trx).to.exist

      // But doesn't exist in main DB yet (uncommitted)
      const entity_in_db = await db('entities')
        .where({ entity_id: physical_location_id })
        .first()
      expect(entity_in_db).to.not.exist

      // Commit the transaction
      await trx.commit()

      // Now it should exist in the main DB
      const committed_entity = await db('entities')
        .where({ entity_id: physical_location_id })
        .first()
      expect(committed_entity).to.exist
      expect(committed_entity.title).to.equal(
        physical_location_properties.title
      )

      // Verify location-specific data was created
      const location_data = await db('physical_locations')
        .where({ entity_id: physical_location_id })
        .first()
      expect(location_data).to.exist
      expect(parseFloat(location_data.latitude)).to.equal(
        physical_location_properties.latitude
      )
      expect(parseFloat(location_data.longitude)).to.equal(
        physical_location_properties.longitude
      )
    } catch (error) {
      await trx.rollback()
      throw error
    }
  })
})
