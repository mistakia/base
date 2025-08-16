import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'

import { read_workflow_from_filesystem } from '#libs-server/workflow/filesystem/read-workflow-from-filesystem.mjs'
import {
  setup_test_directories,
  create_temp_test_repo
} from '#tests/utils/index.mjs'

describe('read_workflow_from_filesystem', () => {
  let test_dirs

  beforeEach(() => {
    // Setup test directories and register them with the registry
    test_dirs = setup_test_directories()
  })

  afterEach(() => {
    // Clean up directories and clear registry
    if (test_dirs?.cleanup) {
      test_dirs.cleanup()
    }
  })

  it('should successfully read a system workflow', async () => {
    // Arrange
    const workflow_base_uri = 'sys:system/workflow/test-workflow.md'
    const workflow_dir = path.join(test_dirs.system_path, 'system', 'workflow')
    await fs.mkdir(workflow_dir, { recursive: true })

    const workflow_content = `---
title: "Test Workflow"
type: "workflow"
description: "This is a test workflow"
tags: ["test", "workflow"]
---

# Test Workflow

This is a test workflow content.
`

    await fs.writeFile(
      path.join(workflow_dir, 'test-workflow.md'),
      workflow_content
    )

    // Act
    const result = await read_workflow_from_filesystem({
      base_uri: workflow_base_uri
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.base_uri).to.equal(workflow_base_uri)
    expect(result.absolute_path).to.equal(
      path.join(test_dirs.system_path, 'system/workflow/test-workflow.md')
    )
    expect(result.entity_properties).to.include({
      title: 'Test Workflow',
      type: 'workflow',
      description: 'This is a test workflow'
    })
    expect(result.entity_properties.tags).to.deep.equal(['test', 'workflow'])
    expect(result.entity_content).to.include('# Test Workflow')
    expect(result.entity_content).to.include('This is a test workflow content.')
    expect(result.raw_content).to.equal(workflow_content)
  })

  it('should successfully read a user workflow', async () => {
    // Arrange
    const workflow_base_uri = 'user:workflow/test-user-workflow.md'
    const workflow_dir = path.join(test_dirs.user_path, 'workflow')
    await fs.mkdir(workflow_dir, { recursive: true })

    const workflow_content = `---
title: "User Workflow"
type: "workflow"
description: "This is a user workflow"
tags: ["user", "test"]
---

# User Workflow

This is user workflow content.
`

    await fs.writeFile(
      path.join(workflow_dir, 'test-user-workflow.md'),
      workflow_content
    )

    // Act
    const result = await read_workflow_from_filesystem({
      base_uri: workflow_base_uri
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.base_uri).to.equal(workflow_base_uri)
    expect(result.absolute_path).to.equal(
      path.join(test_dirs.user_path, 'workflow', 'test-user-workflow.md')
    )
    expect(result.entity_properties).to.include({
      title: 'User Workflow',
      type: 'workflow',
      description: 'This is a user workflow'
    })
    expect(result.entity_properties.tags).to.deep.equal(['user', 'test'])
    expect(result.entity_content).to.include('# User Workflow')
    expect(result.raw_content).to.equal(workflow_content)
  })

  it('should return error when workflow does not exist', async () => {
    // Arrange
    const workflow_base_uri = 'sys:system/workflow/non-existent-workflow.md'

    // Act
    const result = await read_workflow_from_filesystem({
      base_uri: workflow_base_uri
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
    expect(result.base_uri).to.equal(workflow_base_uri)
  })

  it('should return error when workflow_base_uri is invalid', async () => {
    // Act
    const result = await read_workflow_from_filesystem({
      base_uri: 'invalid-path'
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should return error when workflow_base_uri is not provided', async () => {
    // Act
    const result = await read_workflow_from_filesystem({})

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should handle malformed frontmatter gracefully', async () => {
    // Arrange
    const workflow_base_uri = 'sys:system/workflow/malformed-workflow.md'
    const system_dir = path.join(test_dirs.system_path, 'system', 'workflow')
    await fs.mkdir(system_dir, { recursive: true })

    const malformed_content = `---
title: "Malformed Workflow
description: Missing closing quote
---

# Malformed content
`

    await fs.writeFile(
      path.join(system_dir, 'malformed-workflow.md'),
      malformed_content
    )

    // Act
    const result = await read_workflow_from_filesystem({
      base_uri: workflow_base_uri
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should handle workflow without type property', async () => {
    // Arrange
    const workflow_base_uri = 'sys:system/workflow/no-type-workflow.md'
    const workflow_dir = path.join(test_dirs.system_path, 'system', 'workflow')
    await fs.mkdir(workflow_dir, { recursive: true })

    const no_type_content = `---
title: "No Type Workflow"
description: "Workflow without type"
---

# No Type Workflow
`

    await fs.writeFile(
      path.join(workflow_dir, 'no-type-workflow.md'),
      no_type_content
    )

    // Act
    const result = await read_workflow_from_filesystem({
      base_uri: workflow_base_uri
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.include('No entity type found')
  })
})

// Add tests using git repository approach for integration testing
describe('read_workflow_from_filesystem with git repository', () => {
  let test_repo

  before(async () => {
    // Create a temporary git repository with test workflows
    test_repo = await create_temp_test_repo()
  })

  after(() => {
    // Clean up the test repository
    if (test_repo?.cleanup) {
      test_repo.cleanup()
    }
  })

  it('should handle non-existent workflow in git repo', async () => {
    // Act
    const result = await read_workflow_from_filesystem({
      base_uri: 'sys:system/workflow/non-existent-workflow.md'
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
  })
})
