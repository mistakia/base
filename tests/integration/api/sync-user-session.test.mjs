import { expect } from 'chai'

import server from '#server'
import { request } from '#tests/utils/test-request.mjs'
import {
  create_test_user,
  create_temp_test_repo,
  reset_all_tables
} from '#tests/utils/index.mjs'

describe('POST /api/threads/sync-user-session', () => {
  let test_user
  let test_directories

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
  })

  after(async () => {
    await reset_all_tables()
  })

  beforeEach(async () => {
    const test_repo = await create_temp_test_repo({
      prefix: 'sync-user-session-',
      register_directories: true
    })
    test_directories = {
      system_path: test_repo.system_path,
      user_path: test_repo.user_path,
      cleanup: test_repo.cleanup
    }
  })

  afterEach(async () => {
    if (test_directories) {
      test_directories.cleanup()
    }
  })

  it('should reject requests missing required fields', async () => {
    const res = await request(server)
      .post('/api/threads/sync-user-session')
      .send({})
    expect(res.status).to.equal(400)
    expect(res.body.error).to.equal('Missing required fields')
  })

  it('should reject requests with missing username', async () => {
    const res = await request(server)
      .post('/api/threads/sync-user-session')
      .send({
        transcript_path: '/home/node/.claude/projects/test/session.jsonl',
        user_public_key: test_user.user_public_key
      })
    expect(res.status).to.equal(400)
  })

  it('should reject requests with invalid user_public_key', async () => {
    const res = await request(server)
      .post('/api/threads/sync-user-session')
      .send({
        username: 'nonexistent-user',
        transcript_path: '/home/node/.claude/projects/test/session.jsonl',
        user_public_key: 'invalid-key-12345',
        hook_event_name: 'SessionEnd'
      })
    expect(res.status).to.equal(403)
    expect(res.body.error).to.equal('Access denied')
  })

  it('should reject when username does not match public key', async () => {
    const res = await request(server)
      .post('/api/threads/sync-user-session')
      .send({
        username: 'wrong-username',
        transcript_path: '/home/node/.claude/projects/test/session.jsonl',
        user_public_key: test_user.user_public_key,
        hook_event_name: 'SessionEnd'
      })
    expect(res.status).to.equal(403)
    expect(res.body.error).to.equal('Access denied')
  })
})
