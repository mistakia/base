/**
 * Lightweight HTTP test helper replacing chai-http.
 *
 * Provides a chainable API compatible with the existing test patterns:
 *   const res = await request(server).get('/api/foo').set('Authorization', 'Bearer x').query({ q: 'bar' })
 *   expect(res.status).to.equal(200)
 *
 * Each request starts the server on an ephemeral port, makes the request via
 * fetch(), and closes the server. This mirrors chai-http's behavior.
 */

class TestRequest {
  constructor(server, method, path) {
    this._server = server
    this._method = method
    this._path = path
    this._headers = {}
    this._query_params = []
    this._body = undefined
    this._follow_redirects = true
  }

  set(key, value) {
    this._headers[key] = value
    return this
  }

  query(obj) {
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          this._query_params.push([key, String(item)])
        }
      } else {
        this._query_params.push([key, String(value)])
      }
    }
    return this
  }

  send(body) {
    this._body = body
    return this
  }

  redirects(n) {
    if (n === 0) {
      this._follow_redirects = false
    }
    return this
  }

  then(resolve, reject) {
    return this._execute().then(resolve, reject)
  }

  async _execute() {
    // Increase max listeners to avoid warnings when many tests reuse the same server
    const prev_max = this._server.getMaxListeners()
    if (prev_max < 50) {
      this._server.setMaxListeners(50)
    }

    const listener = await new Promise((resolve, reject) => {
      const l = this._server.listen(0, '127.0.0.1', () => resolve(l))
      l.on('error', reject)
    })

    try {
      const { port } = listener.address()
      const url = new URL(this._path, `http://127.0.0.1:${port}`)
      for (const [key, value] of this._query_params) {
        url.searchParams.append(key, value)
      }

      const opts = {
        method: this._method,
        headers: { ...this._headers },
        redirect: this._follow_redirects ? 'follow' : 'manual'
      }

      if (this._body !== undefined) {
        if (!this._headers['Content-Type'] && !this._headers['content-type']) {
          opts.headers['Content-Type'] = 'application/json'
        }
        opts.body =
          typeof this._body === 'string'
            ? this._body
            : JSON.stringify(this._body)
      }

      const response = await fetch(url.toString(), opts)
      const text = await response.text()

      let body
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }

      // Build a headers object with lowercase keys for easy access
      const headers = {}
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') {
          headers[key] = value
        }
      })
      // Use getSetCookie() for reliable multi-value set-cookie handling in Bun
      const set_cookies = response.headers.getSetCookie?.() || []
      if (set_cookies.length > 0) {
        headers['set-cookie'] = set_cookies
      }

      return { status: response.status, body, text, headers }
    } finally {
      await new Promise((resolve) => listener.close(resolve))
    }
  }
}

export function request(server) {
  return {
    get: (path) => new TestRequest(server, 'GET', path),
    post: (path) => new TestRequest(server, 'POST', path),
    put: (path) => new TestRequest(server, 'PUT', path),
    patch: (path) => new TestRequest(server, 'PATCH', path),
    delete: (path) => new TestRequest(server, 'DELETE', path)
  }
}

export default request
