import { expect } from 'chai'
import path from 'path'
import fs from 'fs'
import generate_activity_prompt from '#libs-server/prompts/generate-activity-prompt.mjs'
import { create_temp_test_directory } from '#tests/utils/index.mjs'

describe('generate_activity_prompt', () => {
  // Test directories
  let test_system_dir
  let test_user_dir

  // Create temporary test directories before tests
  before(async () => {
    // Create temp directories for test activities
    test_system_dir = await create_temp_test_directory('system-activities-test')
    test_user_dir = await create_temp_test_directory('user-activities-test')

    // Create activities directories with proper structure
    fs.mkdirSync(path.join(test_system_dir.path, 'system', 'activities'), {
      recursive: true
    })
    fs.mkdirSync(path.join(test_user_dir.path, 'activities'), {
      recursive: true
    })
  })

  // Clean up test directories after tests
  after(async () => {
    // Use the cleanup functions provided by create_temp_test_directory
    if (test_system_dir && test_system_dir.cleanup) {
      test_system_dir.cleanup()
    }

    if (test_user_dir && test_user_dir.cleanup) {
      test_user_dir.cleanup()
    }
  })

  // Helper function to create a test activity file
  const create_activity_file = ({
    base_dir,
    activity_directory_type,
    file_name,
    content
  }) => {
    // For system activities: base_dir/system/activities/file_name
    // For user activities: base_dir/activities/file_name
    const file_path =
      activity_directory_type === 'system'
        ? path.join(base_dir, activity_directory_type, 'activities', file_name)
        : path.join(base_dir, 'activities', file_name)
    fs.writeFileSync(file_path, content, 'utf8')
    return file_path
  }

  describe('with activity_id parameter', () => {
    // Create test activity files before each test in this group
    beforeEach(() => {
      // Create system activity files
      create_activity_file({
        base_dir: test_system_dir.path,
        activity_directory_type: 'system',
        file_name: 'test-activity1.md',
        content:
          '---\ntitle: Test Activity 1\ndescription: First test activity\ntype: activity\nguidelines: ["system/guideline1.md", "system/guideline2.md"]\n---\n\n# Test Activity 1\n\n<role>This is test content for activity 1</role>'
      })

      create_activity_file({
        base_dir: test_system_dir.path,
        activity_directory_type: 'system',
        file_name: 'test-activity2.md',
        content:
          '---\ntitle: Test Activity 2\ndescription: Second test activity\ntype: activity\n---\n\n# Test Activity 2\n\n<role>This is test content for activity 2</role>'
      })

      create_activity_file({
        base_dir: test_user_dir.path,
        activity_directory_type: 'user',
        file_name: 'user-activity1.md',
        content:
          '---\ntitle: User Activity 1\ndescription: User test activity\ntype: activity\nguidelines: ["user/user-guideline1.md"]\n---\n\n# User Activity 1\n\n<role>This is user activity content</role>'
      })
    })

    // Clean up files after each test
    afterEach(() => {
      // Remove all files from the activities directories
      const system_activities_dir = path.join(
        test_system_dir.path,
        'system',
        'activities'
      )
      const user_activities_dir = path.join(test_user_dir.path, 'activities')

      if (fs.existsSync(system_activities_dir)) {
        fs.readdirSync(system_activities_dir).forEach((file) => {
          fs.unlinkSync(path.join(system_activities_dir, file))
        })
      }

      if (
        fs.existsSync(user_activities_dir) &&
        fs.readdirSync(user_activities_dir).length > 0
      ) {
        fs.readdirSync(user_activities_dir).forEach((file) => {
          fs.unlinkSync(path.join(user_activities_dir, file))
        })
      }
    })

    it('should generate prompt for a system activity with guidelines', async () => {
      // Act
      const result = await generate_activity_prompt({
        activity_id: 'system/test-activity1.md',
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Assert
      expect(result).to.be.an('object')
      expect(result.prompt).to.be.a('string')
      expect(result.prompt).to.include('Test Activity 1')
      expect(result.prompt).to.include(
        '<role>This is test content for activity 1</role>'
      )
      expect(result.guideline_ids).to.be.an('array')
      expect(result.guideline_ids).to.have.lengthOf(2)
      expect(result.guideline_ids).to.include('system/guideline1.md')
      expect(result.guideline_ids).to.include('system/guideline2.md')
    })

    it('should generate prompt for a system activity without guidelines', async () => {
      // Act
      const result = await generate_activity_prompt({
        activity_id: 'system/test-activity2.md',
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Assert
      expect(result).to.be.an('object')
      expect(result.prompt).to.be.a('string')
      expect(result.prompt).to.include('Test Activity 2')
      expect(result.prompt).to.include(
        '<role>This is test content for activity 2</role>'
      )
      expect(result.guideline_ids).to.be.an('array')
      expect(result.guideline_ids).to.have.lengthOf(0)
    })

    it('should generate prompt for a user activity', async () => {
      // Act
      const result = await generate_activity_prompt({
        activity_id: 'user/user-activity1.md',
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Assert
      expect(result).to.be.an('object')
      expect(result.prompt).to.be.a('string')
      expect(result.prompt).to.include('User Activity 1')
      expect(result.prompt).to.include(
        '<role>This is user activity content</role>'
      )
      expect(result.guideline_ids).to.be.an('array')
      expect(result.guideline_ids).to.have.lengthOf(1)
      expect(result.guideline_ids).to.include('user/user-guideline1.md')
    })

    it('should throw an error for non-existent activity', async () => {
      try {
        // Act
        await generate_activity_prompt({
          activity_id: 'system/nonexistent.md',
          system_base_directory: test_system_dir.path,
          user_base_directory: test_user_dir.path
        })
        // If we get here, fail the test
        expect.fail('Expected to throw an error but did not')
      } catch (error) {
        // Assert
        expect(error).to.be.an('error')
        expect(error.message).to.include('Failed to generate activity prompt')
      }
    })

    it('should throw an error when activity_id is not provided', async () => {
      try {
        // Act
        await generate_activity_prompt({
          system_base_directory: test_system_dir.path,
          user_base_directory: test_user_dir.path
        })
        // If we get here, fail the test
        expect.fail('Expected to throw an error but did not')
      } catch (error) {
        // Assert
        expect(error).to.be.an('error')
        expect(error.message).to.equal('activity_id is required')
      }
    })
  })
})
