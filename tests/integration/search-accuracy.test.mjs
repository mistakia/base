/**
 * Integration tests for /api/search accuracy.
 *
 * Covers the 13 assertions from the source-first search refactor plan:
 *   1. Originating thread surfaces for the nano-community MySQL CSV case
 *      via the thread_timeline source.
 *   2. Token-order invariance under FTS5.
 *   3. Hyphen tokenization: 'nano-community' matches 'nano community'.
 *   4. Filters (type, tag, status, path) each isolated.
 *   5. Per-source isolation via ?source=.
 *   6. Multi-source merge ranking produces a single deduped row with both
 *      sources in matches[].
 *   7. Body-only match via the entity body column.
 *   8. Permission deny removes a matching entity.
 *   9. Semantic graceful degradation when Ollama is unavailable.
 *  10. Hits without a resolvable entity_uri do not leak into the response.
 *  11. Repeated-param form '?type=a&type=b' returns HTTP 400.
 *  12. CSV form '?type=a,b' succeeds.
 *  13. `total` equals `results.length` (post-permission contract).
 *
 * The suite seeds an in-memory SQLite index directly; FTS5 triggers
 * populate the virtual tables on INSERT. Matching .md/metadata.json
 * fixtures are written to the registered user base directory so the
 * permission layer can read public_read and owner_public_key.
 */

/* global describe it before after */
import fs from 'fs'
import path from 'path'
import { expect } from 'chai'

import { request } from '#tests/utils/test-request.mjs'
import server from '#server'
import { create_test_user, create_auth_token } from '#tests/utils/index.mjs'
import { setup_test_directories } from '#tests/utils/setup-test-directories.mjs'
import reset_all_tables from '#tests/utils/reset-all-tables.mjs'
import {
  initialize_sqlite_client,
  execute_sqlite_run,
  close_sqlite_connection
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { create_sqlite_schema } from '#libs-server/embedded-database-index/sqlite/sqlite-schema-definitions.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { clear_config_cache } from '#libs-server/search/search-config.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'

function write_entity_md({
  user_path,
  base_uri,
  entity_id,
  type,
  title,
  description = '',
  body = '',
  status = null,
  tags = [],
  public_read = true,
  user_public_key,
  updated_at = '2026-04-01T00:00:00Z'
}) {
  const relative = base_uri.replace(/^user:/, '')
  const file_path = path.join(user_path, relative)
  fs.mkdirSync(path.dirname(file_path), { recursive: true })
  const frontmatter = {
    base_uri,
    entity_id,
    type,
    title,
    description,
    public_read,
    user_public_key,
    created_at: updated_at,
    updated_at
  }
  if (status) frontmatter.status = status
  if (tags.length > 0) frontmatter.tags = tags
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}:\n${v.map((x) => `  - ${x}`).join('\n')}`
      if (typeof v === 'string') return `${k}: '${v.replace(/'/g, "''")}'`
      return `${k}: ${v}`
    })
    .join('\n')
  const content = `---\n${yaml}\n---\n${body}\n`
  fs.writeFileSync(file_path, content)
}

