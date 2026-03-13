/* global describe it before beforeEach afterEach */
import chai from 'chai'
import chaiHttp from 'chai-http'
import nock from 'nock'

import server from '#server'
import {
  create_test_user,
  setup_api_test_registry,
  create_auth_token
} from '#tests/utils/index.mjs'
import create_test_task from '#tests/utils/create-test-task.mjs'
import reset_all_tables from '#tests/utils/reset-all-tables.mjs'
import config from '#config'
import { TASK_STATUS } from '#libs-shared/task-constants.mjs'

chai.should()
chai.use(chaiHttp)

describe('API /tasks PATCH - GitHub sync', () => {
  let owner_user
  let test_directories
  let registry_cleanup
  let original_github_access_token
  let original_github_projects

  before(async () => {
    await reset_all_tables()
    owner_user = await create_test_user()
    owner_user.jwt_token = create_auth_token(owner_user)

    original_github_access_token = config.github_access_token
    original_github_projects = config.github?.projects
  })

  after(() => {
    config.github_access_token = original_github_access_token
    if (config.github) {
      config.github.projects = original_github_projects
    }
  })

  beforeEach(() => {
    if (!config.github) config.github = {}
    config.github_access_token = 'test-token'
    config.github.projects = {
      default: {
        project_id: 'PVT_test',
        status_field_id: 'PVTSSF_status',
        priority_field_id: 'PVTSSF_priority',
        status_options: {
          'No status': 'opt_no_status',
          'In Progress': 'opt_in_progress',
          Completed: 'opt_completed'
        },
        priority_options: {
          None: 'opt_none',
          High: 'opt_high'
        }
      }
    }
  })

  afterEach(() => {
    if (registry_cleanup) {
      registry_cleanup()
      registry_cleanup = null
    }
    if (test_directories && test_directories.cleanup) {
      test_directories.cleanup()
      test_directories = null
    }
    nock.cleanAll()
  })

  it('should trigger sync when updating status on a GitHub-linked task', async () => {
    const { base_uri, test_directories: dirs } = await create_test_task({
      user_public_key: owner_user.user_public_key,
      title: 'GitHub Sync Test',
      status: TASK_STATUS.NO_STATUS,
      external_id: 'github:test-owner/test-repo#42',
      github_project_item_id: 'PVTI_test_item'
    })
    test_directories = dirs

    registry_cleanup = setup_api_test_registry({
      system_base_directory: dirs.system_path,
      user_base_directory: dirs.user_path
    })

    const graphql_scope = nock('https://api.github.com')
      .post('/graphql')
      .reply(200, {
        data: {
          updateProjectV2ItemFieldValue: {
            projectV2Item: { id: 'PVTI_test_item' }
          }
        }
      })

    const res = await chai
      .request(server)
      .patch('/api/tasks')
      .set('Authorization', `Bearer ${owner_user.jwt_token}`)
      .send({
        base_uri,
        properties: { status: TASK_STATUS.IN_PROGRESS }
      })

    res.should.have.status(200)
    res.body.should.have.property('success', true)

    // Sync fires after response (fire-and-forget), wait briefly for it to complete
    await new Promise((resolve) => setTimeout(resolve, 200))

    // GraphQL call should have been made for project field update
    graphql_scope.isDone().should.be.true
  })

  it('should not trigger sync when updating status on a non-GitHub task', async () => {
    const { base_uri, test_directories: dirs } = await create_test_task({
      user_public_key: owner_user.user_public_key,
      title: 'Non-GitHub Task',
      status: TASK_STATUS.NO_STATUS
    })
    test_directories = dirs

    registry_cleanup = setup_api_test_registry({
      system_base_directory: dirs.system_path,
      user_base_directory: dirs.user_path
    })

    // No nock interceptor set up - if any GitHub API call is made, nock will complain
    const res = await chai
      .request(server)
      .patch('/api/tasks')
      .set('Authorization', `Bearer ${owner_user.jwt_token}`)
      .send({
        base_uri,
        properties: { status: TASK_STATUS.IN_PROGRESS }
      })

    res.should.have.status(200)
    res.body.should.have.property('success', true)
  })

  it('should skip sync when no_sync flag is set in request body', async () => {
    const { base_uri, test_directories: dirs } = await create_test_task({
      user_public_key: owner_user.user_public_key,
      title: 'No Sync Test',
      status: TASK_STATUS.NO_STATUS,
      external_id: 'github:test-owner/test-repo#99',
      github_project_item_id: 'PVTI_no_sync'
    })
    test_directories = dirs

    registry_cleanup = setup_api_test_registry({
      system_base_directory: dirs.system_path,
      user_base_directory: dirs.user_path
    })

    // No nock interceptor - if sync runs, it would make a real HTTP call
    const res = await chai
      .request(server)
      .patch('/api/tasks')
      .set('Authorization', `Bearer ${owner_user.jwt_token}`)
      .send({
        base_uri,
        properties: { status: TASK_STATUS.IN_PROGRESS },
        no_sync: true
      })

    res.should.have.status(200)
    res.body.should.have.property('success', true)
  })
})
