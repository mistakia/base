import { describe, it, beforeEach } from 'mocha'
import { expect } from 'chai'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_PATH = path.resolve(
  __dirname,
  '../../../../../.pi/sync-extension/lib/importer-client.ts'
)

const { enqueue_pi_import, __test_reset } = await import(CLIENT_PATH)

const make_args = ({ session_file, ms = 200, mark = '' }) => ({
  session_file,
  known_thread_id: 'thread-x',
  base_repo_path: process.cwd(),
  user_base_directory: '/tmp',
  __test_override: {
    command: 'node',
    args: [
      '-e',
      `process.stdout.write(${JSON.stringify(mark)});setTimeout(()=>process.exit(0), ${ms})`
    ]
  }
})

describe('pi-extension importer-client coalescing', function () {
  this.timeout(15000)

  beforeEach(() => {
    __test_reset()
  })

  it('first call spawns; second call while running is coalesced and pending', async () => {
    const session_file = '/tmp/coalesce-a.jsonl'
    const first = enqueue_pi_import(make_args({ session_file, ms: 300, mark: 'A' }))
    // Slight delay to ensure first is in-flight before the second arrives.
    await new Promise((r) => setTimeout(r, 30))
    const second_promise = enqueue_pi_import(
      make_args({ session_file, ms: 50, mark: 'B' })
    )
    const first_result = await first
    expect(first_result.coalesced).to.equal(false)
    expect(first_result.exit_code).to.equal(0)
    expect(first_result.stdout).to.equal('A')
    const second_result = await second_promise
    // Second resolves with `coalesced: true` once the first running tick resolves.
    expect(second_result.coalesced).to.equal(true)
  })

  it('drop-old: third call replaces the queued pending args', async () => {
    const session_file = '/tmp/coalesce-b.jsonl'
    const first = enqueue_pi_import(make_args({ session_file, ms: 400, mark: 'A' }))
    await new Promise((r) => setTimeout(r, 30))
    enqueue_pi_import(make_args({ session_file, ms: 50, mark: 'STALE' }))
    enqueue_pi_import(make_args({ session_file, ms: 50, mark: 'LATEST' }))
    await first
    // After the running entry resolves, pending should promote with the LATEST args
    // and run to completion. Wait by enqueueing a fresh tick after the queue drains.
    await new Promise((r) => setTimeout(r, 600))
    const followup = await enqueue_pi_import(
      make_args({ session_file, ms: 10, mark: 'POST' })
    )
    // Followup is a fresh enqueue (no running entry), so coalesced=false and stdout=POST.
    expect(followup.coalesced).to.equal(false)
    expect(followup.stdout).to.equal('POST')
  })

  it('different session_file keys do not coalesce', async () => {
    const a = enqueue_pi_import(
      make_args({ session_file: '/tmp/keya.jsonl', ms: 80, mark: 'A' })
    )
    const b = enqueue_pi_import(
      make_args({ session_file: '/tmp/keyb.jsonl', ms: 80, mark: 'B' })
    )
    const [ra, rb] = await Promise.all([a, b])
    expect(ra.coalesced).to.equal(false)
    expect(rb.coalesced).to.equal(false)
    expect(ra.stdout).to.equal('A')
    expect(rb.stdout).to.equal('B')
  })

  it('non-zero exit code is surfaced rather than thrown', async () => {
    const result = await enqueue_pi_import({
      session_file: '/tmp/exit-1.jsonl',
      known_thread_id: 'thread-x',
      base_repo_path: process.cwd(),
      user_base_directory: '/tmp',
      __test_override: {
        command: 'node',
        args: ['-e', 'process.exit(7)']
      }
    })
    expect(result.exit_code).to.equal(7)
    expect(result.coalesced).to.equal(false)
  })
})
