/**
 * Tests for process_single_github_issue wrapper function
 */

import { expect } from 'chai'
import { describe, it } from 'mocha'

import { process_single_github_issue } from '#libs-server/integrations/github/index.mjs'
import {
  base_issue,
  base_repository
} from '#tests/fixtures/github/webhooks.mjs'

describe('process_single_github_issue', () => {
  describe('parameter validation', () => {
    it('should throw error when issue is missing', async () => {
      try {
        await process_single_github_issue({
          github_repository_owner: 'test-org',
          github_repository_name: 'test-repo',
          github_token: 'test-token',
          user_public_key: 'test-public-key'
        })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.equal('Missing required parameter: issue')
      }
    })

    it('should throw error when github_repository_owner is missing', async () => {
      try {
        await process_single_github_issue({
          issue: base_issue,
          github_repository_name: 'test-repo',
          github_token: 'test-token',
          user_public_key: 'test-public-key'
        })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.equal(
          'Missing required parameter: github_repository_owner'
        )
      }
    })

    it('should throw error when github_repository_name is missing', async () => {
      try {
        await process_single_github_issue({
          issue: base_issue,
          github_repository_owner: 'test-org',
          github_token: 'test-token',
          user_public_key: 'test-public-key'
        })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.equal(
          'Missing required parameter: github_repository_name'
        )
      }
    })

    it('should throw error when user_public_key is missing', async () => {
      try {
        await process_single_github_issue({
          issue: base_issue,
          github_repository_owner: 'test-org',
          github_repository_name: 'test-repo',
          github_token: 'test-token'
        })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.equal(
          'Missing required parameter: user_public_key'
        )
      }
    })
  })

  describe('optional parameters', () => {
    it('should accept project_item parameter', async () => {
      // This test validates the function signature accepts project_item
      // The actual sync will fail due to missing config, but that's expected
      try {
        await process_single_github_issue({
          issue: base_issue,
          github_repository_owner: base_repository.owner.login,
          github_repository_name: base_repository.name,
          github_token: 'test-token',
          user_public_key: 'test-public-key',
          project_item: { id: 'test-project-item' }
        })
      } catch (error) {
        // Expected to fail on config, not on parameter validation
        expect(error.message).to.not.include('project_item')
      }
    })

    it('should accept import_history_base_directory parameter', async () => {
      try {
        await process_single_github_issue({
          issue: base_issue,
          github_repository_owner: base_repository.owner.login,
          github_repository_name: base_repository.name,
          github_token: 'test-token',
          user_public_key: 'test-public-key',
          import_history_base_directory: '/tmp/test-import-history'
        })
      } catch (error) {
        expect(error.message).to.not.include('import_history_base_directory')
      }
    })

    it('should accept force parameter', async () => {
      try {
        await process_single_github_issue({
          issue: base_issue,
          github_repository_owner: base_repository.owner.login,
          github_repository_name: base_repository.name,
          github_token: 'test-token',
          user_public_key: 'test-public-key',
          force: true
        })
      } catch (error) {
        expect(error.message).to.not.include('force')
      }
    })

    it('should accept comments parameter', async () => {
      try {
        await process_single_github_issue({
          issue: base_issue,
          github_repository_owner: base_repository.owner.login,
          github_repository_name: base_repository.name,
          github_token: 'test-token',
          user_public_key: 'test-public-key',
          comments: [{ author: 'test', content: 'test comment' }]
        })
      } catch (error) {
        expect(error.message).to.not.include('comments')
      }
    })
  })
})
