import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'

import { entity_exists_in_git } from '#libs-server/entity/git/entity-exists-in-git.mjs'
import { write_entity_to_git } from '#libs-server/entity/git/write-entity-to-git.mjs'
import { create_temp_test_repo } from '#tests/utils/create-temp-test-repo.mjs'
import { register_test_directories } from '#tests/utils/setup-test-directories.mjs'

describe('entity_exists_in_git', () => {
  let system_repo
  let cleanup_registry
  const entity_git_path = 'entities/test-entity.md'
  const entity_uri = 'sys:entities/test-entity.md'
  const non_existent_uri = 'sys:entities/non-existent-entity.md'
  const branch = 'main'

  before(async () => {
    // Create a temporary git repository (without auto-registration)
    system_repo = await create_temp_test_repo({ register_directories: false })

    // Register directories with the registry
    cleanup_registry = register_test_directories({
      system_base_directory: system_repo.system_path,
      user_base_directory: system_repo.user_path
    })

    // Create entities directory
    await fs.mkdir(path.join(system_repo.system_path, 'entities'), {
      recursive: true
    })

    // Write test entity to git using the registry-based approach
    const entity_properties = {
      entity_id: uuid(),
      title: 'Test Entity',
      description: 'Entity stored in git',
      user_public_key: 'abc123',
      tags: ['git', 'test']
    }
    const entity_type = 'test'
    const entity_content = '# Test Entity\n\nThis entity is stored in git.'

    await write_entity_to_git({
      base_uri: entity_uri,
      entity_properties,
      entity_type,
      entity_content,
      branch,
      commit_message: 'Add test entity'
    })
  })

  after(() => {
    // Clean up registry and temporary repository
    if (cleanup_registry) {
      cleanup_registry()
    }
    if (system_repo) {
      system_repo.cleanup()
    }
  })

  it('should return exists=true when entity exists', async () => {
    const result = await entity_exists_in_git({
      base_uri: entity_uri,
      branch
    })

    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.git_relative_path).to.equal(entity_git_path)
    expect(result.branch).to.equal(branch)
  })

  it('should return exists=false when entity does not exist', async () => {
    const result = await entity_exists_in_git({
      base_uri: non_existent_uri,
      branch
    })

    expect(result.success).to.be.true
    expect(result.exists).to.be.false
    expect(result.git_relative_path).to.equal('entities/non-existent-entity.md')
    expect(result.branch).to.equal(branch)
  })

  it('should return error when branch does not exist', async () => {
    const non_existent_branch = 'non-existent-branch'

    const result = await entity_exists_in_git({
      base_uri: entity_uri,
      branch: non_existent_branch
    })

    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
  })

  it('should return error when base_uri is missing', async () => {
    const result = await entity_exists_in_git({
      branch
    })

    expect(result.success).to.be.false
    expect(result.error).to.equal('Base URI is required')
  })

  it('should return error when branch is missing', async () => {
    const result = await entity_exists_in_git({
      base_uri: entity_uri
    })

    expect(result.success).to.be.false
    expect(result.error).to.equal('Branch name is required')
  })
})
