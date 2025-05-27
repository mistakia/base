import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'

import { entity_exists_in_git } from '#libs-server/entity/git/entity-exists-in-git.mjs'
import { write_entity_to_git } from '#libs-server/entity/git/write-entity-to-git.mjs'
import { create_temp_test_repo } from '#tests/utils/create-temp-test-repo.mjs'

describe('entity_exists_in_git', () => {
  let repo
  const entity_path = 'entities/test-entity.md'
  const non_existent_path = 'entities/non-existent-entity.md'
  const branch = 'main'

  before(async () => {
    // Create a temporary git repository
    repo = await create_temp_test_repo()

    // Create entities directory
    await fs.mkdir(path.join(repo.path, 'entities'), { recursive: true })

    // Write test entity to git
    const entity_properties = {
      entity_id: uuid(),
      title: 'Test Entity',
      description: 'Entity stored in git',
      user_id: 'user-123',
      tags: ['git', 'test']
    }
    const entity_type = 'test'
    const entity_content = '# Test Entity\n\nThis entity is stored in git.'

    await write_entity_to_git({
      repo_path: repo.path,
      git_relative_path: entity_path,
      entity_properties,
      entity_type,
      entity_content,
      branch
    })
  })

  after(() => {
    // Clean up temporary repository
    if (repo) {
      repo.cleanup()
    }
  })

  it('should return exists=true when entity exists', async () => {
    const result = await entity_exists_in_git({
      base_relative_path: entity_path,
      branch,
      root_base_directory: repo.path
    })

    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.git_relative_path).to.equal(entity_path)
    expect(result.branch).to.equal(branch)
  })

  it('should return exists=false when entity does not exist', async () => {
    const result = await entity_exists_in_git({
      base_relative_path: non_existent_path,
      branch,
      root_base_directory: repo.path
    })

    expect(result.success).to.be.true
    expect(result.exists).to.be.false
    expect(result.git_relative_path).to.equal(non_existent_path)
    expect(result.branch).to.equal(branch)
  })

  it('should return error when branch does not exist', async () => {
    const non_existent_branch = 'non-existent-branch'

    const result = await entity_exists_in_git({
      base_relative_path: entity_path,
      branch: non_existent_branch,
      root_base_directory: repo.path
    })

    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
  })

  it('should return error when base_relative_path is missing', async () => {
    const result = await entity_exists_in_git({
      branch,
      root_base_directory: repo.path
    })

    expect(result.success).to.be.false
    expect(result.error).to.equal('Base relative path is required')
  })

  it('should return error when branch is missing', async () => {
    const result = await entity_exists_in_git({
      base_relative_path: entity_path,
      root_base_directory: repo.path
    })

    expect(result.success).to.be.false
    expect(result.error).to.equal('Branch name is required')
  })
})
