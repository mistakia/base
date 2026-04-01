/* global describe it before after */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { v4 as uuid } from 'uuid'

const execute = promisify(exec)
const expect = chai.expect

const cli_path = path.resolve('./cli/base.mjs')

describe('Thread timeline CLI', function () {
  this.timeout(30000)

  let test_dir
  let thread_id

  before(async function () {
    // Create a self-contained temp directory to act as user_base_directory
    test_dir = path.join(os.tmpdir(), `base-test-timeline-${uuid()}`)
    thread_id = uuid()
    const thread_dir = path.join(test_dir, 'thread', thread_id)
    await fs.mkdir(thread_dir, { recursive: true })

    // Create metadata.json
    const metadata = {
      thread_id,
      title: 'Test thread for timeline CLI',
      thread_state: 'active',
      user_public_key: 'test-key',
      created_at: '2025-06-01T12:00:00.000Z',
      updated_at: '2025-06-01T12:05:00.000Z'
    }
    await fs.writeFile(
      path.join(thread_dir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    )

    // Create timeline.jsonl with sample entries
    const timeline_entries = [
      {
        type: 'message',
        role: 'user',
        content: 'Hello, this is a test message',
        timestamp: '2025-06-01T12:00:01.000Z'
      },
      {
        type: 'message',
        role: 'assistant',
        content: 'Hello, this is a test response',
        timestamp: '2025-06-01T12:00:02.000Z'
      },
      {
        type: 'tool_call',
        tool_name: 'Read',
        input: { file_path: '/tmp/test.txt' },
        timestamp: '2025-06-01T12:00:03.000Z'
      }
    ]
    const jsonl =
      timeline_entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
    await fs.writeFile(path.join(thread_dir, 'timeline.jsonl'), jsonl)
  })

  after(async function () {
    if (test_dir) {
      await fs.rm(test_dir, { recursive: true, force: true }).catch(() => {})
    }
  })

  const run = (args) =>
    execute(`bun ${cli_path} ${args} --user_base_directory "${test_dir}"`, {
      cwd: path.resolve('.'),
      env: { ...process.env, NODE_ENV: 'test' },
      maxBuffer: 10 * 1024 * 1024
    })

  it('should show human-readable output or an empty message by default', async function () {
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
    const { stdout } = await run(
      `thread timeline ${thread_id} --limit 5 --json`
    )

    const timeline = JSON.parse(stdout.trim())
    expect(timeline).to.be.an('array')
    expect(timeline.length).to.be.at.most(5)
  })
})
