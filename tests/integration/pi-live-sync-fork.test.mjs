import { describe, it, beforeEach, afterEach, before, after } from 'mocha'
import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

import config from '#config'
import { import_pi_sessions } from '#libs-server/integrations/pi/index.mjs'
import { link_pi_branches } from '#libs-server/integrations/pi/pi-branch-linker.mjs'
import { clear_pi_sync_state } from '#libs-server/integrations/pi/pi-sync-state.mjs'
import { create_temp_test_repo } from '#tests/utils/index.mjs'

const FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'pi',
  'v3-multi-leaf.jsonl'
)

const append_line = async (file_path, obj) => {
  await fs.appendFile(file_path, JSON.stringify(obj) + '\n')
}

const list_thread_dirs = async (user_base_directory) => {
  const root = path.join(user_base_directory, 'thread')
  const entries = await fs.readdir(root, { withFileTypes: true })
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(root, e.name))
}

const read_metadata = async (thread_dir) => {
  const file = path.join(thread_dir, 'metadata.json')
  return JSON.parse(await fs.readFile(file, 'utf-8'))
}

const run_full_pi_import = async ({ session_file, user_base_directory }) => {
  // Mirror the CLI dispatch: import_pi_sessions then link_pi_branches.
  const result = await import_pi_sessions({
    session_file,
    allow_updates: true,
    user_base_directory,
    bulk_import: true,
    single_leaf_only: false
  })
  const created = result.results?.created || []
  const updated = result.results?.updated || []
  await link_pi_branches({ thread_results: created.concat(updated) })
  return result
}

describe('pi live sync fork integration', function () {
  this.timeout(120_000)

  let temp_repo
  let user_base_directory
  let session_file
  let saved_user_public_key

  before(() => {
    saved_user_public_key = config.user_public_key
    config.user_public_key =
      saved_user_public_key ||
      '0000000000000000000000000000000000000000000000000000000000000000'
  })

  after(() => {
    config.user_public_key = saved_user_public_key
  })

  beforeEach(async () => {
    temp_repo = await create_temp_test_repo({
      prefix: 'pi-fork-',
      register_directories: true
    })
    user_base_directory = temp_repo.user_path
    await fs.mkdir(path.join(user_base_directory, 'thread'), {
      recursive: true
    })
    session_file = path.join(
      os.tmpdir(),
      `pi-fork-test-${crypto.randomBytes(4).toString('hex')}.jsonl`
    )
    await fs.copyFile(FIXTURE, session_file)
  })

  afterEach(async () => {
    if (session_file) {
      await clear_pi_sync_state({ session_file })
      try {
        await fs.unlink(session_file)
      } catch {}
    }
    if (temp_repo) temp_repo.cleanup()
  })

  it('first tick lands both leaves; mid-stream descendant of non-active leaf shifts active branch and linker establishes branched_from', async () => {
    // First tick: full Pi import (no single_leaf_only) lands threads for both
    // leaves of the multi-leaf fixture; link_pi_branches runs as the post-step.
    await run_full_pi_import({ session_file, user_base_directory })

    const dirs_after_first = await list_thread_dirs(user_base_directory)
    expect(dirs_after_first.length).to.equal(2)

    const metas_first = await Promise.all(dirs_after_first.map(read_metadata))
    const provider_metas = metas_first
      .map((m) => m?.external_session?.provider_metadata)
      .filter(Boolean)
    expect(provider_metas.length).to.equal(2)
    const branch_indexes = provider_metas
      .map((p) => p.branch_index)
      .sort((a, b) => a - b)
    expect(branch_indexes).to.deep.equal([0, 1])

    const primary_meta = metas_first.find(
      (m) => m?.external_session?.provider_metadata?.branch_index === 0
    )
    const sibling_meta = metas_first.find(
      (m) => m?.external_session?.provider_metadata?.branch_index !== 0
    )
    const sibling_relations = Array.isArray(sibling_meta?.relations)
      ? sibling_meta.relations
      : []
    const has_branched_from = sibling_relations.some(
      (r) =>
        typeof r === 'string' &&
        r.includes('branched_from') &&
        r.includes(`thread/${primary_meta.thread_id}`)
    )
    expect(has_branched_from, JSON.stringify(sibling_relations)).to.equal(true)

    // Mid-stream: append a newer descendant of the previously-non-active leaf.
    // The fixture's active leaf is 'b' (timestamp 2026-04-02T00:00:02). Adding
    // a much-newer descendant of 'a' shifts the active leaf onto 'a's subtree.
    await append_line(session_file, {
      id: 'a2',
      parentId: 'a',
      type: 'message',
      timestamp: '2026-04-02T01:00:00.000Z',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'switch active' }],
        timestamp: '2026-04-02T01:00:00.000Z'
      }
    })

    // Second tick: full Pi import + linker again. (The delta path is only
    // taken when known_thread_id is set; the multi-thread CLI dispatch
    // doesn't pass it. The full path naturally handles fork extension.)
    await run_full_pi_import({ session_file, user_base_directory })

    const dirs_after_second = await list_thread_dirs(user_base_directory)
    expect(dirs_after_second.length).to.equal(2)

    const metas_second = await Promise.all(
      dirs_after_second.map(read_metadata)
    )
    const branched_from_count = metas_second
      .flatMap((m) => (Array.isArray(m.relations) ? m.relations : []))
      .filter((r) => typeof r === 'string' && r.includes('branched_from'))
      .length
    expect(branched_from_count).to.be.greaterThan(0)
  })
})
