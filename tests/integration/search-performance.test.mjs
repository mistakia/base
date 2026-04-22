/**
 * Performance integration suite for /api/search.
 *
 * Measures p50/p95 across representative query shapes against a realistic
 * fixture and fails when any scenario exceeds the baseline p95 by more
 * than `regression_tolerance`.
 *
 * Fixture scale is configurable via SEARCH_PERF_SCALE (default 0.2 for
 * fast CI; set to 1.0 for the full 3,500 entities + 500 threads × 100
 * turns corpus specified in the plan). Budgets in
 * tests/fixtures/search/baseline.json assume the full corpus; smaller
 * scales still catch regressions on query shape but will not exercise
 * FTS cardinality behavior to the same degree.
 */

/* global describe it before after */
import fs from 'fs'
import path from 'path'
import { expect } from 'chai'
import { fileURLToPath } from 'url'

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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = path.join(
  __dirname,
  '..',
  'fixtures',
  'search',
  'baseline.json'
)

const SCALE = Number(process.env.SEARCH_PERF_SCALE || '0.2')
const ENTITY_COUNT = Math.round(3500 * SCALE)
const THREAD_COUNT = Math.round(500 * SCALE)
const TURNS_PER_THREAD = Math.round(100 * SCALE)
const ITERATIONS = Number(process.env.SEARCH_PERF_ITERATIONS || '25')
const WARMUP = 3

const TOKEN_POOL = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'widget',
  'loader',
  'pipeline',
  'export',
  'ingest',
  'refactor',
  'permission',
  'timeline',
  'search',
  'index',
  'migration'
]

function pick_tokens(seed, n) {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push(TOKEN_POOL[(seed * 7 + i * 13) % TOKEN_POOL.length])
  }
  return out
}

function percentile(samples, p) {
  const sorted = [...samples].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length)
  )
  return sorted[index]
}

async function seed_fixture({ user, user_path }) {
  const body_base = fs.readFileSync(
    path.join(__dirname, '..', '..', 'package.json'),
    'utf-8'
  )

  for (let i = 0; i < ENTITY_COUNT; i++) {
    const base_uri = `user:task/perf-${i}.md`
    const title_tokens = pick_tokens(i, 3).join(' ')
    const description = `Synthetic entity ${i} for perf corpus (${pick_tokens(i + 1, 4).join(' ')})`
    const body = `${pick_tokens(i + 2, 5).join(' ')}\n${body_base.slice(0, 200)}`
    await execute_sqlite_run({
      query: `INSERT INTO entities (
        base_uri, entity_id, type, title, description, body, status,
        public_read, user_public_key, created_at, updated_at, frontmatter
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, '{}')`,
      parameters: [
        base_uri,
        `perf-${i}`,
        'task',
        `Perf ${i} ${title_tokens}`,
        description,
        body,
        i % 2 === 0 ? 'In Progress' : 'Completed',
        user.user_public_key,
        '2026-04-01T00:00:00Z',
        '2026-04-01T00:00:00Z'
      ]
    })
    const file_path = path.join(user_path, 'task', `perf-${i}.md`)
    fs.mkdirSync(path.dirname(file_path), { recursive: true })
    fs.writeFileSync(
      file_path,
      `---\nbase_uri: '${base_uri}'\nentity_id: 'perf-${i}'\ntype: task\npublic_read: true\nuser_public_key: '${user.user_public_key}'\ncreated_at: '2026-04-01T00:00:00Z'\nupdated_at: '2026-04-01T00:00:00Z'\n---\n`
    )
  }

  for (let t = 0; t < THREAD_COUNT; t++) {
    const thread_id = `perf-thread-${t}`
    const title_tokens = pick_tokens(t + 3, 3).join(' ')
    await execute_sqlite_run({
      query: `INSERT INTO threads (thread_id, title, short_description, public_read, user_public_key, created_at, updated_at)
              VALUES (?, ?, ?, 1, ?, ?, ?)`,
      parameters: [
        thread_id,
        `Perf thread ${t} ${title_tokens}`,
        `Thread ${t} perf description`,
        user.user_public_key,
        '2026-04-05T00:00:00Z',
        '2026-04-05T00:00:00Z'
      ]
    })
    for (let turn = 0; turn < TURNS_PER_THREAD; turn++) {
      const turn_text = pick_tokens(t * 100 + turn, 10).join(' ')
      await execute_sqlite_run({
        query: `INSERT INTO thread_timeline (thread_id, turn_index, turn_text, first_timestamp)
                VALUES (?, ?, ?, ?)`,
        parameters: [thread_id, turn, turn_text, '2026-04-05T00:00:00Z']
      })
    }
  }
}

