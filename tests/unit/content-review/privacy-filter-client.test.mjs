import { expect } from 'chai'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import {
  _reset_for_tests,
  classify_text
} from '#libs-server/content-review/privacy-filter-client.mjs'

function start_stub_server(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port })
    })
  })
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve))
}

// Stub `base inference ensure privacy-filter` by shadowing PATH with a fake.
// We track invocations via a counter-file the stub appends to.

function make_stub_base({ counter_file }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-stub-'))
  const stub = path.join(dir, 'base')
  fs.writeFileSync(
    stub,
    `#!/usr/bin/env bash\necho ensured >> "${counter_file}"\nexit 0\n`,
    { mode: 0o755 }
  )
  return dir
}

describe('privacy-filter-client', function () {
  this.timeout(15000)

  let original_path
  let stub_dir
  let counter_file

  beforeEach(() => {
    _reset_for_tests()
    counter_file = path.join(os.tmpdir(), `pf-stub-counter-${Date.now()}-${Math.random()}.log`)
    fs.writeFileSync(counter_file, '')
    stub_dir = make_stub_base({ counter_file })
    original_path = process.env.PATH
    process.env.PATH = `${stub_dir}:${original_path}`
  })

  afterEach(() => {
    process.env.PATH = original_path
    try { fs.rmSync(stub_dir, { recursive: true, force: true }) } catch {}
    try { fs.unlinkSync(counter_file) } catch {}
  })

  function ensure_call_count() {
    const content = fs.readFileSync(counter_file, 'utf8')
    return content.split('\n').filter(Boolean).length
  }

  it('parses successful response and returns it', async () => {
    const { server, port } = await start_stub_server((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          spans: [{ label: 'private_email', text: 'a@b.com', start: 0, end: 7, score: 0.99 }],
          labels_found: ['private_email'],
          tokens: 5,
          truncated: false,
          latency_ms: 10,
          backend: 'mlx',
          model: 'm'
        })
      )
    })
    try {
      const out = await classify_text({ text: 'a@b.com', port })
      expect(out.labels_found).to.deep.equal(['private_email'])
      expect(out.spans).to.have.lengthOf(1)
      expect(out.truncated).to.equal(false)
    } finally {
      await close(server)
    }
  })

  it('dedupes ensure across concurrent first callers', async () => {
    const { server, port } = await start_stub_server((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ spans: [], labels_found: [], tokens: 0, latency_ms: 1, backend: 'mlx', model: 'm' }))
    })
    try {
      await Promise.all([
        classify_text({ text: 'a', port }),
        classify_text({ text: 'b', port }),
        classify_text({ text: 'c', port })
      ])
      // All three callers raced ensure_backend; only one shell-out should fire.
      expect(ensure_call_count()).to.equal(1)
    } finally {
      await close(server)
    }
  })

  it('only ensures the backend once across repeated calls', async () => {
    const { server, port } = await start_stub_server((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ spans: [], labels_found: [], tokens: 0, latency_ms: 1, backend: 'mlx', model: 'm' }))
    })
    try {
      await classify_text({ text: 'hi', port })
      await classify_text({ text: 'hi', port })
      await classify_text({ text: 'hi', port })
      expect(ensure_call_count()).to.equal(1)
    } finally {
      await close(server)
    }
  })

  it('retries once on ECONNREFUSED then succeeds', async () => {
    let attempts = 0
    let server
    const probe = await start_stub_server(() => {})
    const port = probe.port
    await close(probe.server)

    // Bind well after the 1s retry delay so the first attempt hits
    // ECONNREFUSED and the second attempt finds an open port.
    setTimeout(() => {
      server = http.createServer((req, res) => {
        attempts++
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({ spans: [], labels_found: [], tokens: 0, latency_ms: 1, backend: 'mlx', model: 'm' })
        )
      })
      server.listen(port, '127.0.0.1')
    }, 500)

    try {
      const out = await classify_text({ text: 'hi', port, timeout_ms: 8000 })
      expect(out.labels_found).to.deep.equal([])
      expect(attempts).to.equal(1)
    } finally {
      if (server) await close(server)
    }
  })

  it('throws when the server returns non-2xx', async () => {
    const { server, port } = await start_stub_server((req, res) => {
      res.statusCode = 500
      res.end('boom')
    })
    try {
      let threw = false
      try {
        await classify_text({ text: 'hi', port })
      } catch (err) {
        threw = true
        expect(err.message).to.match(/HTTP 500/)
      }
      expect(threw).to.be.true
    } finally {
      await close(server)
    }
  })

  it('aborts on timeout', async function () {
    this.timeout(10000)
    const sockets = new Set()
    const { server, port } = await start_stub_server(() => {})
    server.on('connection', (s) => {
      sockets.add(s)
      s.on('close', () => sockets.delete(s))
    })
    try {
      let threw = false
      try {
        await classify_text({ text: 'hi', port, timeout_ms: 100 })
      } catch (err) {
        threw = true
        expect(String(err)).to.match(/abort|AbortError|timeout/i)
      }
      expect(threw).to.be.true
    } finally {
      for (const s of sockets) s.destroy()
      await close(server)
    }
  })
})
