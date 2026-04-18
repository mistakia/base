import { expect } from 'chai'
import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const MANIFEST_PATH = join(homedir(), 'claude-source-pool', 'manifest.json')

const EPHEMERAL_PREFIXES = ['/tmp/', '/var/tmp/']

const ALLOWED_PREFIXES_BY_HOST = {
  local: ['/Users/', '/home/'],
  storage: ['/mnt/md0/']
}

describe('claude-source-pool manifest durable paths', function () {
  before(function () {
    if (!existsSync(MANIFEST_PATH)) {
      this.skip()
    }
  })

  it('every pool root lives on a durable prefix for its host', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    expect(manifest.pools).to.be.an('array').and.not.empty

    for (const pool of manifest.pools) {
      expect(pool).to.have.property('name').that.is.a('string')
      expect(pool).to.have.property('host').that.is.a('string')
      expect(pool).to.have.property('root').that.is.a('string')

      for (const prefix of EPHEMERAL_PREFIXES) {
        expect(
          pool.root.startsWith(prefix),
          `${pool.name}: root ${pool.root} is on ephemeral prefix ${prefix}`
        ).to.equal(false)
      }

      const allowed = ALLOWED_PREFIXES_BY_HOST[pool.host]
      expect(
        allowed,
        `${pool.name}: host "${pool.host}" has no allowed-prefix policy`
      ).to.be.an('array')

      const on_allowed = allowed.some((p) => pool.root.startsWith(p))
      expect(
        on_allowed,
        `${pool.name}: root ${pool.root} does not start with any allowed prefix for host ${pool.host} (${allowed.join(', ')})`
      ).to.equal(true)
    }
  })
})
