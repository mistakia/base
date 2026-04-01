/* global describe it */
import { expect } from 'chai'

import { request } from '#tests/utils/test-request.mjs'
import server from '#server'

describe('Health API', function () {
  this.timeout(10000)

  describe('GET /api/health', () => {
    it('should return 200 without authentication', async () => {
      const res = await request(server).get('/api/health')

      expect(res.status).to.equal(200)
    })

    it('should return expected JSON structure', async () => {
      const res = await request(server).get('/api/health')

      expect(res.body).to.have.property('status', 'ok')
      expect(res.body).to.have.property('uptime_seconds').that.is.a('number')
      expect(res.body).to.have.property('memory').that.is.an('object')
      expect(res.body.memory).to.have.property('rss_mb').that.is.a('number')
      expect(res.body.memory)
        .to.have.property('heap_used_mb')
        .that.is.a('number')
      expect(res.body.memory)
        .to.have.property('heap_total_mb')
        .that.is.a('number')
      expect(res.body).to.have.property('watchers').that.is.an('object')
    })

    it('should include watcher status fields', async () => {
      const res = await request(server).get('/api/health')
      const watchers = res.body.watchers

      expect(watchers).to.have.property('thread_watcher')
      expect(watchers).to.have.property('file_subscription_watcher')
      expect(watchers).to.have.property('git_status_watcher')
      expect(watchers).to.have.property('entity_file_watcher')
    })
  })
})