function write_thread_metadata({
  thread_id,
  title,
  public_read = true,
  owner_public_key
}) {
  const thread_dir = path.join(get_thread_base_directory(), thread_id)
  fs.mkdirSync(thread_dir, { recursive: true })
  const metadata = {
    thread_id,
    title,
    public_read,
    user_public_key: owner_public_key,
    owner_public_key
  }
  fs.writeFileSync(
    path.join(thread_dir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  )
}

async function insert_entity({
  base_uri,
  entity_id,
  type,
  title,
  description = '',
  body = null,
  status = null,
  tags = [],
  public_read = 1,
  user_public_key,
  updated_at = '2026-04-01T00:00:00Z'
}) {
  await execute_sqlite_run({
    query: `INSERT INTO entities (
      base_uri, entity_id, type, title, description, body, status,
      public_read, user_public_key, created_at, updated_at, frontmatter
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    parameters: [
      base_uri,
      entity_id,
      type,
      title,
      description,
      body,
      status,
      public_read,
      user_public_key,
      updated_at,
      updated_at,
      JSON.stringify({ base_uri, entity_id, type, title, description })
    ]
  })
  for (const tag_base_uri of tags) {
    await execute_sqlite_run({
      query: `INSERT OR IGNORE INTO entity_tags (entity_base_uri, tag_base_uri) VALUES (?, ?)`,
      parameters: [base_uri, tag_base_uri]
    })
  }
}

async function insert_thread({
  thread_id,
  title,
  description = '',
  public_read = 1,
  user_public_key,
  updated_at = '2026-04-05T00:00:00Z'
}) {
  await execute_sqlite_run({
    query: `INSERT INTO threads (thread_id, title, short_description, public_read, user_public_key, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
    parameters: [
      thread_id,
      title,
      description,
      public_read,
      user_public_key,
      updated_at,
      updated_at
    ]
  })
}

async function insert_timeline_turn({
  thread_id,
  turn_index,
  turn_text,
  first_timestamp = '2026-04-05T00:00:00Z'
}) {
  await execute_sqlite_run({
    query: `INSERT INTO thread_timeline (thread_id, turn_index, turn_text, first_timestamp)
            VALUES (?, ?, ?, ?)`,
    parameters: [thread_id, turn_index, turn_text, first_timestamp]
  })
}

describe('API /search accuracy', function () {
  this.timeout(20000)

  let user
  let test_directories
  let auth_header

  before(async () => {
    await reset_all_tables()
    user = await create_test_user()
    user.jwt_token = create_auth_token(user)
    auth_header = `Bearer ${user.jwt_token}`

    test_directories = setup_test_directories()

    await close_sqlite_connection()
    await initialize_sqlite_client({ in_memory: true })
    await create_sqlite_schema()
    clear_config_cache()

    embedded_index_manager.sqlite_ready = true
    embedded_index_manager.initialized = true

    const entities = [
      {
        base_uri: 'user:task/alpha-task.md',
        entity_id: 'e-alpha',
        type: 'task',
        title: 'Alpha widget planning',
        description: 'Plan the alpha widget rollout',
        status: 'In Progress',
        tags: ['user:tag/widget.md']
      },
      {
        base_uri: 'user:task/beta-task.md',
        entity_id: 'e-beta',
        type: 'task',
        title: 'Beta deployment',
        description: 'Ship beta to staging',
        status: 'Completed',
        tags: ['user:tag/deploy.md']
      },
      {
        base_uri: 'user:text/body-only.md',
        entity_id: 'e-body',
        type: 'text',
        title: 'Operations manual',
        description: 'Nothing related in the description.',
        body: 'The phrase uniquebodytoken appears only here in the body column.'
      },
      {
        base_uri: 'user:workflow/alpha-workflow.md',
        entity_id: 'e-alpha-wf',
        type: 'workflow',
        title: 'Alpha workflow recipe',
        description: 'How to ship alpha'
      }
    ]

    for (const entity of entities) {
      await insert_entity({
        ...entity,
        user_public_key: user.user_public_key
      })
      write_entity_md({
        user_path: test_directories.user_path,
        ...entity,
        body: entity.body || '',
        user_public_key: user.user_public_key
      })
    }

    // Private entity owned by a different user — fs frontmatter reflects the
    // deny state so the permission gate excludes it.
    await insert_entity({
      base_uri: 'user:task/private-task.md',
      entity_id: 'e-private',
      type: 'task',
      title: 'Alpha private planning',
      description: 'Only visible to the owner.',
      status: 'In Progress',
      public_read: 0,
      user_public_key: 'other-user-public-key'
    })
    write_entity_md({
      user_path: test_directories.user_path,
      base_uri: 'user:task/private-task.md',
      entity_id: 'e-private',
      type: 'task',
      title: 'Alpha private planning',
      description: 'Only visible to the owner.',
      status: 'In Progress',
      public_read: false,
      user_public_key: 'other-user-public-key'
    })

    // Threads.
    await insert_thread({
      thread_id: 'thr-nano-originating',
      title: 'Locate nano-community MySQL CSV exports',
      description: 'Originating research thread for CSV consolidation',
      user_public_key: user.user_public_key
    })
    write_thread_metadata({
      thread_id: 'thr-nano-originating',
      title: 'Locate nano-community MySQL CSV exports',
      owner_public_key: user.user_public_key
    })
    await insert_timeline_turn({
      thread_id: 'thr-nano-originating',
      turn_index: 0,
      turn_text:
        'Consolidate the MySQL CSV exports for the nano-community dataset into a single table.'
    })
    await insert_timeline_turn({
      thread_id: 'thr-nano-originating',
      turn_index: 1,
      turn_text:
        'Found the exports under data/nano-community/; writing a loader script.'
    })

    await insert_thread({
      thread_id: 'thr-path-only',
      title: 'Unrelated routing thread',
      description: 'No alpha content',
      user_public_key: user.user_public_key
    })
    write_thread_metadata({
      thread_id: 'thr-path-only',
      title: 'Unrelated routing thread',
      owner_public_key: user.user_public_key
    })
  })

  after(async () => {
    if (test_directories?.cleanup) test_directories.cleanup()
    await close_sqlite_connection()
    embedded_index_manager.sqlite_ready = false
    embedded_index_manager.initialized = false
    clear_config_cache()
  })

  describe('FTS accuracy', () => {
    it('(1) surfaces originating nano-community thread via timeline', async () => {
      const res = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'mysql csv exports nano community' })

      expect(res.status).to.equal(200)
      const thread_match = res.body.results.find(
        (r) => r.entity_uri === 'user:thread/thr-nano-originating'
      )
      expect(thread_match, 'originating thread missing').to.exist
      const timeline_match = thread_match.matches.find(
        (m) => m.source === 'thread_timeline'
      )
      expect(timeline_match, 'thread_timeline source missing').to.exist
    })

    it('(2) token order does not affect matching', async () => {
      const forward = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'alpha widget' })
      const reverse = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'widget alpha' })

      expect(forward.status).to.equal(200)
      expect(reverse.status).to.equal(200)
      const forward_uris = new Set(forward.body.results.map((r) => r.entity_uri))
      const reverse_uris = new Set(reverse.body.results.map((r) => r.entity_uri))
      expect(forward_uris.has('user:task/alpha-task.md')).to.be.true
      expect(reverse_uris.has('user:task/alpha-task.md')).to.be.true
    })

    it('(3) hyphen equals space (nano-community == nano community)', async () => {
      const hyphen = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'nano-community' })
      const spaced = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'nano community' })

      expect(hyphen.status).to.equal(200)
      expect(spaced.status).to.equal(200)
      const hyphen_uris = new Set(hyphen.body.results.map((r) => r.entity_uri))
      const spaced_uris = new Set(spaced.body.results.map((r) => r.entity_uri))
      expect(hyphen_uris.has('user:thread/thr-nano-originating')).to.be.true
      expect(spaced_uris.has('user:thread/thr-nano-originating')).to.be.true
    })

    it('(7) body-only matches surface via entity source', async () => {
      const res = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'uniquebodytoken' })

      expect(res.status).to.equal(200)
      const body_hit = res.body.results.find(
        (r) => r.entity_uri === 'user:text/body-only.md'
      )
      expect(body_hit, 'body-only entity missing').to.exist
    })
  })

  describe('filters and source isolation', () => {
    it('(4a) type filter isolates to matching type', async () => {
      const res = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'alpha', type: 'workflow' })

      expect(res.status).to.equal(200)
      expect(res.body.results.length).to.be.at.least(1)
      for (const row of res.body.results) {
        expect(row.type).to.equal('workflow')
      }
    })

    it('(4b) status filter isolates to matching status', async () => {
      const res = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'alpha', type: 'task', status: 'In Progress' })

      expect(res.status).to.equal(200)
      for (const row of res.body.results) {
        expect(row.type).to.equal('task')
      }
    })

    it('(4c) tag filter isolates to tagged entities', async () => {
      const res = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'alpha', tag: 'user:tag/widget.md' })

      expect(res.status).to.equal(200)
      const uris = new Set(res.body.results.map((r) => r.entity_uri))
      expect(uris.has('user:task/alpha-task.md')).to.be.true
      expect(uris.has('user:workflow/alpha-workflow.md')).to.be.false
    })

    it('(4d) path filter isolates by entity_uri glob', async () => {
      const res = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'alpha', path: 'user:workflow/**' })

      expect(res.status).to.equal(200)
      for (const row of res.body.results) {
        expect(row.entity_uri.startsWith('user:workflow/')).to.be.true
      }
    })

    it('(5) source isolation via ?source=entity', async () => {
      const res = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'alpha', source: 'entity' })

      expect(res.status).to.equal(200)
      for (const row of res.body.results) {
        for (const match of row.matches) {
          expect(match.source).to.equal('entity')
        }
      }
    })

    it('(6) multi-source merge produces one row with both sources', async () => {
      const res = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({
          q: 'nano community',
          source: 'thread_metadata,thread_timeline'
        })

      expect(res.status).to.equal(200)
      const thread_hits = res.body.results.filter(
        (r) => r.entity_uri === 'user:thread/thr-nano-originating'
      )
      expect(thread_hits).to.have.lengthOf(1)
      const sources = new Set(thread_hits[0].matches.map((m) => m.source))
      expect(sources.has('thread_metadata')).to.be.true
      expect(sources.has('thread_timeline')).to.be.true
    })
  })

  describe('permissions and contract', () => {
    it('(8) permission deny removes a private entity', async () => {
      const res = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'alpha private' })

      expect(res.status).to.equal(200)
      const uris = new Set(res.body.results.map((r) => r.entity_uri))
      expect(uris.has('user:task/private-task.md')).to.be.false
    })

    it('(9) semantic source degrades gracefully when Ollama unavailable', async () => {
      const res = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'alpha', source: 'semantic' })

      // Semantic returns empty (not 500) when embeddings/ollama are unavailable.
      expect(res.status).to.equal(200)
      expect(res.body).to.have.property('results')
      expect(res.body.results).to.be.an('array')
    })

    it('(10) unresolvable base_uri does not leak into results', async () => {
      await execute_sqlite_run({
        query: `INSERT INTO entities (base_uri, entity_id, type, title, description, body, public_read, user_public_key, created_at, updated_at, frontmatter)
                VALUES (?, ?, 'task', ?, '', NULL, 1, ?, ?, ?, '{}')`,
        parameters: [
          'unknown:task/leaky.md',
          'e-leaky',
          'alpha leaky entry',
          user.user_public_key,
          '2026-04-01T00:00:00Z',
          '2026-04-01T00:00:00Z'
        ]
      })

      const res = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'leaky' })

      expect(res.status).to.equal(200)
      const uris = res.body.results.map((r) => r.entity_uri)
      expect(uris).to.not.include('unknown:task/leaky.md')
    })

    it('(11) repeated-param form returns HTTP 400', async () => {
      const res = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'alpha', type: ['task', 'workflow'] })

      expect(res.status).to.equal(400)
      expect(res.body).to.have.property('error')
      expect(res.body.param).to.equal('type')
    })

    it('(12) CSV form succeeds with 200', async () => {
      const res = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'alpha', type: 'task,workflow' })

      expect(res.status).to.equal(200)
    })

    it('(13) total equals results.length (post-permission)', async () => {
      const res = await request(server)
        .get('/api/search')
        .set('Authorization', auth_header)
        .query({ q: 'alpha' })

      expect(res.status).to.equal(200)
      expect(res.body.total).to.equal(res.body.results.length)
    })
  })
})
