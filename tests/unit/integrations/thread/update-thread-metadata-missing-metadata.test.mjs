import { expect } from 'chai'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import {
  update_thread_metadata,
  update_existing_thread
} from '#libs-server/integrations/thread/create-from-session.mjs'

const make_session = (thread_id) => ({
  session_id: 'sess-missing-meta-001',
  session_provider: 'claude',
  parse_mode: 'full',
  messages: [
    { role: 'user', content: 'please help' },
    { role: 'assistant', content: 'sure' }
  ],
  metadata: {
    start_time: '2026-04-10T00:00:00Z',
    end_time: '2026-04-10T00:01:00Z'
  }
})

describe('update_thread_metadata missing metadata.json bootstrap', function () {
  let thread_dir
  let thread_id

  beforeEach(async function () {
    thread_id = '3fb842ea-8233-596c-a146-2719c188810f'
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'thread-meta-missing-'))
    thread_dir = path.join(root, thread_id)
    await fs.mkdir(path.join(thread_dir, 'raw-data'), { recursive: true })
    await fs.writeFile(
      path.join(thread_dir, 'raw-data', 'claude-session.jsonl'),
      '{"type":"user","message":{"content":"please help"}}\n'
    )
  })

  afterEach(async function () {
    await fs.rm(path.dirname(thread_dir), { recursive: true, force: true })
  })

  it('bootstraps metadata.json when it does not exist', async function () {
    const changed = await update_thread_metadata(
      thread_dir,
      make_session(thread_id)
    )

    expect(changed).to.equal(true)

    const written = JSON.parse(
      await fs.readFile(path.join(thread_dir, 'metadata.json'), 'utf-8')
    )

    expect(written.thread_id).to.equal(thread_id)
    expect(written.source).to.be.an('object')
    expect(written.source.provider).to.equal('claude')
    expect(written.source.session_id).to.equal('sess-missing-meta-001')
    expect(written.updated_at).to.be.a('string')
    expect(written.message_count).to.be.a('number')
  })

  it('update_existing_thread produces metadata.json when previously missing', async function () {
    await update_existing_thread(make_session(thread_id), {
      thread_id,
      thread_dir
    })

    const exists = await fs
      .stat(path.join(thread_dir, 'metadata.json'))
      .then(() => true)
      .catch(() => false)
    expect(exists).to.equal(true)
  })
})
