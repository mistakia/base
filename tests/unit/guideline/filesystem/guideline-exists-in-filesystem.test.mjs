import { expect } from 'chai'

import { guideline_exists_in_filesystem } from '#libs-server/guideline/filesystem/guideline-exists-in-filesystem.mjs'
import {
  create_temp_test_repo,
  create_test_entity
} from '#tests/utils/index.mjs'
import { clear_registered_directories } from '#libs-server/base-uri/index.mjs'
describe('guideline_exists_in_filesystem', () => {
  let system_repo

  // System guideline paths in the repo
  const system_guideline_base_uri = 'sys:guideline/test-guideline.md'

  // User guideline paths in the repo
  const user_guideline_base_uri = 'user:guideline/test-user-guideline.md'

  const non_existent_guideline_base_uri = 'sys:guideline/non-existent.md'

  before(async () => {
    // Create temporary git repositories with registry
    system_repo = await create_temp_test_repo({
      prefix: 'guideline-system-',
      register_directories: true
    })

    // Create test system guideline using create_test_entity
    await create_test_entity({
      base_uri: system_guideline_base_uri,
      entity_type: 'guideline',
      entity_properties: {
        title: 'Test Guideline',
        description: 'This is a test guideline',
        tags: ['test', 'git']
      },
      entity_content: '# Test Guideline\n\nThis is a test guideline for Git.'
    })

    // Create test user guideline using create_test_entity
    await create_test_entity({
      base_uri: user_guideline_base_uri,
      entity_type: 'guideline',
      entity_properties: {
        title: 'User Guideline',
        description: 'This is a user guideline',
        tags: ['user', 'git']
      },
      entity_content: '# User Guideline\n\nThis is a user guideline for Git.'
    })
  })

  after(() => {
    // Clean up temporary repositories and registry
    clear_registered_directories()
    if (system_repo) {
      system_repo.cleanup()
    }
  })

  it('should return true when system guideline exists', async () => {
    // Act
    const exists = await guideline_exists_in_filesystem({
      base_uri: system_guideline_base_uri
    })

    // Assert
    expect(exists).to.be.true
  })

  it('should return true when user guideline exists', async () => {
    // Act
    const exists = await guideline_exists_in_filesystem({
      base_uri: user_guideline_base_uri
    })

    // Assert
    expect(exists).to.be.true
  })

  it('should return false when guideline does not exist', async () => {
    // Act
    const exists = await guideline_exists_in_filesystem({
      base_uri: non_existent_guideline_base_uri
    })

    // Assert
    expect(exists).to.be.false
  })

  it('should return false when guideline path is invalid', async () => {
    // Act
    const exists = await guideline_exists_in_filesystem({
      base_uri: 'invalid-path'
    })

    // Assert
    expect(exists).to.be.false
  })

  it('should return false when base_uri is not provided', async () => {
    // Act
    const exists = await guideline_exists_in_filesystem({})

    // Assert
    expect(exists).to.be.false
  })

  it('should use custom directories via registry', async () => {
    // Arrange - create a new repo and re-register
    const custom_repo = await create_temp_test_repo({
      prefix: 'custom-guideline-',
      register_directories: true
    })

    try {
      // Create a custom guideline using create_test_entity
      await create_test_entity({
        base_uri: 'sys:guideline/custom-guideline.md',
        entity_type: 'guideline',
        entity_properties: {
          title: 'Custom Guideline',
          description: 'A custom guideline for testing'
        },
        entity_content: '# Custom Guideline\n\nThis is a custom guideline.'
      })

      // Act
      const exists = await guideline_exists_in_filesystem({
        base_uri: 'sys:guideline/custom-guideline.md'
      })

      // Assert
      expect(exists).to.be.true
    } finally {
      // Cleanup
      clear_registered_directories()
      custom_repo.cleanup()

      // Re-register the original repos for other tests
      system_repo = await create_temp_test_repo({
        prefix: 'guideline-system-',
        register_directories: true
      })
    }
  })
})
