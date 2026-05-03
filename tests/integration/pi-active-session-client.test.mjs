import { describe, it, beforeEach, afterEach, before, after } from 'mocha'
import { expect } from 'chai'
import http from 'node:http'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_PATH = path.resolve(
  __dirname,
  '../../../../../.pi/sync-extension/lib/active-session-client.ts'
)

const {
  register_session,
  update_session,
  unregister_session,
  __test_reset
} = await import(CLIENT_PATH)

const start_recording_server = () =>
  new Promise((resolve) => {
    const captured = []
    const server = http.createServer((req, res) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        captured.push({
          method: req.method,
          url: req.url,
          headers: { ...req.headers },
          body: Buffer.concat(chunks).toString('utf-8')
        })
        res.statusCode = 200
        res.end('{}')
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ server, port, captured })
    })
  })

const close_server = (server) =>
  new Promise((resolve) => server.close(() => resolve()))

const collect_logs = () => {
  const logs = []
  const log = (level, msg) => logs.push({ level, msg })
  return { logs, log }
}

describe('pi-extension active-session-client', function () {
  this.timeout(10000)

  let recorder
  let saved_key

  before(() => {
    saved_key = process.env.JOB_API_KEY
  })

  after(() => {
    if (saved_key === undefined) delete process.env.JOB_API_KEY
    else process.env.JOB_API_KEY = saved_key
  })

  beforeEach(async () => {
    __test_reset()
    recorder = await start_recording_server()
  })

  afterEach(async () => {
    await close_server(recorder.server)
  })

  it('localhost (127.0.0.1) sends no Authorization header', async () => {
    const { log } = collect_logs()
    const cfg = {
      base_api_urls: [`http://127.0.0.1:${recorder.port}`],
      job_api_key_env: 'JOB_API_KEY'
    }
    process.env.JOB_API_KEY = 'should-not-appear'

    await register_session(
      cfg,
      {
        session_id: 'sess-x-branch-0',
        working_directory: '/tmp/wd',
        transcript_path: '/tmp/sess.jsonl'
      },
      log
    )
    expect(recorder.captured).to.have.lengthOf(1)
    expect(recorder.captured[0].headers).to.not.have.property('authorization')
    expect(recorder.captured[0].method).to.equal('POST')
    expect(recorder.captured[0].url).to.equal('/api/active-sessions')
    const body = JSON.parse(recorder.captured[0].body)
    expect(body.session_id).to.equal('sess-x-branch-0')
  })

  it('non-localhost (0.0.0.0) sends Bearer header when JOB_API_KEY is set', async () => {
    const { log } = collect_logs()
    process.env.JOB_API_KEY = 'secret-key'
    const cfg = {
      base_api_urls: [`http://0.0.0.0:${recorder.port}`],
      job_api_key_env: 'JOB_API_KEY'
    }

    await update_session(
      cfg,
      {
        session_id: 'sess-x-branch-0',
        status: 'active',
        working_directory: '/tmp/wd',
        transcript_path: '/tmp/sess.jsonl'
      },
      log
    )

    expect(recorder.captured).to.have.lengthOf(1)
    expect(recorder.captured[0].headers.authorization).to.equal(
      'Bearer secret-key'
    )
    expect(recorder.captured[0].method).to.equal('PUT')
    expect(recorder.captured[0].url).to.equal(
      '/api/active-sessions/sess-x-branch-0'
    )
  })

  it('non-localhost is skipped with one-time warning when JOB_API_KEY is unset', async () => {
    delete process.env.JOB_API_KEY
    const { logs, log } = collect_logs()
    const cfg = {
      base_api_urls: [`http://0.0.0.0:${recorder.port}`],
      job_api_key_env: 'JOB_API_KEY'
    }

    await register_session(
      cfg,
      {
        session_id: 's1',
        working_directory: '/x',
        transcript_path: '/y'
      },
      log
    )
    await update_session(
      cfg,
      {
        session_id: 's1',
        status: 'active',
        working_directory: '/x',
        transcript_path: '/y'
      },
      log
    )
    await unregister_session(cfg, { session_id: 's1' }, log)

    // No requests should have hit the recording server.
    expect(recorder.captured).to.have.lengthOf(0)
    // Warning should fire exactly once for that URL.
    const warnings = logs.filter(
      (l) => l.level === 'warn' && l.msg.includes('JOB_API_KEY')
    )
    expect(warnings).to.have.lengthOf(1)
  })

  it('DELETE round-trips with localhost branch unauthenticated', async () => {
    const { log } = collect_logs()
    const cfg = {
      base_api_urls: [`http://127.0.0.1:${recorder.port}`],
      job_api_key_env: 'JOB_API_KEY'
    }
    await unregister_session(cfg, { session_id: 'sess-x-branch-0' }, log)
    expect(recorder.captured).to.have.lengthOf(1)
    expect(recorder.captured[0].method).to.equal('DELETE')
    expect(recorder.captured[0].headers).to.not.have.property('authorization')
  })
})
