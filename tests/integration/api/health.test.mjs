/* global describe it */
import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'

import server from '#server'

chai.use(chaiHttp)

describe('Health API', function () {
  this.timeout(10000)

  describe('GET /api/health', () => {
    it('should return 200 without authentication', async () => {
      const res = await chai.request(server).get('/api/health')

      expect(res).to.have.status(200)
    })

    it('should return expected JSON structure', async () => {
      const res = await chai.request(server).get('/api/health')

      expect(res.body).to.have.property('status', 'ok')
      expect(res.body).to.have.property('uptime_seconds').that.is.a('number')
      expect(res.body).to.have.property('memory').that.is.an('object')
      expect(res.body.memory).to.have.property('rss_mb').that.is.a('number')
      expect(res.body.memory).to.have.property('heap_used_mb').that.is.a('number')
      expect(res.body.memory).to.have.property('heap_total_mb').that.is.a('number')
      expect(res.body).to.have.property('watchers').that.is.an('object')
    })

    it('should include watcher status fields', async () => {
      const res = await chai.request(server).get('/api/health')
      const watchers = res.body.watchers

      expect(watchers).to.have.property('thread_watcher')
      expect(watchers).to.have.property('file_subscription_watcher')
      expect(watchers).to.have.property('git_status_watcher')
      expect(watchers).to.have.property('entity_file_watcher')
    })
  })
})
