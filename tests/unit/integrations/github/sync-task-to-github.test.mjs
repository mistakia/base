import { expect } from 'chai'

import { sync_task_to_github } from '#libs-server/integrations/github/sync-task-to-github.mjs'
import config from '#config'

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

  it('should never throw even with invalid entity properties', async () => {
    const result = await sync_task_to_github({
      entity_properties: null,
      changed_fields: { status: 'In Progress' }
    })

    expect(result).to.have.property('errors')
    expect(result).to.have.property('pushed_fields')
    expect(result.errors).to.have.length.greaterThan(0)
    expect(result.errors[0].field).to.equal('general')
  })
})
