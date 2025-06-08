import { expect } from 'chai'
import path from 'path'
import fs from 'fs'
import generate_workflow_prompt from '#libs-server/prompts/generate-workflow-prompt.mjs'
import { create_temp_test_directory } from '#tests/utils/index.mjs'
import {
  register_base_directories,
  clear_registered_directories
} from '#libs-server/base-uri/index.mjs'

describe('generate_workflow_prompt', () => {
  // Test directories
  let test_system_dir
  let test_user_dir

  // Create temporary test directories before tests
  before(async () => {
    // Create temp directories for test workflows
    test_system_dir = await create_temp_test_directory('system-workflows-test')
    test_user_dir = await create_temp_test_directory('user-workflows-test')

    // Create workflows directories with proper structure
    fs.mkdirSync(path.join(test_system_dir.path, 'workflow'), {
      recursive: true
    })
    fs.mkdirSync(path.join(test_user_dir.path, 'workflow'), {
      recursive: true
    })

    // Register directories for registry system
    register_base_directories({
      system_base_directory: test_system_dir.path,
      user_base_directory: test_user_dir.path
    })
  })

  // Clean up test directories after tests
  after(async () => {
    // Clear registry
    clear_registered_directories()

    // Use the cleanup functions provided by create_temp_test_directory
    if (test_system_dir && test_system_dir.cleanup) {
      test_system_dir.cleanup()
    }

    if (test_user_dir && test_user_dir.cleanup) {
      test_user_dir.cleanup()
    }
  })

  // Helper function to create a test workflow file
  const create_workflow_file = ({
    base_dir,
    workflow_directory_type,
    file_name,
    content
  }) => {
    // Both system and user workflows now go directly in workflow/ directory
    // System: base_dir/workflow/file_name
    // User: base_dir/workflow/file_name
    const file_path = path.join(base_dir, 'workflow', file_name)
    fs.writeFileSync(file_path, content, 'utf8')
    return file_path
  }

  describe('with base_uri parameter', () => {
    // Create test workflow files before each test in this group
    beforeEach(() => {
      // Create system workflow files
      create_workflow_file({
        base_dir: test_system_dir.path,
        workflow_directory_type: 'system',
        file_name: 'test-workflow1.md',
        content:
          '---\ntitle: Test Workflow 1\ndescription: First test workflow\ntype: workflow\nguidelines: ["sys:guideline1.md", "sys:guideline2.md"]\n---\n\n# Test Workflow 1\n\n<role>This is test content for workflow 1</role>'
      })

      create_workflow_file({
        base_dir: test_system_dir.path,
        workflow_directory_type: 'system',
        file_name: 'test-workflow2.md',
        content:
          '---\ntitle: Test Workflow 2\ndescription: Second test workflow\ntype: workflow\n---\n\n# Test Workflow 2\n\n<role>This is test content for workflow 2</role>'
      })

      create_workflow_file({
        base_dir: test_user_dir.path,
        workflow_directory_type: 'user',
        file_name: 'user-workflow1.md',
        content:
          '---\ntitle: User Workflow 1\ndescription: User test workflow\ntype: workflow\nguidelines: ["user:user-guideline1.md"]\n---\n\n# User Workflow 1\n\n<role>This is user workflow content</role>'
      })
    })

    // Clean up files after each test
    afterEach(() => {
      // Remove all files from the workflow directories
      const system_workflow_dir = path.join(test_system_dir.path, 'workflow')
      const user_workflow_dir = path.join(test_user_dir.path, 'workflow')

      if (fs.existsSync(system_workflow_dir)) {
        fs.readdirSync(system_workflow_dir).forEach((file) => {
          fs.unlinkSync(path.join(system_workflow_dir, file))
        })
      }

      if (
        fs.existsSync(user_workflow_dir) &&
        fs.readdirSync(user_workflow_dir).length > 0
      ) {
        fs.readdirSync(user_workflow_dir).forEach((file) => {
          fs.unlinkSync(path.join(user_workflow_dir, file))
        })
      }
    })

    it('should generate prompt for a system workflow with guidelines', async () => {
      // Act
      const result = await generate_workflow_prompt({
        base_uri: 'sys:workflow/test-workflow1.md'
      })

      // Assert
      expect(result).to.be.an('object')
      expect(result.prompt).to.be.a('string')
      expect(result.prompt).to.include('Test Workflow 1')
      expect(result.prompt).to.include(
        '<role>This is test content for workflow 1</role>'
      )
      expect(result.guideline_base_uris).to.be.an('array')
      expect(result.guideline_base_uris).to.have.lengthOf(2)
      expect(result.guideline_base_uris).to.include('sys:guideline1.md')
      expect(result.guideline_base_uris).to.include('sys:guideline2.md')
    })

    it('should generate prompt for a system workflow without guidelines', async () => {
      // Act
      const result = await generate_workflow_prompt({
        base_uri: 'sys:workflow/test-workflow2.md'
      })

      // Assert
      expect(result).to.be.an('object')
      expect(result.prompt).to.be.a('string')
      expect(result.prompt).to.include('Test Workflow 2')
      expect(result.prompt).to.include(
        '<role>This is test content for workflow 2</role>'
      )
      expect(result.guideline_base_uris).to.be.an('array')
      expect(result.guideline_base_uris).to.have.lengthOf(0)
    })

    it('should generate prompt for a user workflow', async () => {
      // Act
      const result = await generate_workflow_prompt({
        base_uri: 'user:workflow/user-workflow1.md'
      })

      // Assert
      expect(result).to.be.an('object')
      expect(result.prompt).to.be.a('string')
      expect(result.prompt).to.include('User Workflow 1')
      expect(result.prompt).to.include(
        '<role>This is user workflow content</role>'
      )
      expect(result.guideline_base_uris).to.be.an('array')
      expect(result.guideline_base_uris).to.have.lengthOf(1)
      expect(result.guideline_base_uris).to.include('user:user-guideline1.md')
    })

    it('should throw an error for non-existent workflow', async () => {
      try {
        // Act
        await generate_workflow_prompt({
          base_uri: 'sys:workflow/nonexistent.md'
        })
        // If we get here, fail the test
        expect.fail('Expected to throw an error but did not')
      } catch (error) {
        // Assert
        expect(error).to.be.an('error')
        expect(error.message).to.include('Failed to generate workflow prompt')
      }
    })

    it('should throw an error when base_uri is not provided', async () => {
      try {
        // Act
        await generate_workflow_prompt({})
        // If we get here, fail the test
        expect.fail('Expected to throw an error but did not')
      } catch (error) {
        // Assert
        expect(error).to.be.an('error')
        expect(error.message).to.equal('base_uri is required')
      }
    })
  })
})
