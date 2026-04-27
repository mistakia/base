import { expect } from 'chai'
import fs_sync, { promises as fs } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { analyze_content } from '#libs-server/content-review/analyze-content.mjs'
import { clear_review_config_cache } from '#libs-server/content-review/review-config.mjs'
import { clear_pattern_cache } from '#libs-server/content-review/pattern-scanner.mjs'
import { _reset_for_tests as reset_pf_client } from '#libs-server/content-review/privacy-filter-client.mjs'
import {
  clear_registered_directories,
  register_user_base_directory
} from '#libs-server/base-uri/base-directory-registry.mjs'

const PRIVACY_FILTER_PORT = 8102

function start_server({ port, handler }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler)
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

function close(server) {
  return new Promise((resolve) => server.close(resolve))
}

const MINIMAL_PATTERNS = {
  version: '1.0.0',
  categories: {
    pii: {
      description: 'pii',
      patterns: [
        { name: 'EMAIL', pattern: '\\b[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}\\b', description: 'email', flags: 'i' }
      ]
    }
  }
}

function make_stub_base(counter_file) {
  const dir = fs_sync.mkdtempSync(path.join(os.tmpdir(), 'pf-stub-'))
  const stub = path.join(dir, 'base')
  fs_sync.writeFileSync(
    stub,
    `#!/usr/bin/env bash\necho ensured >> "${counter_file}"\nexit 0\n`,
    { mode: 0o755 }
  )
  return dir
}

describe('analyze-content short-circuit', function () {
  this.timeout(15000)

  let temp_user_base
  let original_user_base
  let original_path
  let original_port_in_use
  let stub_dir
  let counter_file
  let pf_server

  beforeEach(async () => {
    // Skip if port 8102 already bound (real sidecar running)
    original_port_in_use = await new Promise((resolve) => {
      const probe = http.createServer(() => {})
      probe.once('error', () => resolve(true))
      probe.listen(PRIVACY_FILTER_PORT, '127.0.0.1', () => {
        probe.close(() => resolve(false))
      })
    })

    temp_user_base = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-analyze-'))
    await fs.mkdir(path.join(temp_user_base, 'config'), { recursive: true })
    await fs.writeFile(
      path.join(temp_user_base, 'config', 'sensitive-patterns.json'),
      JSON.stringify(MINIMAL_PATTERNS)
    )
    await fs.writeFile(
      path.join(temp_user_base, 'config', 'content-review-config.json'),
      JSON.stringify({
        privacy_filter: {
          enabled: true,
          score_threshold: 0.0,
          short_circuit_public: true,
          label_floor: { secret: 'private', private_email: 'private', private_person: 'acquaintance' }
        }
      })
    )

    original_user_base = process.env.USER_BASE_DIRECTORY
    process.env.USER_BASE_DIRECTORY = temp_user_base
    clear_registered_directories()
    register_user_base_directory(temp_user_base)

    counter_file = path.join(os.tmpdir(), `pf-counter-${Date.now()}-${Math.random()}.log`)
    fs_sync.writeFileSync(counter_file, '')
    stub_dir = make_stub_base(counter_file)
    original_path = process.env.PATH
    process.env.PATH = `${stub_dir}:${original_path}`

    clear_review_config_cache()
    clear_pattern_cache()
    reset_pf_client()
  })

  afterEach(async () => {
    if (pf_server) {
      await close(pf_server)
      pf_server = null
    }
    if (original_user_base != null) {
      process.env.USER_BASE_DIRECTORY = original_user_base
    } else {
      delete process.env.USER_BASE_DIRECTORY
    }
    process.env.PATH = original_path
    try { fs_sync.rmSync(stub_dir, { recursive: true, force: true }) } catch {}
    try { fs_sync.unlinkSync(counter_file) } catch {}
    if (temp_user_base) await fs.rm(temp_user_base, { recursive: true, force: true })
    clear_review_config_cache()
    clear_pattern_cache()
    reset_pf_client()
  })

  it('returns regex_filter_short_circuit when regex empty, filter empty, short_circuit on', async function () {
    if (original_port_in_use) return this.skip()

    pf_server = await start_server({
      port: PRIVACY_FILTER_PORT,
      handler: (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            spans: [],
            labels_found: [],
            tokens: 5,
            latency_ms: 1,
            backend: 'mlx',
            model: 'm'
          })
        )
      }
    })

    const file_path = path.join(temp_user_base, 'clean.txt')
    await fs.writeFile(file_path, 'clean content with no PII whatsoever')

    const result = await analyze_content({ file_path })
    expect(result.method).to.equal('regex_filter_short_circuit')
    expect(result.classification).to.equal('public')
    expect(result.llm_analysis).to.be.null
    expect(result.filter_result).to.be.an('object')
    expect(result.filter_result.labels_found).to.deep.equal([])
  })

  it('regex_only bypasses filter entirely', async function () {
    if (original_port_in_use) return this.skip()
    let filter_called = false
    pf_server = await start_server({
      port: PRIVACY_FILTER_PORT,
      handler: (req, res) => {
        filter_called = true
        res.end('{}')
      }
    })

    const file_path = path.join(temp_user_base, 'plain.txt')
    await fs.writeFile(file_path, 'just some plain content')
    const result = await analyze_content({ file_path, regex_only: true })
    expect(result.method).to.equal('regex_only')
    expect(filter_called).to.be.false
  })

  it('suppresses short-circuit when regex matches', async function () {
    if (original_port_in_use) return this.skip()
    pf_server = await start_server({
      port: PRIVACY_FILTER_PORT,
      handler: (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ spans: [], labels_found: [], tokens: 1, latency_ms: 1, backend: 'mlx', model: 'm' }))
      }
    })

    const file_path = path.join(temp_user_base, 'has-email.txt')
    await fs.writeFile(file_path, 'reach me at user@example.com')
    // Ollama will be unreachable; we expect llm_unavailable, NOT short-circuit.
    // Cap timeout so the test does not wait the default 180s.
    const result = await analyze_content({ file_path, timeout_ms: 500 })
    expect(result.method).to.not.equal('regex_filter_short_circuit')
    expect(result.regex_findings.length).to.be.greaterThan(0)
  })
})
