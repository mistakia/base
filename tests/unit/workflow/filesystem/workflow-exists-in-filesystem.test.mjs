import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import config from '#config'

import { workflow_exists_in_filesystem } from '#libs-server/workflow/filesystem/workflow-exists-in-filesystem.mjs'
import { create_temp_test_directory } from '#tests/utils/index.mjs'
import create_temp_test_repo from '#tests/utils/create-temp-test-repo.mjs'

describe('workflow_exists_in_filesystem', () => {
  let temp_dir
  let cleanup
  let original_root_base_directory

  beforeEach(() => {
    // Save original config values
    original_root_base_directory = config.root_base_directory

    // Create temporary directory for tests
    const temp_directory = create_temp_test_directory('workflow-exists-test-')
    temp_dir = temp_directory.path
    cleanup = temp_directory.cleanup

    // Set config directory to our test directory
    config.root_base_directory = temp_dir
  })

  afterEach(() => {
    // Restore original config values
    config.root_base_directory = original_root_base_directory

    // Clean up temporary directory
    if (cleanup) {
      cleanup()
    }
  })

  it('should return true when workflow file exists', async () => {
    // Arrange
    const base_relative_path = 'system/workflow/test-workflow.md'
    const file_dir = path.join(temp_dir, 'system/workflow')
    await fs.mkdir(file_dir, { recursive: true })
    await fs.writeFile(
      path.join(temp_dir, base_relative_path),
      '# Test Workflow'
    )

    // Act
    const exists = await workflow_exists_in_filesystem({
      base_relative_path,
      root_base_directory: temp_dir
    })

    // Assert
    expect(exists).to.be.true
  })

  it('should return true when user workflow exists', async () => {
    // Arrange
    const base_relative_path = 'workflow/test-workflow.md'
    const file_dir = path.join(temp_dir, 'workflow')
    await fs.mkdir(file_dir, { recursive: true })
    await fs.writeFile(
      path.join(temp_dir, base_relative_path),
      '# Test Workflow'
    )

    // Act
    const exists = await workflow_exists_in_filesystem({
      base_relative_path,
      root_base_directory: temp_dir
    })

    // Assert
    expect(exists).to.be.true
  })

  it('should return false when workflow does not exist', async () => {
    // Arrange
    const base_relative_path = 'system/workflow/non-existent-workflow.md'

    // Act
    const exists = await workflow_exists_in_filesystem({
      base_relative_path
    })

    // Assert
    expect(exists).to.be.false
  })

  it('should return false when workflow path is invalid', async () => {
    // Act
    const exists = await workflow_exists_in_filesystem({
      base_relative_path: ''
    })

    // Assert
    expect(exists).to.be.false
  })

  it('should return false when base_relative_path is not provided', async () => {
    // Act
    const exists = await workflow_exists_in_filesystem({})

    // Assert
    expect(exists).to.be.false
  })

  it('should use custom root_base_directory when provided', async () => {
    // Arrange
    const custom_dir = path.join(temp_dir, 'custom-base')
    const base_relative_path = 'system/workflow/custom-workflow.md'
    const file_dir = path.join(custom_dir, 'system/workflow')
    await fs.mkdir(file_dir, { recursive: true })
    await fs.writeFile(
      path.join(custom_dir, base_relative_path),
      '# Custom Workflow'
    )

    // Act
    const exists = await workflow_exists_in_filesystem({
      base_relative_path,
      root_base_directory: custom_dir
    })

    // Assert
    expect(exists).to.be.true
  })
})

// Add tests using git repository approach
describe('workflow_exists_in_filesystem with git repository', () => {
  let test_repo

  before(async () => {
    // Create a temporary git repository with test workflows
    test_repo = await create_temp_test_repo()
  })

  after(() => {
    // Clean up the test repository
    if (test_repo) {
      test_repo.cleanup()
    }
  })

  it('should return true for existing workflows in git repo', async () => {
    // Act
    const workflow_exists = await workflow_exists_in_filesystem({
      base_relative_path: 'system/workflow/default-workflow.md',
      root_base_directory: test_repo.path
    })

    // Assert
    expect(workflow_exists).to.be.true
  })

  it('should return false for non-existent workflows in git repo', async () => {
    // Arrange
    const non_existent_path = 'system/workflow/nonexistent-workflow.md'

    // Act
    const workflow_exists_result = await workflow_exists_in_filesystem({
      base_relative_path: non_existent_path,
      root_base_directory: test_repo.path
    })

    // Assert
    expect(workflow_exists_result).to.be.false
  })
})
