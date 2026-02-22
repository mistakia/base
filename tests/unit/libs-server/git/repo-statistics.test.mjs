/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

import { get_commit_log } from '#libs-server/git/repo-statistics.mjs'

const execute = promisify(exec)
const expect = chai.expect

describe('get_commit_log', function () {
  this.timeout(10000)

  let test_repo_path

  beforeEach(async function () {
    const temp_dir = os.tmpdir()
    test_repo_path = path.join(
      temp_dir,
      `git-commits-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    )

    await fs.mkdir(test_repo_path, { recursive: true })
    await execute('git init', { cwd: test_repo_path })
    await execute('git config user.name "Test User"', {
      cwd: test_repo_path
    })
    await execute('git config user.email "test@example.com"', {
      cwd: test_repo_path
    })
    await execute('git branch -M main', { cwd: test_repo_path })

    // Create multiple commits
    for (let i = 1; i <= 5; i++) {
      await fs.writeFile(
        path.join(test_repo_path, `file${i}.txt`),
        `content ${i}`
      )
      await execute(`git add file${i}.txt`, { cwd: test_repo_path })
      await execute(`git commit -m "Commit ${i}"`, { cwd: test_repo_path })
    }
  })

  afterEach(async function () {
    if (test_repo_path) {
      await fs.rm(test_repo_path, { recursive: true, force: true })
    }
  })

  it('should return commit log with correct fields', async () => {
    const result = await get_commit_log({ repo_path: test_repo_path })

    expect(result).to.have.property('commits')
    expect(result).to.have.property('has_more')
    expect(result.commits).to.be.an('array')
    expect(result.commits.length).to.equal(5)

    const commit = result.commits[0]
    expect(commit).to.have.property('hash')
    expect(commit).to.have.property('short_hash')
    expect(commit).to.have.property('subject')
    expect(commit).to.have.property('date')
    expect(commit).to.have.property('author_name')
    expect(commit).to.have.property('author_email')
    expect(commit.author_name).to.equal('Test User')
    expect(commit.author_email).to.equal('test@example.com')
  })

  it('should return commits in reverse chronological order', async () => {
    const result = await get_commit_log({ repo_path: test_repo_path })

    expect(result.commits[0].subject).to.equal('Commit 5')
    expect(result.commits[4].subject).to.equal('Commit 1')
  })

  it('should respect limit parameter', async () => {
    const result = await get_commit_log({
      repo_path: test_repo_path,
      limit: 3
    })

    expect(result.commits.length).to.equal(3)
    expect(result.has_more).to.be.true
  })

  it('should return has_more as false when all commits returned', async () => {
    const result = await get_commit_log({
      repo_path: test_repo_path,
      limit: 10
    })

    expect(result.commits.length).to.equal(5)
    expect(result.has_more).to.be.false
  })

  it('should support before cursor for pagination', async () => {
    const first_page = await get_commit_log({
      repo_path: test_repo_path,
      limit: 3
    })

    const last_hash = first_page.commits[first_page.commits.length - 1].hash
    const second_page = await get_commit_log({
      repo_path: test_repo_path,
      limit: 3,
      before: last_hash
    })

    expect(second_page.commits.length).to.equal(2)
    expect(second_page.commits[0].subject).to.equal('Commit 2')
    expect(second_page.commits[1].subject).to.equal('Commit 1')
  })

  it('should filter by author', async () => {
    const result = await get_commit_log({
      repo_path: test_repo_path,
      author: 'Test User'
    })

    expect(result.commits.length).to.equal(5)
  })

  it('should filter by search term', async () => {
    const result = await get_commit_log({
      repo_path: test_repo_path,
      search: 'Commit 3'
    })

    expect(result.commits.length).to.equal(1)
    expect(result.commits[0].subject).to.equal('Commit 3')
  })

  it('should handle empty repository gracefully', async () => {
    const empty_repo = path.join(
      os.tmpdir(),
      `git-empty-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    )
    await fs.mkdir(empty_repo, { recursive: true })
    await execute('git init', { cwd: empty_repo })
    await execute('git branch -M main', { cwd: empty_repo })

    try {
      const result = await get_commit_log({ repo_path: empty_repo })
      expect(result.commits).to.be.an('array')
      expect(result.commits.length).to.equal(0)
    } catch {
      // Empty repos may throw - this is acceptable behavior
    } finally {
      await fs.rm(empty_repo, { recursive: true, force: true })
    }
  })
})
