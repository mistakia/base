import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'

import { delete_entity_from_git } from '#libs-server/entity/git/delete-entity-from-git.mjs'
import { write_entity_to_git } from '#libs-server/entity/git/write-entity-to-git.mjs'
import { read_entity_from_git } from '#libs-server/entity/git/read-entity-from-git.mjs'
import { create_temp_test_repo } from '#tests/utils/create-temp-test-repo.mjs'

describe('delete_entity_from_git', () => {
  let repo
  const entity_path = 'entities/test-entity-to-delete.md'
  const branch = 'main'

  before(async () => {
    // Create a temporary git repository
    repo = await create_temp_test_repo()

    // Create entities directory
    await fs.mkdir(path.join(repo.path, 'entities'), { recursive: true })

    // Write test entity to git
    const entity_properties = {
      title: 'Test Entity To Delete',
      description: 'Entity that will be deleted from git',
      user_id: 'user-123',
      tags: ['git', 'test', 'delete']
    }
    const entity_type = 'test'
    const entity_content =
      '# Test Entity To Delete\n\nThis entity should be deleted from git.'

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

  it('should delete an entity from git successfully', async () => {
    // Verify entity exists before deletion
    const before_result = await read_entity_from_git({
      repo_path: repo.path,
      git_relative_path: entity_path,
      branch
    })
    expect(before_result.success).to.be.true

    // Delete the entity
    const result = await delete_entity_from_git({
      repo_path: repo.path,
      git_relative_path: entity_path,
      branch,
      commit_message: 'Delete test entity'
    })

    // Verify deletion was successful
    expect(result.success).to.be.true
    expect(result.message).to.equal('File deletion completed successfully')
    expect(result.branch).to.equal(branch)
    expect(result.git_relative_path).to.equal(entity_path)

    // Verify entity no longer exists in git
    const after_result = await read_entity_from_git({
      repo_path: repo.path,
      git_relative_path: entity_path,
      branch
    })
    expect(after_result.success).to.be.false
  })

  it('should return error when trying to delete a non-existent entity', async () => {
    const non_existent_path = 'entities/non-existent-entity.md'

    const result = await delete_entity_from_git({
      repo_path: repo.path,
      git_relative_path: non_existent_path,
      branch
    })

    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
    expect(result.git_relative_path).to.equal(non_existent_path)
  })

  it('should return error when repository does not exist', async () => {
    const result = await delete_entity_from_git({
      repo_path: '/non/existent/repo',
      git_relative_path: entity_path,
      branch
    })

    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should return error when branch does not exist', async () => {
    const non_existent_branch = 'non-existent-branch'

    const result = await delete_entity_from_git({
      repo_path: repo.path,
      git_relative_path: entity_path,
      branch: non_existent_branch
    })

    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
  })

  it('should return error if repo_path is missing', async () => {
    const result = await delete_entity_from_git({
      git_relative_path: entity_path,
      branch
    })

    expect(result.success).to.be.false
    expect(result.error).to.equal('Repository path is required')
  })

  it('should return error if git_relative_path is missing', async () => {
    const result = await delete_entity_from_git({
      repo_path: repo.path,
      branch
    })

    expect(result.success).to.be.false
    expect(result.error).to.equal('Git relative path is required')
  })

  it('should return error if branch is missing', async () => {
    const result = await delete_entity_from_git({
      repo_path: repo.path,
      git_relative_path: entity_path
    })

    expect(result.success).to.be.false
    expect(result.error).to.equal('Branch name is required')
  })
})
