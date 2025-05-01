import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'

import { read_entity_from_git } from '#libs-server/entity/git/read-entity-from-git.mjs'
import { write_entity_to_git } from '#libs-server/entity/git/write-entity-to-git.mjs'
import { create_temp_test_repo } from '#tests/utils/create-temp-test-repo.mjs'

describe('read_entity_from_git', () => {
  let repo
  const entity_path = 'entities/test-entity.md'
  const complex_entity_path = 'entities/complex-entity.md'
  const branch = 'main'

  before(async () => {
    // Create a temporary git repository
    repo = await create_temp_test_repo()

    // Create entities directory
    await fs.mkdir(path.join(repo.path, 'entities'), { recursive: true })

    // Write test entity to git
    const simple_entity_properties = {
      title: 'Test Git Entity',
      description: 'Entity stored in git',
      user_id: 'user-123',
      tags: ['git', 'test']
    }
    const simple_entity_type = 'test'
    const simple_entity_content =
      '# Test Git Entity\n\nThis entity is stored in git.'

    await write_entity_to_git({
      repo_path: repo.path,
      file_path: entity_path,
      entity_properties: simple_entity_properties,
      entity_type: simple_entity_type,
      entity_content: simple_entity_content,
      branch
    })

    // Write complex entity to git
    const complex_entity_properties = {
      title: 'Complex Git Entity',
      description: 'Complex entity stored in git',
      user_id: 'user-456',
      status: 'In Progress',
      priority: 'High',
      relations: [
        'relates_to [[entity/other-entity]]',
        'depends_on [[entity/dependency]]'
      ],
      observations: [
        '[note] This is a test observation',
        '[tech] Uses markdown #format'
      ],
      custom_object: {
        key1: 'value1',
        key2: 'value2'
      }
    }
    const complex_entity_type = 'complex'

    await write_entity_to_git({
      repo_path: repo.path,
      file_path: complex_entity_path,
      entity_properties: complex_entity_properties,
      entity_type: complex_entity_type,
      branch
    })
  })

  after(() => {
    // Clean up temporary repository
    if (repo) {
      repo.cleanup()
    }
  })

  it('should read an entity from git successfully', async () => {
    const result = await read_entity_from_git({
      repo_path: repo.path,
      file_path: entity_path,
      branch
    })

    // Verify result
    expect(result.success).to.be.true
    expect(result.file_path).to.equal(entity_path)
    expect(result.branch).to.equal(branch)
    expect(result.entity_properties).to.include({
      title: 'Test Git Entity',
      type: 'test',
      description: 'Entity stored in git',
      user_id: 'user-123'
    })

    // Check that tags are present
    expect(result.entity_properties.tags).to.be.an('array')
    expect(result.entity_properties.tags).to.include('git')
    expect(result.entity_properties.tags).to.include('test')

    // Check content and raw_content
    expect(result.entity_content).to.equal(
      '# Test Git Entity\n\nThis entity is stored in git.'
    )
    expect(result.raw_content).to.be.a('string')
    expect(result.raw_content).to.include('title: "Test Git Entity"')
    expect(result.raw_content).to.include('type: "test"')
    expect(result.raw_content).to.include('# Test Git Entity')
  })

  it('should handle an entity with complex frontmatter', async () => {
    const result = await read_entity_from_git({
      repo_path: repo.path,
      file_path: complex_entity_path,
      branch
    })

    expect(result.success).to.be.true
    expect(result.entity_properties.title).to.equal('Complex Git Entity')
    expect(result.entity_properties.type).to.equal('complex')
    expect(result.entity_properties.status).to.equal('In Progress')
    expect(result.entity_properties.priority).to.equal('High')

    // Check arrays
    expect(result.entity_properties.relations)
      .to.be.an('array')
      .with.lengthOf(2)
    expect(result.entity_properties.observations)
      .to.be.an('array')
      .with.lengthOf(2)

    // Check created_at and updated_at timestamps were added
    expect(result.entity_properties.created_at).to.be.a('string')
    expect(result.entity_properties.updated_at).to.be.a('string')
  })

  it('should return error when file does not exist', async () => {
    const non_existent_path = 'entities/non-existent-entity.md'

    const result = await read_entity_from_git({
      repo_path: repo.path,
      file_path: non_existent_path,
      branch
    })

    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
    expect(result.file_path).to.equal(non_existent_path)
  })

  it('should return error when repository does not exist', async () => {
    const result = await read_entity_from_git({
      repo_path: '/non/existent/repo',
      file_path: entity_path,
      branch
    })

    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should return error when branch does not exist', async () => {
    const non_existent_branch = 'non-existent-branch'

    const result = await read_entity_from_git({
      repo_path: repo.path,
      file_path: entity_path,
      branch: non_existent_branch
    })

    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
  })

  it('should return error if repo_path is missing', async () => {
    const result = await read_entity_from_git({
      file_path: entity_path,
      branch
    })

    expect(result.success).to.be.false
    expect(result.error).to.equal('Repository path is required')
  })

  it('should return error if file_path is missing', async () => {
    const result = await read_entity_from_git({
      repo_path: repo.path,
      branch
    })

    expect(result.success).to.be.false
    expect(result.error).to.equal('File path is required')
  })

  it('should return error if branch is missing', async () => {
    const result = await read_entity_from_git({
      repo_path: repo.path,
      file_path: entity_path
    })

    expect(result.success).to.be.false
    expect(result.error).to.equal('Branch name is required')
  })
})
