/* global describe it */
import chai from 'chai'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execute = promisify(exec)
const expect = chai.expect

const cli_path = path.resolve('./cli/base.mjs')

const run = (args) =>
  execute(`node ${cli_path} ${args}`, {
    cwd: path.resolve('.'),
    env: { ...process.env, NODE_ENV: 'test' },
    maxBuffer: 10 * 1024 * 1024
  })

describe('Thread timeline CLI', function () {
  this.timeout(30000)

  async function get_any_thread_id() {
    const { stdout } = await run('thread list --limit 1 --json')
    const threads = JSON.parse(stdout.trim())
    if (!Array.isArray(threads) || threads.length === 0) {
      return null
    }
    return threads[0].thread_id
  }

  it('should show human-readable output or an empty message by default', async function () {
    const thread_id = await get_any_thread_id()
    if (!thread_id) {
      this.skip()
    }

    const { stdout } = await run(`thread timeline ${thread_id}`)

    if (stdout.includes('No timeline entries found')) {
      return
    }

    const lines = stdout
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0)

    expect(lines.length).to.be.greaterThan(0)

    const first_line = lines[0]
    const parts = first_line.split('\t')

    // Expect timestamp, type/role, and truncated content columns
    expect(parts.length).to.be.at.least(2)
    expect(parts[0]).to.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('should respect --last slicing and default type filters', async function () {
    const thread_id = await get_any_thread_id()
    if (!thread_id) {
      this.skip()
    }

    const { stdout } = await run(`thread timeline ${thread_id} --last 1`)

    if (stdout.includes('No timeline entries found')) {
      return
    }

    const lines = stdout
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0)

    // At most one entry should be returned
    expect(lines.length).to.be.at.most(1)

    const first_line = lines[0]
    const parts = first_line.split('\t')
    const type_role = parts[1] || ''

    // Default type filter should show only messages or tool calls
    expect(type_role.startsWith('message:') || type_role.startsWith('tool:')).to
      .be.true
  })

  it('should return JSON output with --json and respect --limit', async function () {
    const thread_id = await get_any_thread_id()
    if (!thread_id) {
      this.skip()
    }

    const { stdout } = await run(
      `thread timeline ${thread_id} --limit 5 --json`
    )

    const timeline = JSON.parse(stdout.trim())
    expect(timeline).to.be.an('array')
    expect(timeline.length).to.be.at.most(5)
  })
})
