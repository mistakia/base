/**
 * Combined unit tests for the FTS-backed source adapters (entity,
 * thread-metadata, thread-timeline). Shares an in-memory SQLite fixture.
 */

import { expect } from 'chai'

import {
  initialize_sqlite_client,
  execute_sqlite_run,
  close_sqlite_connection
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { create_sqlite_schema } from '#libs-server/embedded-database-index/sqlite/sqlite-schema-definitions.mjs'
import entity_source from '#libs-server/search/sources/entity.mjs'
import thread_metadata_source from '#libs-server/search/sources/thread-metadata.mjs'
import thread_timeline_source from '#libs-server/search/sources/thread-timeline.mjs'

async function insert_entity({ base_uri, entity_id, title, description, body }) {
  await execute_sqlite_run({
    query: `INSERT INTO entities (
      base_uri, entity_id, type, title, description, body, user_public_key,
      created_at, updated_at, frontmatter
    ) VALUES (?, ?, 'task', ?, ?, ?, '', '', '', '{}')`,
    parameters: [base_uri, entity_id, title, description, body]
  })
}

async function insert_thread({ thread_id, title, short_description }) {
  await execute_sqlite_run({
    query: `INSERT INTO threads (thread_id, title, short_description)
            VALUES (?, ?, ?)`,
    parameters: [thread_id, title, short_description]
  })
}

async function insert_timeline({
  thread_id,
  turn_index,
  turn_text,
  first_timestamp = null
}) {
  await execute_sqlite_run({
    query: `INSERT INTO thread_timeline (thread_id, turn_index, turn_text, first_timestamp)
            VALUES (?, ?, ?, ?)`,
    parameters: [thread_id, turn_index, turn_text, first_timestamp]
  })
}

describe('search FTS source adapters', function () {
  this.timeout(8000)

  before(async () => {
    await close_sqlite_connection()
    await initialize_sqlite_client({ in_memory: true })
    await create_sqlite_schema()

    await insert_entity({
      base_uri: 'user:task/nano.md',
      entity_id: '1',
      title: 'Nano community migration',
      description: 'Consolidate exports',
      body: 'Details about MySQL CSV exports'
    })
    await insert_entity({
      base_uri: 'user:task/other.md',
      entity_id: '2',
      title: 'Unrelated task',
      description: 'Nothing to see',
      body: null
    })

    await insert_thread({
      thread_id: 'thr-nano',
      title: 'nano-community investigation',
      short_description: 'locate exports'
    })
    await insert_thread({
      thread_id: 'thr-other',
      title: 'unrelated',
      short_description: 'misc'
    })

    await insert_timeline({
      thread_id: 'thr-nano',
      turn_index: 0,
      turn_text: 'Find the MySQL CSV exports for nano-community.'
    })
    await insert_timeline({
      thread_id: 'thr-nano',
      turn_index: 1,
      turn_text: 'Second turn unrelated to the topic.'
    })
  })

  after(async () => {
    try {
      await close_sqlite_connection()
    } catch {
      // ignore
    }
  })

  describe('entity source', () => {
    it('matches body-only text', async () => {
      const hits = await entity_source.search({ query: 'MySQL CSV' })
      const uris = hits.map((h) => h.entity_uri)
      expect(uris).to.include('user:task/nano.md')
      expect(uris).to.not.include('user:task/other.md')
    })

    it('returns empty for empty query', async () => {
      const hits = await entity_source.search({ query: '' })
      expect(hits).to.deep.equal([])
    })

    it('treats nano-community equivalently to nano community', async () => {
      const hyphen = await entity_source.search({ query: 'nano-community' })
      const spaced = await entity_source.search({ query: 'nano community' })
      expect(hyphen.map((h) => h.entity_uri)).to.deep.equal(
        spaced.map((h) => h.entity_uri)
      )
    })
  })

  describe('thread_metadata source', () => {
    it('matches against title + short_description', async () => {
      const hits = await thread_metadata_source.search({ query: 'investigation' })
      expect(hits.map((h) => h.entity_uri)).to.include('user:thread/thr-nano')
    })

    it('emits user:thread/<id> URIs', async () => {
      const hits = await thread_metadata_source.search({ query: 'nano' })
      for (const hit of hits) {
        expect(hit.entity_uri.startsWith('user:thread/')).to.equal(true)
      }
    })
  })

  describe('thread_timeline source', () => {
    it('emits one hit per matching turn keyed by thread URI', async () => {
      const hits = await thread_timeline_source.search({ query: 'MySQL CSV' })
      expect(hits).to.have.lengthOf(1)
      expect(hits[0].entity_uri).to.equal('user:thread/thr-nano')
      expect(hits[0].extras).to.have.property('turn_index', 0)
    })

    it('surfaces the originating thread for multi-word queries regardless of order', async () => {
      const forward = await thread_timeline_source.search({
        query: 'nano-community MySQL'
      })
      const reverse = await thread_timeline_source.search({
        query: 'MySQL nano-community'
      })
      expect(forward.map((h) => h.entity_uri)).to.include(
        'user:thread/thr-nano'
      )
      expect(reverse.map((h) => h.entity_uri)).to.include(
        'user:thread/thr-nano'
      )
    })
  })
})