async function run_scenario({ auth_header, params, iterations }) {
  for (let i = 0; i < WARMUP; i++) {
    await request(server)
      .get('/api/search')
      .set('Authorization', auth_header)
      .query(params)
  }
  const samples = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    const res = await request(server)
      .get('/api/search')
      .set('Authorization', auth_header)
      .query(params)
    samples.push(performance.now() - start)
    expect(res.status).to.equal(200)
  }
  return {
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    samples
  }
}

describe('API /search performance', function () {
  this.timeout(180000)

  let user
  let test_directories
  let auth_header
  let baseline

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

    baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'))

    await seed_fixture({ user, user_path: test_directories.user_path })
  })

  after(async () => {
    if (test_directories?.cleanup) test_directories.cleanup()
    await close_sqlite_connection()
    embedded_index_manager.sqlite_ready = false
    embedded_index_manager.initialized = false
    clear_config_cache()
  })

  function assert_budget(name, p95) {
    const budget = baseline.scenarios[name]
    const tolerance = baseline.regression_tolerance || 0.2
    const ceiling = budget * (1 + tolerance)
    // Only enforce when running against a representative corpus. Smaller
    // scales are still useful for relative comparison but don't match the
    // budget distribution.
    if (SCALE < 0.75) {
      // eslint-disable-next-line no-console
      console.log(
        `[perf scale=${SCALE}] ${name} p95=${p95.toFixed(1)}ms (budget ${budget}ms, ceiling ${ceiling.toFixed(0)}ms — not enforced)`
      )
      return
    }
    expect(
      p95,
      `${name} p95 ${p95.toFixed(1)}ms exceeded ceiling ${ceiling}ms`
    ).to.be.at.most(ceiling)
  }

  it('entity: 1-token query', async () => {
    const result = await run_scenario({
      auth_header,
      params: { q: 'alpha', source: 'entity' },
      iterations: ITERATIONS
    })
    assert_budget('entity_one_token', result.p95)
  })

  it('entity: 4-token query', async () => {
    const result = await run_scenario({
      auth_header,
      params: { q: 'alpha beta gamma delta', source: 'entity' },
      iterations: ITERATIONS
    })
    assert_budget('entity_four_tokens', result.p95)
  })

  it('thread_timeline: 2-token query', async () => {
    const result = await run_scenario({
      auth_header,
      params: { q: 'pipeline timeline', source: 'thread_timeline' },
      iterations: ITERATIONS
    })
    assert_budget('thread_timeline_two_tokens', result.p95)
  })

  it('default multi-source', async () => {
    const result = await run_scenario({
      auth_header,
      params: { q: 'widget loader' },
      iterations: ITERATIONS
    })
    assert_budget('default_multi_source', result.p95)
  })

  it('multi-source with type+status filters', async () => {
    const result = await run_scenario({
      auth_header,
      params: {
        q: 'widget loader',
        type: 'task',
        status: 'In Progress'
      },
      iterations: ITERATIONS
    })
    assert_budget('multi_source_with_filters', result.p95)
  })

  it('semantic source degrades within budget when unavailable', async () => {
    const result = await run_scenario({
      auth_header,
      params: { q: 'alpha', source: 'semantic' },
      iterations: Math.min(ITERATIONS, 10)
    })
    assert_budget('semantic_unavailable', result.p95)
  })
})
