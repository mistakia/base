import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'

import { entity_exists_in_filesystem } from '#libs-server/entity/filesystem/entity-exists-in-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { create_temp_test_directory } from '#tests/utils/index.mjs'

describe('entity_exists_in_filesystem', () => {
  let temp_dir
  let cleanup

  beforeEach(() => {
    const temp_directory = create_temp_test_directory('entity-exists-test-')
    temp_dir = temp_directory.path
    cleanup = temp_directory.cleanup
  })

  afterEach(() => {
    if (cleanup) {
      cleanup()
    }
  })

  it('should return true when entity exists', async () => {
    // Arrange
    const absolute_path = path.join(temp_dir, 'test-entity.md')
    const entity_properties = {
      title: 'Test Entity',
      description: 'Test description',
      user_public_key: 'abc123'
    }
    const entity_type = 'test'
    const entity_content = '# Test Entity\n\nContent body'

    // Act
    await write_entity_to_filesystem({
      absolute_path,
      entity_properties,
      entity_type,
      entity_content
    })

    const exists = await entity_exists_in_filesystem({
      absolute_path
    })

    // Assert
    expect(exists).to.be.true
  })

  it('should return false when entity does not exist', async () => {
    // Arrange
    const non_existent_path = path.join(temp_dir, 'non-existent-entity.md')

    // Act
    const exists = await entity_exists_in_filesystem({
      absolute_path: non_existent_path
    })

    // Assert
    expect(exists).to.be.false
  })

  it('should return false when absolute_path is not provided', async () => {
    // Act
    const exists = await entity_exists_in_filesystem({})

    // Assert
    expect(exists).to.be.false
  })

  it('should return false when path exists but is not readable', async () => {
    // Arrange
    const absolute_path = path.join(temp_dir, 'unreadable-entity.md')
    const entity_properties = {
      title: 'Unreadable Entity',
      description: 'Test description',
      user_public_key: 'abc123'
    }
    const entity_type = 'test'

    await write_entity_to_filesystem({
      absolute_path,
      entity_properties,
      entity_type
    })

    // Make file unreadable
    await fs.chmod(absolute_path, 0o000)

    // Act
    const exists = await entity_exists_in_filesystem({
      absolute_path
    })

    // Assert
    expect(exists).to.be.false

    // Cleanup - make file readable again so it can be deleted
    await fs.chmod(absolute_path, 0o644)
  })

  it('should return false when path is a directory', async () => {
    // Arrange
    const dir_path = path.join(temp_dir, 'entity-dir')
    await fs.mkdir(dir_path)

    // Act
    const exists = await entity_exists_in_filesystem({
      absolute_path: dir_path
    })

    // Assert
    expect(exists).to.be.false
  })
})
