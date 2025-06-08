import { v4 as uuid } from 'uuid'
import { expect } from 'chai'
import db from '#db'
import dayjs from 'dayjs'
import { physical_item_constants } from '#libs-shared'
import write_physical_item_to_database from '#libs-server/entity/database/write/write-physical-item-to-database.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_temp_test_repo
} from '#tests/utils/index.mjs'
import path from 'path'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

describe('write_physical_item_to_database', () => {
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

  it('should create a new physical item entity in the database', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later
    const acquisition_date = new Date(now.getTime() - 86400000) // 1 day before

    const physical_item_properties = {
      entity_id: uuid(),
      title: 'Test Physical Item',
      description: 'Test physical item description',
      manufacturer: 'Test Manufacturer',
      model_number: 'TM-2023',
      serial_number: 'SN12345678',
      storage_location: 'Shelf A3',
      acquisition_date,
      height_inches: 10.5,
      width_inches: 8.25,
      depth_inches: 4.0,
      weight_ounces: 32.5,
      current_quantity: 2,
      target_quantity: 3,
      importance: physical_item_constants.IMPORTANCE_TYPES.CORE,
      frequency_of_use: physical_item_constants.FREQUENCY_TYPES.WEEKLY,
      created_at: now,
      updated_at: later
    }
    const physical_item_content =
      '# Test Physical Item\n\nPhysical item body content'

    // Act
    const physical_item_id = await write_physical_item_to_database({
      physical_item_properties,
      user_id: test_user_id,
      physical_item_content,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert
    expect(physical_item_id).to.be.a('string')

    // Verify entity was created in database
    const entity = await db('entities')
      .where({ entity_id: physical_item_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(physical_item_properties.title)
    expect(entity.description).to.equal(physical_item_properties.description)
    expect(entity.type).to.equal('physical_item')
    expect(entity.user_id).to.equal(test_user_id)
    expect(entity.markdown).to.equal(physical_item_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(physical_item_properties.title)
    expect(frontmatter.description).to.equal(
      physical_item_properties.description
    )
    expect(frontmatter.manufacturer).to.equal(
      physical_item_properties.manufacturer
    )
    expect(frontmatter.model_number).to.equal(
      physical_item_properties.model_number
    )
    expect(frontmatter.serial_number).to.equal(
      physical_item_properties.serial_number
    )
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      physical_item_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      physical_item_properties.updated_at.getTime(),
      1000
    )

    // Compare acquisition_date using dayjs with YYYY-MM-DD format
    const db_date_str = dayjs(frontmatter.acquisition_date).format('YYYY-MM-DD')
    const expected_date_str = dayjs(
      physical_item_properties.acquisition_date
    ).format('YYYY-MM-DD')
    expect(db_date_str).to.equal(expected_date_str)

    // Verify physical item-specific data was created
    const physical_item_data = await db('physical_items')
      .where({ entity_id: physical_item_id })
      .first()
    expect(physical_item_data).to.exist
    expect(physical_item_data.manufacturer).to.equal(
      physical_item_properties.manufacturer
    )
    expect(physical_item_data.model_number).to.equal(
      physical_item_properties.model_number
    )
    expect(physical_item_data.serial_number).to.equal(
      physical_item_properties.serial_number
    )
    expect(physical_item_data.storage_location).to.equal(
      physical_item_properties.storage_location
    )

    // Compare acquisition_date in physical_items table using dayjs with YYYY-MM-DD format
    if (physical_item_data.acquisition_date) {
      const db_item_date_str = dayjs(
        physical_item_data.acquisition_date
      ).format('YYYY-MM-DD')
      expect(db_item_date_str).to.equal(expected_date_str)
    }

    expect(Number(physical_item_data.height_inches)).to.equal(
      physical_item_properties.height_inches
    )
    expect(Number(physical_item_data.width_inches)).to.equal(
      physical_item_properties.width_inches
    )
    expect(Number(physical_item_data.depth_inches)).to.equal(
      physical_item_properties.depth_inches
    )
    expect(Number(physical_item_data.weight_ounces)).to.equal(
      physical_item_properties.weight_ounces
    )
    expect(physical_item_data.current_quantity).to.equal(
      physical_item_properties.current_quantity
    )
    expect(physical_item_data.target_quantity).to.equal(
      physical_item_properties.target_quantity
    )
    expect(physical_item_data.importance).to.equal(
      physical_item_properties.importance
    )
    expect(physical_item_data.frequency_of_use).to.equal(
      physical_item_properties.frequency_of_use
    )
  })

  it('should update an existing physical item in the database', async () => {
    // Arrange - first create a physical item
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later
    const entity_id = uuid()

    const original_properties = {
      entity_id,
      title: 'Original Physical Item',
      description: 'Original description',
      manufacturer: 'Original Manufacturer',
      model_number: 'OM-1000',
      serial_number: 'ORIG12345',
      storage_location: 'Drawer B2',
      height_inches: 5.0,
      width_inches: 5.0,
      depth_inches: 2.0,
      weight_ounces: 16.0,
      created_at: now,
      updated_at: later
    }
    const original_content = 'Original physical item content'

    const physical_item_id = await write_physical_item_to_database({
      physical_item_properties: original_properties,
      user_id: test_user_id,
      physical_item_content: original_content,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Create updated physical item properties
    const even_later = new Date(later.getTime() + 1000) // 2 seconds after original created_at
    const new_acquisition_date = new Date(now.getTime() - 30 * 86400000) // 30 days before now
    const updated_properties = {
      entity_id,
      title: 'Updated Physical Item',
      description: 'Updated description',
      manufacturer: 'Updated Manufacturer',
      model_number: 'UM-2000',
      serial_number: 'UPDT67890',
      storage_location: 'Cabinet C3',
      acquisition_date: new_acquisition_date,
      height_inches: 6.5,
      width_inches: 6.5,
      depth_inches: 3.0,
      weight_ounces: 24.0,
      current_quantity: 1,
      target_quantity: 2,
      importance: physical_item_constants.IMPORTANCE_TYPES.STANDARD,
      frequency_of_use: physical_item_constants.FREQUENCY_TYPES.INFREQUENT,
      created_at: now, // keep original created_at
      updated_at: even_later
    }
    const updated_content = 'Updated physical item content'

    // Act - update the physical item
    await write_physical_item_to_database({
      physical_item_properties: updated_properties,
      user_id: test_user_id,
      physical_item_content: updated_content,
      physical_item_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert - verify entity was updated
    const entity = await db('entities')
      .where({ entity_id: physical_item_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(updated_properties.title)
    expect(entity.description).to.equal(updated_properties.description)
    expect(entity.markdown).to.equal(updated_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(updated_properties.title)
    expect(frontmatter.description).to.equal(updated_properties.description)
    expect(frontmatter.manufacturer).to.equal(updated_properties.manufacturer)
    expect(frontmatter.model_number).to.equal(updated_properties.model_number)
    expect(frontmatter.serial_number).to.equal(updated_properties.serial_number)
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      updated_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      updated_properties.updated_at.getTime(),
      1000
    )

    // Compare acquisition_date using dayjs with YYYY-MM-DD format
    const db_date_str = dayjs(frontmatter.acquisition_date).format('YYYY-MM-DD')
    const expected_date_str = dayjs(updated_properties.acquisition_date).format(
      'YYYY-MM-DD'
    )
    expect(db_date_str).to.equal(expected_date_str)

    // Verify physical item-specific data was updated
    const physical_item_data = await db('physical_items')
      .where({ entity_id: physical_item_id })
      .first()
    expect(physical_item_data).to.exist
    expect(physical_item_data.manufacturer).to.equal(
      updated_properties.manufacturer
    )
    expect(physical_item_data.model_number).to.equal(
      updated_properties.model_number
    )
    expect(physical_item_data.serial_number).to.equal(
      updated_properties.serial_number
    )
    expect(physical_item_data.storage_location).to.equal(
      updated_properties.storage_location
    )

    // Compare acquisition_date in physical_items table using dayjs with YYYY-MM-DD format
    if (physical_item_data.acquisition_date) {
      const db_item_date_str = dayjs(
        physical_item_data.acquisition_date
      ).format('YYYY-MM-DD')
      expect(db_item_date_str).to.equal(expected_date_str)
    }

    expect(Number(physical_item_data.height_inches)).to.equal(
      updated_properties.height_inches
    )
    expect(Number(physical_item_data.width_inches)).to.equal(
      updated_properties.width_inches
    )
    expect(Number(physical_item_data.depth_inches)).to.equal(
      updated_properties.depth_inches
    )
    expect(Number(physical_item_data.weight_ounces)).to.equal(
      updated_properties.weight_ounces
    )
    expect(physical_item_data.current_quantity).to.equal(
      updated_properties.current_quantity
    )
    expect(physical_item_data.target_quantity).to.equal(
      updated_properties.target_quantity
    )
    expect(physical_item_data.importance).to.equal(
      updated_properties.importance
    )
    expect(physical_item_data.frequency_of_use).to.equal(
      updated_properties.frequency_of_use
    )
  })

  it('should handle file info correctly', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const physical_item_properties = {
      entity_id: uuid(),
      title: 'File Info Physical Item',
      description: 'Physical item with file info',
      manufacturer: 'Test Corp',
      model_number: 'TC-123',
      created_at: now,
      updated_at: later
    }
    const file_info = {
      absolute_path: '/path/to/physical-item.md',
      git_sha: 'abcdef123456',
      base_uri: 'sys:dummy/base/path'
    }

    // Act
    const physical_item_id = await write_physical_item_to_database({
      physical_item_properties,
      user_id: test_user_id,
      absolute_path: file_info.absolute_path,
      base_uri: file_info.base_uri,
      git_sha: file_info.git_sha
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: physical_item_id })
      .first()
    expect(entity).to.exist
    expect(entity.absolute_path).to.equal(file_info.absolute_path)
    expect(entity.git_sha).to.equal(file_info.git_sha)
  })

  it('should handle boolean and array fields correctly', async () => {
    // Arrange
    const physical_item_properties = {
      entity_id: uuid(),
      title: 'Boolean and Array Fields Item',
      description: 'Testing complex field types',
      consumable: true,
      perishable: false,
      water_connection: true,
      drain_connection: true,
      ethernet_connected: false,
      home_areas: ['Kitchen', 'Workshop', 'Office'],
      activities: ['Cooking', 'Building', 'Writing'],
      kit_items: ['Hammer', 'Screwdriver', 'Pliers']
    }

    // Act
    const physical_item_id = await write_physical_item_to_database({
      physical_item_properties,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert
    const physical_item_data = await db('physical_items')
      .where({ entity_id: physical_item_id })
      .first()
    expect(physical_item_data).to.exist
    expect(physical_item_data.consumable).to.equal(
      physical_item_properties.consumable
    )
    expect(physical_item_data.perishable).to.equal(
      physical_item_properties.perishable
    )
    expect(physical_item_data.water_connection).to.equal(
      physical_item_properties.water_connection
    )
    expect(physical_item_data.drain_connection).to.equal(
      physical_item_properties.drain_connection
    )
    expect(physical_item_data.ethernet_connected).to.equal(
      physical_item_properties.ethernet_connected
    )

    // Check array fields
    // Note: Database might store arrays as JSON strings or as array objects depending on implementation
    if (Array.isArray(physical_item_data.home_areas)) {
      expect(physical_item_data.home_areas).to.deep.equal(
        physical_item_properties.home_areas
      )
      expect(physical_item_data.activities).to.deep.equal(
        physical_item_properties.activities
      )
      expect(physical_item_data.kit_items).to.deep.equal(
        physical_item_properties.kit_items
      )
    } else if (physical_item_data.home_areas) {
      // If stored as JSON strings, parse them for comparison
      expect(JSON.parse(physical_item_data.home_areas)).to.deep.equal(
        physical_item_properties.home_areas
      )
      expect(JSON.parse(physical_item_data.activities)).to.deep.equal(
        physical_item_properties.activities
      )
      expect(JSON.parse(physical_item_data.kit_items)).to.deep.equal(
        physical_item_properties.kit_items
      )
    }
  })

  it('should test all importance and frequency enum values', async () => {
    // Test each importance type
    for (const importance of Object.values(
      physical_item_constants.IMPORTANCE_TYPES
    )) {
      const physical_item_properties = {
        entity_id: uuid(),
        title: `Item with ${importance} importance`,
        importance
      }

      const physical_item_id = await write_physical_item_to_database({
        physical_item_properties,
        user_id: test_user_id,
        absolute_path: '/dummy/path.md',
        base_uri: 'sys:dummy/base/path',
        git_sha: 'dummysha1'
      })

      const physical_item_data = await db('physical_items')
        .where({ entity_id: physical_item_id })
        .first()

      expect(physical_item_data.importance).to.equal(importance)
    }

    // Test each frequency type
    for (const frequency of Object.values(
      physical_item_constants.FREQUENCY_TYPES
    )) {
      const physical_item_properties = {
        entity_id: uuid(),
        title: `Item with ${frequency} usage frequency`,
        frequency_of_use: frequency
      }

      const physical_item_id = await write_physical_item_to_database({
        physical_item_properties,
        user_id: test_user_id,
        absolute_path: '/dummy/path.md',
        base_uri: 'sys:dummy/base/path',
        git_sha: 'dummysha1'
      })

      const physical_item_data = await db('physical_items')
        .where({ entity_id: physical_item_id })
        .first()

      expect(physical_item_data.frequency_of_use).to.equal(frequency)
    }
  })

  it('should handle partial physical item properties', async () => {
    // Arrange - minimal properties
    const physical_item_properties = {
      entity_id: uuid(),
      title: 'Minimal Physical Item'
      // Only providing title, all other fields should be handled as null or defaults
    }

    // Act
    const physical_item_id = await write_physical_item_to_database({
      physical_item_properties,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: physical_item_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(physical_item_properties.title)
    expect(entity.type).to.equal('physical_item')

    // Verify optional fields in physical_items table are null
    const physical_item_data = await db('physical_items')
      .where({ entity_id: physical_item_id })
      .first()
    expect(physical_item_data).to.exist
    expect(physical_item_data.manufacturer).to.be.null
    expect(physical_item_data.model_number).to.be.null
    expect(physical_item_data.serial_number).to.be.null
    expect(physical_item_data.storage_location).to.be.null
    expect(physical_item_data.acquisition_date).to.be.null
    expect(physical_item_data.height_inches).to.be.null
    expect(physical_item_data.width_inches).to.be.null
    expect(physical_item_data.depth_inches).to.be.null
    expect(physical_item_data.weight_ounces).to.be.null
  })

  it('should store physical item with relationships', async () => {
    // Arrange - set up a temp repo and create a related entity file
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // 1. Create a temp repo
    const test_repo = await create_temp_test_repo({
      prefix: 'physical-item-rel-test-'
    })
    const user_repo_path = test_repo.user_path
    const related_entity_id = uuid()
    const related_base_uri = 'user:relations/related-entity.md'
    const related_file_path = path.join(
      user_repo_path,
      'relations',
      'related-entity.md'
    )

    // 2. Write the related entity file using write_entity_to_filesystem
    await write_entity_to_filesystem({
      absolute_path: related_file_path,
      entity_properties: {
        user_id: test_user_id,
        entity_id: related_entity_id,
        title: 'Related Entity',
        description: 'A related entity for physical item',
        type: 'organization',
        created_at: now,
        updated_at: later
      },
      entity_type: 'organization',
      entity_content: 'A related entity for physical item.'
    })

    // 3. Insert the related entity into the database
    await db('entities').insert({
      entity_id: related_entity_id,
      title: 'Related Entity',
      description: 'A related entity for physical item',
      type: 'organization',
      user_id: test_user_id,
      created_at: now,
      updated_at: later,
      frontmatter: {
        entity_id: related_entity_id,
        title: 'Related Entity',
        description: 'A related entity for physical item',
        type: 'organization',
        created_at: now,
        updated_at: later
      },
      base_uri: related_base_uri
    })

    // 4. Create physical item with relationship (using base_uri)
    const physical_item_properties = {
      entity_id: uuid(),
      title: 'Physical Item with Relation',
      description: 'Physical item with relationships',
      created_at: now,
      updated_at: later
    }
    const formatted_entity_metadata = {
      relations: [{ relation_type: 'member_of', base_uri: related_base_uri }]
    }

    // Act
    const physical_item_id = await write_physical_item_to_database({
      physical_item_properties,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1',
      formatted_entity_metadata
    })

    // Assert
    const relation = await db('entity_relations')
      .where({
        source_entity_id: physical_item_id,
        target_entity_id: related_entity_id
      })
      .first()

    expect(relation).to.exist

    // Clean up temp repo
    await test_repo.cleanup()
  })

  it('should handle archived status correctly', async () => {
    // Arrange
    const now = new Date()
    const archive_date = new Date(now.getTime() + 86400000) // 1 day later

    const physical_item_properties = {
      entity_id: uuid(),
      title: 'Archived Physical Item',
      description: 'This physical item is archived',
      manufacturer: 'Archive Inc',
      created_at: now,
      updated_at: now,
      archived_at: archive_date
    }

    // Act
    const physical_item_id = await write_physical_item_to_database({
      physical_item_properties,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: physical_item_id })
      .first()
    expect(entity).to.exist
    expect(entity.archived_at).to.not.be.null
    expect(new Date(entity.archived_at).getTime()).to.be.closeTo(
      archive_date.getTime(),
      1000
    )
  })
})
