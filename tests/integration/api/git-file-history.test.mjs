import { expect } from 'chai'
import path from 'path'
import fs from 'fs/promises'
import { promisify } from 'util'
import child_process from 'child_process'
import crypto from 'crypto'

import server from '#server'
import { request } from '#tests/utils/test-request.mjs'
import user_registry from '#libs-server/users/user-registry.mjs'
import create_user from '#libs-server/users/create-user.mjs'
import {
  reset_all_tables,
  create_temp_test_repo,
  authenticate_request,
  setup_api_test_registry
} from '#tests/utils/index.mjs'
import { FILE_HISTORY_PATCH_MAX_BYTES } from '#libs-server/git/repo-statistics.mjs'

const exec = promisify(child_process.exec)

describe('Git File History API', function () {
  this.timeout(20000)

  let test_user
  let test_repo
  let registry_cleanup

  const file_v1 = 'docs/original.md'
  const file_v2 = 'docs/renamed.md'
  const binary_file = 'assets/blob.bin'
  const huge_file = 'docs/huge.md'

  before(async () => {
    await reset_all_tables()

    test_repo = await create_temp_test_repo()

    registry_cleanup = setup_api_test_registry({
      system_base_directory: test_repo.system_path,
      user_base_directory: test_repo.user_path
    })

    test_user = await create_user({
      username: `test_file_history_${Math.floor(Math.random() * 10000)}`,
      user_private_key: crypto.randomBytes(32),
      permissions: { global_write: true }
    })
    user_registry._clear_cache()

    await exec('git add identity/', { cwd: test_repo.user_path })
    await exec('git commit -m "Add test identity"', {
      cwd: test_repo.user_path
    })

    // Create file v1
    await fs.mkdir(path.join(test_repo.user_path, 'docs'), { recursive: true })
    await fs.writeFile(
      path.join(test_repo.user_path, file_v1),
      '# Original\n\nfirst version\n'
    )
    await exec(`git add ${file_v1}`, { cwd: test_repo.user_path })
    await exec('git commit -m "Add original docs"', {
      cwd: test_repo.user_path
    })

    // Modify file
    await fs.writeFile(
      path.join(test_repo.user_path, file_v1),
      '# Original\n\nfirst version\nadded line\n'
    )
    await exec(`git add ${file_v1}`, { cwd: test_repo.user_path })
    await exec('git commit -m "Update original docs"', {
      cwd: test_repo.user_path
    })

    // Rename file
    await exec(`git mv ${file_v1} ${file_v2}`, { cwd: test_repo.user_path })
    await exec('git commit -m "Rename docs"', { cwd: test_repo.user_path })

    // Modify renamed file again
    await fs.writeFile(
      path.join(test_repo.user_path, file_v2),
      '# Renamed\n\nfirst version\nadded line\npost-rename edit\n'
    )
    await exec(`git add ${file_v2}`, { cwd: test_repo.user_path })
    await exec('git commit -m "Post-rename edit"', {
      cwd: test_repo.user_path
    })

    // Binary file
    await fs.mkdir(path.join(test_repo.user_path, 'assets'), {
      recursive: true
    })
    const binary_bytes = Buffer.from([0, 1, 2, 3, 255, 254, 253, 0, 0, 42])
    await fs.writeFile(path.join(test_repo.user_path, binary_file), binary_bytes)
    await exec(`git add ${binary_file}`, { cwd: test_repo.user_path })
    await exec('git commit -m "Add binary"', { cwd: test_repo.user_path })

    // Huge text file to trigger truncation
    const huge_content =
      '# Huge\n\n' + 'x'.repeat(FILE_HISTORY_PATCH_MAX_BYTES + 2048) + '\n'
    await fs.writeFile(path.join(test_repo.user_path, huge_file), huge_content)
    await exec(`git add ${huge_file}`, { cwd: test_repo.user_path })
    await exec('git commit -m "Add huge file"', { cwd: test_repo.user_path })
  })

  after(async () => {
    if (registry_cleanup) registry_cleanup()
    if (test_repo && test_repo.cleanup) test_repo.cleanup()
    await reset_all_tables()
  })

  describe('GET /api/git/file-history', () => {
    it('returns 400 when base_uri is missing', async () => {
      const res = await authenticate_request(
        request(server).get('/api/git/file-history'),
        test_user
      )
      expect(res.status).to.equal(400)
      expect(res.body).to.have.property('error')
    })

    it('returns 400 for malformed base_uri', async () => {
      const res = await authenticate_request(
        request(server)
          .get('/api/git/file-history')
          .query({ base_uri: 'not-a-uri' }),
        test_user
      )
      expect(res.status).to.equal(400)
    })

    it('returns commits across a rename in reverse chronological order', async () => {
      const res = await authenticate_request(
        request(server)
          .get('/api/git/file-history')
          .query({ base_uri: `user:${file_v2}` }),
        test_user
      )

      expect(res.status).to.equal(200)
      expect(res.body).to.have.property('commits').that.is.an('array')
      expect(res.body).to.have.property('base_uri', `user:${file_v2}`)
      expect(res.body).to.have.property('branch')
      expect(res.body).to.have.property('total_count')
      expect(res.body.commits.length).to.be.greaterThan(2)

      // Reverse chronological: first commit is the most recent (post-rename edit)
      const subjects = res.body.commits.map((c) => c.subject)
      expect(subjects[0]).to.equal('Post-rename edit')

      // Path at commit changes across rename boundary
      const paths_at_commit = res.body.commits.map((c) => c.path_at_commit)
      expect(paths_at_commit).to.include(file_v2)
      expect(paths_at_commit).to.include(file_v1)
    })

    it('reports binary files with is_binary true and empty diff', async () => {
      const res = await authenticate_request(
        request(server)
          .get('/api/git/file-history')
          .query({ base_uri: `user:${binary_file}` }),
        test_user
      )

      expect(res.status).to.equal(200)
      const latest = res.body.commits[0]
      expect(latest).to.have.property('is_binary', true)
      expect(latest.diff).to.equal('')
    })

    it('truncates oversized patches and sets truncated flag', async () => {
      const res = await authenticate_request(
        request(server)
          .get('/api/git/file-history')
          .query({ base_uri: `user:${huge_file}` }),
        test_user
      )

      expect(res.status).to.equal(200)
      const latest = res.body.commits[0]
      expect(latest).to.have.property('truncated', true)
      expect(latest.diff.length).to.equal(FILE_HISTORY_PATCH_MAX_BYTES)
    })

    it('respects limit and page parameters', async () => {
      const first = await authenticate_request(
        request(server)
          .get('/api/git/file-history')
          .query({ base_uri: `user:${file_v2}`, limit: 1, page: 1 }),
        test_user
      )

      expect(first.status).to.equal(200)
      expect(first.body.commits.length).to.equal(1)
      expect(first.body.per_page).to.equal(1)
      expect(first.body.page).to.equal(1)
      expect(first.body.total_count).to.be.greaterThan(1)

      const second = await authenticate_request(
        request(server)
          .get('/api/git/file-history')
          .query({ base_uri: `user:${file_v2}`, limit: 1, page: 2 }),
        test_user
      )

      expect(second.status).to.equal(200)
      expect(second.body.commits.length).to.equal(1)
      expect(second.body.commits[0].hash).to.not.equal(
        first.body.commits[0].hash
      )
    })
  })
})
