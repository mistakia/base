import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'
import path from 'path'
import fs from 'fs/promises'
import { promisify } from 'util'
import child_process from 'child_process'

import server from '#server'
import {
  reset_all_tables,
  create_test_user,
  create_temp_test_repo,
  authenticate_request,
  setup_api_test_registry
} from '#tests/utils/index.mjs'

chai.use(chaiHttp)

const exec = promisify(child_process.exec)

describe('Git API', () => {
  let test_user
  let test_repo
  let registry_cleanup

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()

    // Set up temporary repo for git operations
    test_repo = await create_temp_test_repo()

    // Setup registry for API calls
    registry_cleanup = setup_api_test_registry({
      system_base_directory: test_repo.system_path,
      user_base_directory: test_repo.user_path
    })
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

  describe('GET /api/git/status', () => {
    it('should return status for a clean repository', async () => {
      const res = await authenticate_request(
        chai
          .request(server)
          .get('/api/git/status')
          .query({ repo_path: test_repo.user_path }),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body).to.be.an('object')
      expect(res.body.branch).to.equal('main')
      expect(res.body.staged).to.be.an('array')
      expect(res.body.unstaged).to.be.an('array')
      expect(res.body.untracked).to.be.an('array')
    })

    it('should detect untracked files', async () => {
      // Create an untracked file
      const untracked_file = path.join(test_repo.user_path, 'untracked.txt')
      await fs.writeFile(untracked_file, 'untracked content')

      const res = await authenticate_request(
        chai
          .request(server)
          .get('/api/git/status')
          .query({ repo_path: test_repo.user_path }),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body.untracked).to.include('untracked.txt')

      // Clean up
      await fs.unlink(untracked_file)
    })

    it('should detect modified files', async () => {
      // Modify an existing file
      const readme_path = path.join(test_repo.user_path, 'README.md')
      await fs.writeFile(readme_path, '# Modified README')

      const res = await authenticate_request(
        chai
          .request(server)
          .get('/api/git/status')
          .query({ repo_path: test_repo.user_path }),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body.unstaged).to.be.an('array')
      expect(res.body.unstaged.some((f) => f.path === 'README.md')).to.be.true

      // Reset the file
      await exec('git checkout -- README.md', { cwd: test_repo.user_path })
    })

    it('should return 400 for missing repo_path', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/git/status'),
        test_user
      )

      expect(res).to.have.status(400)
      expect(res.body).to.have.property('error')
    })

    it('should return 400 for invalid repo_path', async () => {
      const res = await authenticate_request(
        chai
          .request(server)
          .get('/api/git/status')
          .query({ repo_path: '/nonexistent/path' }),
        test_user
      )

      expect(res).to.have.status(400)
      expect(res.body).to.have.property('error')
    })
  })

  describe('POST /api/git/stage', () => {
    it('should stage files', async () => {
      // Create a file to stage
      const test_file = path.join(test_repo.user_path, 'to-stage.txt')
      await fs.writeFile(test_file, 'content to stage')

      const res = await authenticate_request(
        chai
          .request(server)
          .post('/api/git/stage')
          .send({
            repo_path: test_repo.user_path,
            files: ['to-stage.txt']
          }),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body.success).to.be.true

      // Verify file is staged
      const status_res = await authenticate_request(
        chai
          .request(server)
          .get('/api/git/status')
          .query({ repo_path: test_repo.user_path }),
        test_user
      )

      expect(status_res.body.staged).to.be.an('array')
      expect(status_res.body.staged.some((f) => f.path === 'to-stage.txt')).to
        .be.true

      // Clean up
      await exec('git reset HEAD to-stage.txt', { cwd: test_repo.user_path })
      await fs.unlink(test_file)
    })

    it('should return 400 for missing files', async () => {
      const res = await authenticate_request(
        chai.request(server).post('/api/git/stage').send({
          repo_path: test_repo.user_path
        }),
        test_user
      )

      expect(res).to.have.status(400)
      expect(res.body).to.have.property('error')
    })
  })

  describe('POST /api/git/unstage', () => {
    it('should unstage files', async () => {
      // Create and stage a file
      const test_file = path.join(test_repo.user_path, 'to-unstage.txt')
      await fs.writeFile(test_file, 'content to unstage')
      await exec('git add to-unstage.txt', { cwd: test_repo.user_path })

      const res = await authenticate_request(
        chai
          .request(server)
          .post('/api/git/unstage')
          .send({
            repo_path: test_repo.user_path,
            files: ['to-unstage.txt']
          }),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body.success).to.be.true

      // Verify file is no longer staged
      const status_res = await authenticate_request(
        chai
          .request(server)
          .get('/api/git/status')
          .query({ repo_path: test_repo.user_path }),
        test_user
      )

      expect(status_res.body.staged.some((f) => f.path === 'to-unstage.txt')).to
        .be.false
      expect(status_res.body.untracked).to.include('to-unstage.txt')

      // Clean up
      await fs.unlink(test_file)
    })
  })

  describe('POST /api/git/commit', () => {
    it('should commit staged changes', async () => {
      // Create and stage a file
      const test_file = path.join(test_repo.user_path, 'to-commit.txt')
      await fs.writeFile(test_file, 'content to commit')
      await exec('git add to-commit.txt', { cwd: test_repo.user_path })

      const res = await authenticate_request(
        chai.request(server).post('/api/git/commit').send({
          repo_path: test_repo.user_path,
          message: 'Test commit message'
        }),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body.success).to.be.true

      // Verify file is no longer in status
      const status_res = await authenticate_request(
        chai
          .request(server)
          .get('/api/git/status')
          .query({ repo_path: test_repo.user_path }),
        test_user
      )

      expect(status_res.body.staged).to.have.length(0)
      expect(status_res.body.untracked).to.not.include('to-commit.txt')
    })

    it('should return 400 for missing message', async () => {
      const res = await authenticate_request(
        chai.request(server).post('/api/git/commit').send({
          repo_path: test_repo.user_path
        }),
        test_user
      )

      expect(res).to.have.status(400)
      expect(res.body).to.have.property('error')
    })
  })

  describe('GET /api/git/diff', () => {
    it('should return diff for modified file', async () => {
      // Modify a tracked file
      const readme_path = path.join(test_repo.user_path, 'README.md')
      const original_content = await fs.readFile(readme_path, 'utf-8')
      await fs.writeFile(readme_path, '# Changed README\n\nNew content added')

      const res = await authenticate_request(
        chai.request(server).get('/api/git/diff').query({
          repo_path: test_repo.user_path,
          file_path: 'README.md'
        }),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body).to.be.an('object')
      expect(res.body.diff).to.be.a('string')
      expect(res.body.diff).to.include('Changed README')

      // Reset the file
      await fs.writeFile(readme_path, original_content)
    })

    it('should return empty diff for unmodified file', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/git/diff').query({
          repo_path: test_repo.user_path
        }),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body.diff).to.equal('')
    })
  })

  describe('GET /api/git/status/all', () => {
    it('should return status for all known repositories', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/git/status/all'),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body).to.be.an('object')
      expect(res.body.repos).to.be.an('array')
    })
  })

  describe('GET /api/git/file-at-ref', () => {
    it('should return file content at HEAD', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/git/file-at-ref').query({
          repo_path: test_repo.user_path,
          file_path: 'README.md'
        }),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body).to.be.an('object')
      expect(res.body.content).to.be.a('string')
      expect(res.body.file_path).to.equal('README.md')
      expect(res.body.is_redacted).to.equal(false)
      expect(res.body.is_new_file).to.equal(false)
    })

    it('should return file content at specific ref', async () => {
      // Modify and commit a file to create history
      const readme_path = path.join(test_repo.user_path, 'README.md')
      await fs.writeFile(readme_path, '# New Version')
      await exec('git add README.md', { cwd: test_repo.user_path })
      await exec('git commit -m "Update README"', { cwd: test_repo.user_path })

      // Get content at HEAD~1
      const res = await authenticate_request(
        chai.request(server).get('/api/git/file-at-ref').query({
          repo_path: test_repo.user_path,
          file_path: 'README.md',
          ref: 'HEAD~1'
        }),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body.content).to.not.equal('# New Version')

      // Verify current HEAD has new content
      const head_res = await authenticate_request(
        chai.request(server).get('/api/git/file-at-ref').query({
          repo_path: test_repo.user_path,
          file_path: 'README.md',
          ref: 'HEAD'
        }),
        test_user
      )

      expect(head_res.body.content).to.equal('# New Version')
    })

    it('should return 400 for missing file_path', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/git/file-at-ref').query({
          repo_path: test_repo.user_path
        }),
        test_user
      )

      expect(res).to.have.status(400)
      expect(res.body).to.have.property('error')
    })

    it('should return empty content for non-existent file (new file)', async () => {
      const res = await authenticate_request(
        chai.request(server).get('/api/git/file-at-ref').query({
          repo_path: test_repo.user_path,
          file_path: 'non-existent-file.txt'
        }),
        test_user
      )

      expect(res).to.have.status(200)
      expect(res.body.content).to.equal('')
      expect(res.body.is_new_file).to.equal(true)
      expect(res.body.is_redacted).to.equal(false)
    })
  })

  describe('Authentication', () => {
    it('should return 401 for unauthenticated request', async () => {
      const res = await chai
        .request(server)
        .get('/api/git/status')
        .query({ repo_path: test_repo.user_path })

      expect(res).to.have.status(401)
    })
  })
})
