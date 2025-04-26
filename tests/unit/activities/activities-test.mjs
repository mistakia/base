/* global describe, it, before, after */

import chai from 'chai'
import {
  activity_exists,
  get_activity_file
} from '#libs-server/activities/index.mjs'
import create_temp_test_repo from '#tests/utils/create-temp-test-repo.mjs'

const expect = chai.expect

describe('Activities module', () => {
  let test_repo

  before(async () => {
    // Create a temporary git repository with test activities
    test_repo = await create_temp_test_repo()
  })

  after(() => {
    // Clean up the test repository
    if (test_repo) {
      test_repo.cleanup()
    }
  })

  describe('activity_exists', () => {
    it('should return true for existing activities', async () => {
      // Act
      const system_activity_exists = await activity_exists({
        activity_id: 'system/default-base-activity.md',
        system_base_directory: test_repo.path,
        user_base_directory: test_repo.path
      })

      // Assert
      expect(system_activity_exists).to.equal(true)
    })

    it('should return false for non-existent activities', async () => {
      // Arrange
      const non_existent_path = 'system/nonexistent-activity.md'

      // Act
      const activity_exists_result = await activity_exists({
        activity_id: non_existent_path,
        system_base_directory: test_repo.path,
        user_base_directory: test_repo.path
      })

      // Assert
      expect(activity_exists_result).to.equal(false)
    })
  })

  describe('get_activity_file', () => {
    it('should retrieve an existing activity file', async () => {
      // Arrange
      const system_activity_path = 'system/default-base-activity.md'

      // Act
      const activity_file = await get_activity_file({
        activity_id: system_activity_path,
        system_base_directory: test_repo.path,
        user_base_directory: test_repo.path
      })

      // Assert
      expect(activity_file).to.be.an('object')
      expect(activity_file.activity_id).to.equal(system_activity_path)
      expect(activity_file.file_path).to.be.a('string')
      expect(activity_file.content).to.be.a('string')
      expect(activity_file.content.length).to.be.greaterThan(0)
    })

    it('should throw an error for non-existent activity files', async () => {
      // Arrange
      const non_existent_path = 'system/nonexistent-activity.md'

      // Act & Assert
      try {
        await get_activity_file({
          activity_id: non_existent_path,
          system_base_directory: test_repo.path,
          user_base_directory: test_repo.path
        })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.an('error')
        expect(error.message).to.include(
          "Activity 'system/nonexistent-activity.md' does not exist"
        )
      }
    })
  })
})
