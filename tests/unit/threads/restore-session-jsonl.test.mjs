import { describe, it, beforeEach, afterEach } from 'mocha'
import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { restore_session_jsonl } from '#libs-server/threads/create-session-claude-cli.mjs'

const SESSION_ID = '11111111-2222-3333-4444-555555555555'
const PROJECTS_DIR = '-tmp-test-project'

const make_dirs = async (work_dir) => {
  const raw_data_dir = path.join(work_dir, 'raw-data')
  const claude_home = path.join(work_dir, 'claude-home')
  await fs.mkdir(raw_data_dir, { recursive: true })
  await fs.mkdir(path.join(claude_home, 'projects', PROJECTS_DIR), {
    recursive: true
  })
  return { raw_data_dir, claude_home }
}

const target_path = (claude_home) =>
  path.join(claude_home, 'projects', PROJECTS_DIR, `${SESSION_ID}.jsonl`)

const source_path = (raw_data_dir) =>
  path.join(raw_data_dir, 'claude-session.jsonl')

const set_mtime = async (file_path, ms) => {
  const seconds = ms / 1000
  await fs.utimes(file_path, seconds, seconds)
}

describe('restore_session_jsonl mtime/size guard', function () {
  this.timeout(10000)

  let work_dir

  beforeEach(async () => {
    work_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-jsonl-'))
  })

  afterEach(async () => {
    await fs.rm(work_dir, { recursive: true, force: true })
  })

  it('copies snapshot when target does not exist', async () => {
    const { raw_data_dir, claude_home } = await make_dirs(work_dir)
    const snapshot = 'line-1\nline-2\n'
    await fs.writeFile(source_path(raw_data_dir), snapshot)

    await restore_session_jsonl({
      session_id: SESSION_ID,
      raw_data_dir,
      projects_dir_name: PROJECTS_DIR,
      claude_home
    })

    const written = await fs.readFile(target_path(claude_home), 'utf8')
    expect(written).to.equal(snapshot)
  })

  it('skips copy when target is same size and at least as fresh', async () => {
    const { raw_data_dir, claude_home } = await make_dirs(work_dir)
    const live_content = 'live-a\nlive-b\nlive-c\n'
    const snapshot_content = 'snap-a\nsnap-b\nsnap-c\n'
    expect(snapshot_content.length).to.equal(live_content.length)

    await fs.writeFile(target_path(claude_home), live_content)
    await fs.writeFile(source_path(raw_data_dir), snapshot_content)
    const now = Date.now()
    await set_mtime(source_path(raw_data_dir), now - 5000)
    await set_mtime(target_path(claude_home), now)

    await restore_session_jsonl({
      session_id: SESSION_ID,
      raw_data_dir,
      projects_dir_name: PROJECTS_DIR,
      claude_home
    })

    const after = await fs.readFile(target_path(claude_home), 'utf8')
    expect(after).to.equal(live_content)
  })

  it('copies when source is larger than target', async () => {
    const { raw_data_dir, claude_home } = await make_dirs(work_dir)
    const target_content = 'short\n'
    const source_content = 'longer-snapshot-content\n'
    await fs.writeFile(target_path(claude_home), target_content)
    await fs.writeFile(source_path(raw_data_dir), source_content)

    await restore_session_jsonl({
      session_id: SESSION_ID,
      raw_data_dir,
      projects_dir_name: PROJECTS_DIR,
      claude_home
    })

    const after = await fs.readFile(target_path(claude_home), 'utf8')
    expect(after).to.equal(source_content)
  })

  it('copies when source is newer than target (size tie not enough)', async () => {
    const { raw_data_dir, claude_home } = await make_dirs(work_dir)
    const a = 'aaa\nbbb\n'
    const b = 'ccc\nddd\n'
    expect(a.length).to.equal(b.length)
    await fs.writeFile(target_path(claude_home), a)
    await fs.writeFile(source_path(raw_data_dir), b)
    const now = Date.now()
    await set_mtime(target_path(claude_home), now - 10000)
    await set_mtime(source_path(raw_data_dir), now)

    await restore_session_jsonl({
      session_id: SESSION_ID,
      raw_data_dir,
      projects_dir_name: PROJECTS_DIR,
      claude_home
    })

    const after = await fs.readFile(target_path(claude_home), 'utf8')
    expect(after).to.equal(b)
  })
})
