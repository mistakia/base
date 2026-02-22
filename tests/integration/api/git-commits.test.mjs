import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'
import path from 'path'
import fs from 'fs/promises'
import { promisify } from 'util'
import child_process from 'child_process'
import crypto from 'crypto'

import server from '#server'
import user_registry from '#libs-server/users/user-registry.mjs'
import create_user from '#libs-server/users/create-user.mjs'
import {
  reset_all_tables,
  create_temp_test_repo,
  authenticate_request,
  setup_api_test_registry
} from '#tests/utils/index.mjs'

chai.use(chaiHttp)

const exec = promisify(child_process.exec)

describe('Git Commits API', function () {
  this.timeout(15000)

  let test_user
  let test_repo
  let registry_cleanup

  before(async () => {
    await reset_all_tables()

    test_repo = await create_temp_test_repo()

    registry_cleanup = setup_api_test_registry({
      system_base_directory: test_repo.system_path,
      user_base_directory: test_repo.user_path
    })

    test_user = await create_user({
      username: `test_commits_${Math.floor(Math.random() * 10000)}`,
      user_private_key: crypto.randomBytes(32),
      permissions: { global_write: true }
    })
    user_registry._clear_cache()

    // Commit the identity file
    await exec('git add identity/', { cwd: test_repo.user_path })
    await exec('git commit -m "Add test identity"', {
      cwd: test_repo.user_path
    })

    // Create additional commits for testing
    for (let i = 1; i <= 5; i++) {
      await fs.writeFile(
        path.join(test_repo.user_path, `test-file-${i}.txt`),
        `content ${i}`
      )
      await exec(`git add test-file-${i}.txt`, { cwd: test_repo.user_path })
      await exec(`git commit -m "Test commit ${i}"`, {
        cwd: test_repo.user_path
      })
    }
  })

  after(async () => {
    if (registry_cleanup) {
      registry_cleanup()
    }
    if (test_repo && test_repo.cleanup) {
      test_repo.cleanup()
    }
    await reset_all_tables()
  })

  describe('GET /api/git/commits', () => {
    it('should return commit list for root repo (empty path)', async () => {
      const res = await authenticate_request(
        chai
          .request(server)
          .get('/api/git/commits')
          .query({ path: '' }),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body).to.have.property('commits')
      expect(res.body).to.have.property('has_more')
      expect(res.body).to.have.property('repo_name')
      expect(res.body).to.have.property('branch')
      expect(res.body.commits).to.be.an('array')
      expect(res.body.commits.length).to.be.greaterThan(0)

      const commit = res.body.commits[0]
      expect(commit).to.have.property('hash')
      expect(commit).to.have.property('short_hash')
      expect(commit).to.have.property('subject')
      expect(commit).to.have.property('date')
    })

    it('should return commits when no path param provided', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/git/commits'),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body.commits).to.be.an('array')
      expect(res.body.commits.length).to.be.greaterThan(0)
    })

    it('should respect limit parameter', async () => {
      const res = await authenticate_request(
        chai
          .request(server)
          .get('/api/git/commits')
          .query({ path: '', limit: 2 }),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body.commits.length).to.equal(2)
      expect(res.body.has_more).to.be.true
      expect(res.body.next_cursor).to.be.a('string')
    })

    it('should paginate using before cursor', async () => {
      const first_page = await authenticate_request(
        chai
          .request(server)
          .get('/api/git/commits')
          .query({ path: '', limit: 3 }),
        test_user
      )

      expect(first_page).to.have.status(200)
      const cursor = first_page.body.next_cursor

      const second_page = await authenticate_request(
        chai
          .request(server)
          .get('/api/git/commits')
          .query({ path: '', limit: 3, before: cursor }),
        test_user
      )

      expect(second_page).to.have.status(200)
      expect(second_page.body.commits).to.be.an('array')
      const first_page_hashes = first_page.body.commits.map((c) => c.hash)
      const second_page_hashes = second_page.body.commits.map((c) => c.hash)
      const overlap = second_page_hashes.filter((h) =>
        first_page_hashes.includes(h)
      )
      expect(overlap).to.have.lengthOf(0)
    })

    it('should return 400 for path outside base directory', async () => {
      const res = await authenticate_request(
        chai
          .request(server)
          .get('/api/git/commits')
          .query({ path: '../../../etc' }),
        test_user
      )

      expect(res).to.have.status(400)
      expect(res.body).to.have.property('error')
    })
  })

  describe('GET /api/git/commit/:hash', () => {
    it('should return commit detail with files', async () => {
      const list_res = await authenticate_request(
        chai
          .request(server)
          .get('/api/git/commits')
          .query({ path: '', limit: 1 }),
        test_user
      )
      const hash = list_res.body.commits[0].hash

      const res = await authenticate_request(
        chai
          .request(server)
          .get(`/api/git/commit/${hash}`)
          .query({ path: '' }),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body).to.have.property('hash')
      expect(res.body).to.have.property('short_hash')
      expect(res.body).to.have.property('subject')
      expect(res.body).to.have.property('date')
      expect(res.body).to.have.property('author_name')
      expect(res.body).to.have.property('files')
      expect(res.body.files).to.be.an('array')
      expect(res.body).to.have.property('diff')
    })

    it('should return 400 for invalid hash', async () => {
      const res = await authenticate_request(
        chai
          .request(server)
          .get('/api/git/commit/not-a-hash')
          .query({ path: '' }),
        test_user
      )

      expect(res).to.have.status(400)
      expect(res.body).to.have.property('error')
    })
  })
})
