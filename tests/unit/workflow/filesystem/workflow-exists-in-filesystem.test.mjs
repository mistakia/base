import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'

import { workflow_exists_in_filesystem } from '#libs-server/workflow/filesystem/workflow-exists-in-filesystem.mjs'
import {
  setup_test_directories,
  create_temp_test_repo
} from '#tests/utils/index.mjs'

describe('workflow_exists_in_filesystem', () => {
  let test_dirs

  beforeEach(() => {
    // Setup test directories and register them
    test_dirs = setup_test_directories()
  })

  afterEach(() => {
    // Clean up directories and clear registry
    if (test_dirs?.cleanup) {
      test_dirs.cleanup()
    }
  })

  it('should return true when workflow file exists', async () => {
    // Arrange
    const base_uri = 'sys:system/workflow/test-workflow.md'
    const file_dir = path.join(test_dirs.system_path, 'system/workflow')
    await fs.mkdir(file_dir, { recursive: true })
    await fs.writeFile(
      path.join(test_dirs.system_path, 'system/workflow/test-workflow.md'),
      '# Test Workflow'
    )

    // Act
    const exists = await workflow_exists_in_filesystem({
      base_uri
    })

    // Assert
    expect(exists).to.be.true
  })

  it('should return true when user workflow exists', async () => {
    // Arrange
    const base_uri = 'user:workflow/test-workflow.md'
    const file_dir = path.join(test_dirs.user_path, 'workflow')
    await fs.mkdir(file_dir, { recursive: true })
    await fs.writeFile(
      path.join(test_dirs.user_path, 'workflow/test-workflow.md'),
      '# Test Workflow'
    )

    // Act
    const exists = await workflow_exists_in_filesystem({
      base_uri
    })

    // Assert
    expect(exists).to.be.true
  })

  it('should return false when workflow does not exist', async () => {
    // Arrange
    const base_uri = 'sys:system/workflow/non-existent-workflow.md'

    // Act
    const exists = await workflow_exists_in_filesystem({
      base_uri
    })

    // Assert
    expect(exists).to.be.false
  })

  it('should return false when workflow path is invalid', async () => {
    // Act
    const exists = await workflow_exists_in_filesystem({
      base_uri: ''
    })

    // Assert
    expect(exists).to.be.false
  })

  it('should return false when base_uri is not provided', async () => {
    // Act
    const exists = await workflow_exists_in_filesystem({})

    // Assert
    expect(exists).to.be.false
  })

  it('should work with registered directories', async () => {
    // Arrange
    const base_uri = 'sys:system/workflow/registered-workflow.md'
    const file_dir = path.join(test_dirs.system_path, 'system/workflow')
    await fs.mkdir(file_dir, { recursive: true })
    await fs.writeFile(
      path.join(
        test_dirs.system_path,
        'system/workflow/registered-workflow.md'
      ),
      '# Registered Workflow'
    )

    // Act
    const exists = await workflow_exists_in_filesystem({
      base_uri
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

  it('should return false for non-existent workflows in git repo', async () => {
    // Arrange
    const non_existent_path = 'sys:system/workflow/nonexistent-workflow.md'

    // Act
    const workflow_exists_result = await workflow_exists_in_filesystem({
      base_uri: non_existent_path
    })

    // Assert
    expect(workflow_exists_result).to.be.false
  })
})
