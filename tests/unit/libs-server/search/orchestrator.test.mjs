/**
 * Orchestrator unit tests covering dedupe, pagination, and post-permission
 * `total` semantics. Uses an in-memory SQLite fixture. Permission is stubbed
 * to allow all entity_uris so the orchestrator logic can be exercised in
 * isolation from the rules layer.
 */

import { expect } from 'chai'

import {
  initialize_sqlite_client,
  execute_sqlite_run,
  close_sqlite_connection
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { create_sqlite_schema } from '#libs-server/embedded-database-index/sqlite/sqlite-schema-definitions.mjs'
import { clear_config_cache } from '#libs-server/search/search-config.mjs'
import { search as orchestrator_search } from '#libs-server/search/orchestrator.mjs'

const allow_all = async ({ hits }) => hits

async function seed_fixture() {
  await execute_sqlite_run({
    query: `INSERT INTO entities (
      base_uri, entity_id, type, title, description, body, user_public_key,
      created_at, updated_at, frontmatter
    ) VALUES (?, ?, 'task', ?, ?, ?, '', '', '2026-04-01T00:00:00Z', '{}')`,
    parameters: [
      'user:task/alpha.md',
      'e-alpha',
      'alpha term',
      'alpha description',
      null
    ]
  })
  await execute_sqlite_run({
    query: `INSERT INTO entities (
      base_uri, entity_id, type, title, description, body, user_public_key,
      created_at, updated_at, frontmatter
    ) VALUES (?, ?, 'task', ?, ?, ?, '', '', '2026-04-01T00:00:00Z', '{}')`,
    parameters: [
      'user:task/beta.md',
      'e-beta',
      'beta term',
      'beta description',
      null
    ]
  })
  await execute_sqlite_run({
    query: `INSERT INTO threads (thread_id, title, short_description)
            VALUES (?, ?, ?)`,
    parameters: ['thr-alpha', 'alpha thread', 'alpha description']
  })
  await execute_sqlite_run({
    query: `INSERT INTO thread_timeline (thread_id, turn_index, turn_text, first_timestamp)
            VALUES (?, ?, ?, ?)`,
    parameters: ['thr-alpha', 0, 'alpha turn content', null]
  })
}

describe('search orchestrator', function () {
  this.timeout(8000)

  before(async () => {
    await close_sqlite_connection()
    await initialize_sqlite_client({ in_memory: true })
    await create_sqlite_schema()
    await seed_fixture()
    clear_config_cache()
  })

  after(async () => {
    try {
      await close_sqlite_connection()
    } catch {
      // ignore
    }
    clear_config_cache()
  })

  it('dedupes hits by entity_uri across sources', async () => {
    const result = await orchestrator_search({
      permission_filter_fn: allow_all,
      query: 'alpha',
      sources: ['entity', 'thread_metadata', 'thread_timeline']
    })

    const alpha_thread_results = result.results.filter(
      (r) => r.entity_uri === 'user:thread/thr-alpha'
    )
    expect(alpha_thread_results).to.have.lengthOf(1)
    // Thread is matched by both thread_metadata (title/description) and
    // thread_timeline (turn content); matches[] should carry both entries.
    const sources = alpha_thread_results[0].matches.map((m) => m.source)
    expect(sources).to.include('thread_metadata')
    expect(sources).to.include('thread_timeline')
  })

  it('reports total equal to results.length (post-permission)', async () => {
    const result = await orchestrator_search({
      permission_filter_fn: allow_all,
      query: 'alpha',
      sources: ['entity']
    })
    expect(result.total).to.equal(result.results.length)
  })

  it('respects limit and offset for pagination', async () => {
    const page1 = await orchestrator_search({
      permission_filter_fn: allow_all,
      query: 'term',
      sources: ['entity'],
      limit: 1,
      offset: 0
    })
    const page2 = await orchestrator_search({
      permission_filter_fn: allow_all,
      query: 'term',
      sources: ['entity'],
      limit: 1,
      offset: 1
    })
    expect(page1.results).to.have.lengthOf(1)
    expect(page2.results).to.have.lengthOf(1)
    expect(page1.results[0].entity_uri).to.not.equal(
      page2.results[0].entity_uri
    )
  })
})
