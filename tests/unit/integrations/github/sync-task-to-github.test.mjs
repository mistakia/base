import { expect } from 'chai'
import nock from 'nock'

import { sync_task_to_github } from '#libs-server/integrations/github/sync-task-to-github.mjs'
import config from '#config'

// nock intercepts Node.js http/https modules but cannot intercept Bun's native fetch
const is_bun = typeof globalThis.Bun !== 'undefined'

describe('sync_task_to_github', () => {
  const test_token = 'test-github-token'
  const test_project_config = {
    project_id: 'PVT_test123',
    status_field_id: 'PVTSSF_status_test',
    priority_field_id: 'PVTSSF_priority_test',
    status_options: {
      'In Progress': 'opt_in_progress',
      Completed: 'opt_completed',
      Abandoned: 'opt_abandoned',
      Planned: 'opt_planned'
    },
    priority_options: {
      None: 'opt_none',
      Low: 'opt_low',
      Medium: 'opt_medium',
      High: 'opt_high'
    }
  }

  let original_github_access_token
  let original_github_projects

  before(() => {
    original_github_access_token = config.github_access_token
    original_github_projects = config.github?.projects
  })

  beforeEach(() => {
    config.github_access_token = test_token
    if (!config.github) config.github = {}
    config.github.projects = {
      default: test_project_config,
      'test-owner/test-repo': test_project_config
    }
  })

  afterEach(() => {
    config.github_access_token = original_github_access_token
    if (config.github) {
      config.github.projects = original_github_projects
    }
    nock.cleanAll()
  })

  it('should skip when entity has no external_id', async () => {
    const result = await sync_task_to_github({
      entity_properties: { github_project_item_id: 'PVTI_test' },
      changed_fields: { status: 'In Progress' }
    })

    expect(result.skipped_reason).to.equal('no github external_id')
    expect(result.pushed_fields).to.have.lengthOf(0)
  })

  it('should skip when entity has no github_project_item_id', async () => {
    const result = await sync_task_to_github({
      entity_properties: { external_id: 'github:test-owner/test-repo#42' },
      changed_fields: { status: 'In Progress' }
    })

    expect(result.skipped_reason).to.equal('no github_project_item_id')
    expect(result.pushed_fields).to.have.lengthOf(0)
  })

  it('should skip when no github_access_token is configured', async () => {
    config.github_access_token = ''

    const result = await sync_task_to_github({
      entity_properties: {
        external_id: 'github:test-owner/test-repo#42',
        github_project_item_id: 'PVTI_test'
      },
      changed_fields: { status: 'In Progress' }
    })

    expect(result.skipped_reason).to.equal('no github_access_token configured')
  })

  it('should skip when external_id format is invalid', async () => {
    const result = await sync_task_to_github({
      entity_properties: {
        external_id: 'github:invalid-format',
        github_project_item_id: 'PVTI_test'
      },
      changed_fields: { status: 'In Progress' }
    })

    expect(result.skipped_reason).to.equal('could not parse external_id')
  })

  it('should skip when no project config is found', async () => {
    config.github.projects = {}

    const result = await sync_task_to_github({
      entity_properties: {
        external_id: 'github:unknown-owner/unknown-repo#42',
        github_project_item_id: 'PVTI_test'
      },
      changed_fields: { status: 'In Progress' }
    })

    expect(result.skipped_reason).to.equal('no project config found')
  })

  it('should map status to correct option ID and call update_github_project_item', async function () {
    if (is_bun) return this.skip()

    const graphql_scope = nock('https://api.github.com')
      .post('/graphql', (body) => {
        const input = body.variables?.input
        return (
          input?.projectId === 'PVT_test123' &&
          input?.itemId === 'PVTI_test' &&
          input?.fieldId === 'PVTSSF_status_test' &&
          input?.value?.singleSelectOptionId === 'opt_in_progress'
        )
      })
      .reply(200, {
        data: {
          updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_test' } }
        }
      })

    const result = await sync_task_to_github({
      entity_properties: {
        external_id: 'github:test-owner/test-repo#42',
        github_project_item_id: 'PVTI_test'
      },
      changed_fields: { status: 'In Progress' }
    })

    expect(result.pushed_fields).to.include('status')
    expect(result.errors).to.have.lengthOf(0)
    expect(graphql_scope.isDone()).to.be.true
  })

  it('should map priority to correct option ID', async function () {
    if (is_bun) return this.skip()
    const graphql_scope = nock('https://api.github.com')
      .post('/graphql', (body) => {
        const input = body.variables?.input
        return (
          input?.fieldId === 'PVTSSF_priority_test' &&
          input?.value?.singleSelectOptionId === 'opt_high'
        )
      })
      .reply(200, {
        data: {
          updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_test' } }
        }
      })

    const result = await sync_task_to_github({
      entity_properties: {
        external_id: 'github:test-owner/test-repo#42',
        github_project_item_id: 'PVTI_test'
      },
      changed_fields: { priority: 'High' }
    })

    expect(result.pushed_fields).to.include('priority')
    expect(graphql_scope.isDone()).to.be.true
  })

  it('should close issue when status is Completed', async function () {
    if (is_bun) return this.skip()
    const graphql_scope = nock('https://api.github.com')
      .post('/graphql')
      .reply(200, {
        data: {
          updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_test' } }
        }
      })

    const rest_scope = nock('https://api.github.com')
      .patch('/repos/test-owner/test-repo/issues/42', { state: 'closed' })
      .reply(200, { id: 1, state: 'closed' })

    const result = await sync_task_to_github({
      entity_properties: {
        external_id: 'github:test-owner/test-repo#42',
        github_project_item_id: 'PVTI_test'
      },
      changed_fields: { status: 'Completed' },
      previous_status: 'In Progress'
    })

    expect(result.pushed_fields).to.include('status')
    expect(result.pushed_fields).to.include('issue_state:closed')
    expect(graphql_scope.isDone()).to.be.true
    expect(rest_scope.isDone()).to.be.true
  })

  it('should close issue when status is Abandoned', async function () {
    if (is_bun) return this.skip()
    const graphql_scope = nock('https://api.github.com')
      .post('/graphql')
      .reply(200, {
        data: {
          updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_test' } }
        }
      })

    const rest_scope = nock('https://api.github.com')
      .patch('/repos/test-owner/test-repo/issues/42', { state: 'closed' })
      .reply(200, { id: 1, state: 'closed' })

    const result = await sync_task_to_github({
      entity_properties: {
        external_id: 'github:test-owner/test-repo#42',
        github_project_item_id: 'PVTI_test'
      },
      changed_fields: { status: 'Abandoned' },
      previous_status: 'In Progress'
    })

    expect(result.pushed_fields).to.include('issue_state:closed')
    expect(graphql_scope.isDone()).to.be.true
    expect(rest_scope.isDone()).to.be.true
  })

  it('should reopen issue when status changes from terminal to active', async function () {
    if (is_bun) return this.skip()
    const graphql_scope = nock('https://api.github.com')
      .post('/graphql')
      .reply(200, {
        data: {
          updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_test' } }
        }
      })

    const rest_scope = nock('https://api.github.com')
      .patch('/repos/test-owner/test-repo/issues/42', { state: 'open' })
      .reply(200, { id: 1, state: 'open' })

    const result = await sync_task_to_github({
      entity_properties: {
        external_id: 'github:test-owner/test-repo#42',
        github_project_item_id: 'PVTI_test'
      },
      changed_fields: { status: 'In Progress' },
      previous_status: 'Completed'
    })

    expect(result.pushed_fields).to.include('status')
    expect(result.pushed_fields).to.include('issue_state:open')
    expect(graphql_scope.isDone()).to.be.true
    expect(rest_scope.isDone()).to.be.true
  })

  it('should never throw even with invalid entity properties', async () => {
    // Verify the function returns a result object and never throws
    const result = await sync_task_to_github({
      entity_properties: null,
      changed_fields: { status: 'In Progress' }
    })

    expect(result).to.have.property('errors')
    expect(result).to.have.property('pushed_fields')
    expect(result.errors).to.have.length.greaterThan(0)
    expect(result.errors[0].field).to.equal('general')
  })

  it('should use default project config when repo-specific config not found', async function () {
    if (is_bun) return this.skip()
    config.github.projects = {
      default: test_project_config
    }

    const graphql_scope = nock('https://api.github.com')
      .post('/graphql', (body) => {
        const input = body.variables?.input
        return input?.projectId === 'PVT_test123'
      })
      .reply(200, {
        data: {
          updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_test' } }
        }
      })

    const result = await sync_task_to_github({
      entity_properties: {
        external_id: 'github:some-owner/some-repo#99',
        github_project_item_id: 'PVTI_test'
      },
      changed_fields: { status: 'In Progress' }
    })

    expect(result.pushed_fields).to.include('status')
    expect(graphql_scope.isDone()).to.be.true
  })

  it('should not close issue when transitioning between non-terminal statuses', async function () {
    if (is_bun) return this.skip()
    const graphql_scope = nock('https://api.github.com')
      .post('/graphql')
      .reply(200, {
        data: {
          updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_test' } }
        }
      })

    const result = await sync_task_to_github({
      entity_properties: {
        external_id: 'github:test-owner/test-repo#42',
        github_project_item_id: 'PVTI_test'
      },
      changed_fields: { status: 'In Progress' },
      previous_status: 'Planned'
    })

    expect(result.pushed_fields).to.include('status')
    expect(result.pushed_fields).to.not.include('issue_state:closed')
    expect(result.pushed_fields).to.not.include('issue_state:open')
    expect(graphql_scope.isDone()).to.be.true
  })
})
