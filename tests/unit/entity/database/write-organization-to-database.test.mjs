import { expect } from 'chai'
import db from '#db'
import write_organization_to_database from '#libs-server/entity/database/write/write-organization-to-database.mjs'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

describe('write_organization_to_database', () => {
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

  it('should create a new organization entity in the database', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const organization_properties = {
      title: 'Test Organization',
      description: 'Test organization description',
      website_url: 'https://example.org',
      created_at: now,
      updated_at: later
    }
    const organization_content =
      '# Test Organization\n\nOrganization body content'

    // Act
    const organization_id = await write_organization_to_database({
      organization_properties,
      user_id: test_user_id,
      organization_content
    })

    // Assert
    expect(organization_id).to.be.a('string')

    // Verify entity was created in database
    const entity = await db('entities')
      .where({ entity_id: organization_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(organization_properties.title)
    expect(entity.description).to.equal(organization_properties.description)
    expect(entity.type).to.equal('organization')
    expect(entity.user_id).to.equal(test_user_id)
    expect(entity.markdown).to.equal(organization_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(organization_properties.title)
    expect(frontmatter.description).to.equal(
      organization_properties.description
    )
    expect(frontmatter.website_url).to.equal(
      organization_properties.website_url
    )
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      organization_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      organization_properties.updated_at.getTime(),
      1000
    )

    // Verify organization-specific data was created
    const organization_data = await db('organizations')
      .where({ entity_id: organization_id })
      .first()
    expect(organization_data).to.exist
    expect(organization_data.website_url).to.equal(
      organization_properties.website_url
    )
  })

  it('should update an existing organization in the database', async () => {
    // Arrange - first create an organization
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const original_properties = {
      title: 'Original Organization',
      description: 'Original description',
      website_url: 'https://old-example.org',
      created_at: now,
      updated_at: later
    }
    const original_content = 'Original organization content'

    const organization_id = await write_organization_to_database({
      organization_properties: original_properties,
      user_id: test_user_id,
      organization_content: original_content
    })

    // Create updated organization properties
    const even_later = new Date(later.getTime() + 1000) // 2 seconds after original created_at
    const updated_properties = {
      title: 'Updated Organization',
      description: 'Updated description',
      website_url: 'https://new-example.org',
      created_at: now, // keep original created_at
      updated_at: even_later
    }
    const updated_content = 'Updated organization content'

    // Act - update the organization
    await write_organization_to_database({
      organization_properties: updated_properties,
      user_id: test_user_id,
      organization_content: updated_content,
      organization_id
    })

    // Assert - verify entity was updated
    const entity = await db('entities')
      .where({ entity_id: organization_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(updated_properties.title)
    expect(entity.description).to.equal(updated_properties.description)
    expect(entity.markdown).to.equal(updated_content)

    // Handle date comparisons separately
    const frontmatter = entity.frontmatter
    expect(frontmatter.title).to.equal(updated_properties.title)
    expect(frontmatter.description).to.equal(updated_properties.description)
    expect(frontmatter.website_url).to.equal(updated_properties.website_url)
    expect(new Date(frontmatter.created_at).getTime()).to.be.closeTo(
      updated_properties.created_at.getTime(),
      1000
    )
    expect(new Date(frontmatter.updated_at).getTime()).to.be.closeTo(
      updated_properties.updated_at.getTime(),
      1000
    )

    // Verify organization-specific data was updated
    const organization_data = await db('organizations')
      .where({ entity_id: organization_id })
      .first()
    expect(organization_data).to.exist
    expect(organization_data.website_url).to.equal(
      updated_properties.website_url
    )
  })

  it('should handle file info correctly', async () => {
    // Arrange
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    const organization_properties = {
      title: 'File Info Organization',
      description: 'Organization with file info',
      website_url: 'https://file-example.org',
      created_at: now,
      updated_at: later
    }
    const file_info = {
      absolute_path: '/path/to/organization.md',
      git_sha: '98765abcdef'
    }

    // Act
    const organization_id = await write_organization_to_database({
      organization_properties,
      user_id: test_user_id,
      file_info
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: organization_id })
      .first()
    expect(entity).to.exist
    expect(entity.absolute_path).to.equal(file_info.absolute_path)
    expect(entity.git_sha).to.equal(file_info.git_sha)
  })

  it('should handle partial organization properties', async () => {
    // Arrange - minimal properties
    const organization_properties = {
      title: 'Minimal Organization'
      // Only providing title, all other fields should be handled as null or defaults
    }

    // Act
    const organization_id = await write_organization_to_database({
      organization_properties,
      user_id: test_user_id
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: organization_id })
      .first()
    expect(entity).to.exist
    expect(entity.title).to.equal(organization_properties.title)
    expect(entity.type).to.equal('organization')

    // Verify optional fields in organizations table are null
    const organization_data = await db('organizations')
      .where({ entity_id: organization_id })
      .first()
    expect(organization_data).to.exist
    expect(organization_data.website_url).to.be.null
  })

  it('should store organization with relationships', async () => {
    // Arrange - first create a related tag entity
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // Create a tag to use for the organization
    const tag_properties = {
      title: 'Organization Tag',
      description: 'A tag for organizations',
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

    // Create organization with tag
    const organization_properties = {
      title: 'Tagged Organization',
      description: 'Organization with tags',
      website_url: 'https://tagged-org.example.org',
      // TODO should be base_relative_path
      tags: [tag_entity_id],
      created_at: now,
      updated_at: later
    }

    // Act
    const organization_id = await write_organization_to_database({
      organization_properties,
      user_id: test_user_id
    })

    // Assert
    const tag_relation = await db('entity_tags')
      .where({
        entity_id: organization_id,
        tag_entity_id
      })
      .first()

    expect(tag_relation).to.exist
  })

  it('should handle archived status correctly', async () => {
    // Arrange
    const now = new Date()
    const archive_date = new Date(now.getTime() + 86400000) // 1 day later

    const organization_properties = {
      title: 'Archived Organization',
      description: 'This organization is archived',
      website_url: 'https://archived.example.org',
      created_at: now,
      updated_at: now,
      archived_at: archive_date
    }

    // Act
    const organization_id = await write_organization_to_database({
      organization_properties,
      user_id: test_user_id
    })

    // Assert
    const entity = await db('entities')
      .where({ entity_id: organization_id })
      .first()
    expect(entity).to.exist
    expect(entity.archived_at).to.not.be.null
    expect(new Date(entity.archived_at).getTime()).to.be.closeTo(
      archive_date.getTime(),
      1000
    )
  })
})
