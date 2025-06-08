import { v4 as uuid } from 'uuid'
import { expect } from 'chai'
import db from '#db'
import write_organization_to_database from '#libs-server/entity/database/write/write-organization-to-database.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_temp_test_repo
} from '#tests/utils/index.mjs'
import path from 'path'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

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
      entity_id: uuid(),
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
      organization_content,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
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
    const entity_id = uuid()

    const original_properties = {
      entity_id,
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
      organization_content: original_content,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Create updated organization properties
    const even_later = new Date(later.getTime() + 1000) // 2 seconds after original created_at
    const updated_properties = {
      entity_id,
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
      organization_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
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
      entity_id: uuid(),
      title: 'File Info Organization',
      description: 'Organization with file info',
      website_url: 'https://file-example.org',
      created_at: now,
      updated_at: later
    }
    const file_info = {
      absolute_path: '/path/to/organization.md',
      git_sha: '98765abcdef',
      base_uri: 'sys:dummy/base/path'
    }

    // Act
    const organization_id = await write_organization_to_database({
      organization_properties,
      user_id: test_user_id,
      absolute_path: file_info.absolute_path,
      base_uri: file_info.base_uri,
      git_sha: file_info.git_sha
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
      entity_id: uuid(),
      title: 'Minimal Organization'
      // Only providing title, all other fields should be handled as null or defaults
    }

    // Act
    const organization_id = await write_organization_to_database({
      organization_properties,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
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
    // Arrange - set up a temp repo and create a related entity file
    const now = new Date()
    const later = new Date(now.getTime() + 1000) // 1 second later

    // 1. Create a temp repo
    const test_repo = await create_temp_test_repo({ prefix: 'org-rel-test-' })
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
        description: 'A related entity for organization',
        type: 'person',
        created_at: now,
        updated_at: later
      },
      entity_type: 'person',
      entity_content: 'A related entity for organization.'
    })

    // 3. Insert the related entity into the database
    await db('entities').insert({
      entity_id: related_entity_id,
      title: 'Related Entity',
      description: 'A related entity for organization',
      type: 'person',
      user_id: test_user_id,
      created_at: now,
      updated_at: later,
      frontmatter: {
        entity_id: related_entity_id,
        title: 'Related Entity',
        description: 'A related entity for organization',
        type: 'person',
        created_at: now,
        updated_at: later
      },
      base_uri: related_base_uri
    })

    // 4. Create organization with relationship (using base_uri)
    const organization_properties = {
      entity_id: uuid(),
      title: 'Org with Relation',
      description: 'Organization with relationships',
      created_at: now,
      updated_at: later
    }
    const formatted_entity_metadata = {
      relations: [{ relation_type: 'member_of', base_uri: related_base_uri }]
    }

    // Act
    const organization_id = await write_organization_to_database({
      organization_properties,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1',
      formatted_entity_metadata
    })

    // Assert
    const relation = await db('entity_relations')
      .where({
        source_entity_id: organization_id,
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

    const organization_properties = {
      entity_id: uuid(),
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
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_uri: 'sys:dummy/base/path',
      git_sha: 'dummysha1'
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
