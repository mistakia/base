import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import { delete_entity_from_filesystem } from '#libs-server/entity/filesystem/delete-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

describe('delete_entity_from_filesystem', () => {
  let temp_dir

  beforeEach(async () => {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'delete-entity-test-'))
  })

  afterEach(async () => {
    if (temp_dir) {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should delete an entity from the filesystem successfully', async () => {
    const absolute_path = path.join(temp_dir, 'test-entity.md')
    const entity_data = {
      title: 'Test Entity',
      description: 'Test description',
      user_id: '123456'
    }
    const entity_type = 'test'

    // First write an entity to delete
    await write_entity_to_filesystem({
      absolute_path,
      entity_data,
      entity_type
    })

    // Verify file exists before deletion
    const file_exists_before = await fs
      .access(absolute_path)
      .then(() => true)
      .catch(() => false)
    expect(file_exists_before).to.be.true

    // Delete the entity
    const result = await delete_entity_from_filesystem({
      absolute_path
    })

    expect(result).to.be.true

    // Verify file no longer exists
    const file_exists_after = await fs
      .access(absolute_path)
      .then(() => true)
      .catch(() => false)
    expect(file_exists_after).to.be.false
  })

  it('should return false when trying to delete a non-existent entity', async () => {
    const non_existent_path = path.join(temp_dir, 'non-existent-entity.md')

    const result = await delete_entity_from_filesystem({
      absolute_path: non_existent_path
    })

    expect(result).to.be.false
  })

  it('should throw error if absolute_path is missing', async () => {
    try {
      await delete_entity_from_filesystem({})
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Absolute path is required')
    }
  })

  it('should handle errors during deletion and propagate them', async () => {
    // Create a directory with the same name to cause a deletion error
    const dir_path = path.join(temp_dir, 'entity-dir')
    await fs.mkdir(dir_path)

    try {
      await delete_entity_from_filesystem({
        absolute_path: dir_path
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      // The exact error message might vary across operating systems
      // so we just check that an error is thrown
      expect(error).to.exist
    }
  })
})
