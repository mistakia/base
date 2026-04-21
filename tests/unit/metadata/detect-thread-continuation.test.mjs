/* global describe, it, before, after */

import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'

import {
  normalize_text,
  build_shingles,
  extract_first_user_prompt,
  extract_assistant_text,
  score_continuation_coverage,
  detect_continuation_source
} from '#libs-server/metadata/analyze-thread-relations.mjs'
import {
  register_base_directories,
  clear_registered_directories
} from '#libs-server/base-uri/index.mjs'
import { update_thread_metadata } from '#libs-server/threads/update-thread.mjs'
import create_temp_test_directory from '#tests/utils/create-temp-test-directory.mjs'

const THREAD_RELATION_REGEX = /^[a-z_]+ \[\[.+\]\]$/

async function write_thread({
  user_base_directory,
  thread_id,
  created_at,
  updated_at,
  timeline,
  extra_metadata
}) {
  const thread_dir = path.join(user_base_directory, 'thread', thread_id)
  await fs.mkdir(thread_dir, { recursive: true })
  await fs.writeFile(
    path.join(thread_dir, 'metadata.json'),
    JSON.stringify(
      {
        thread_id,
        user_public_key: '0'.repeat(64),
        thread_state: 'active',
        created_at,
        updated_at: updated_at || created_at,
        ...(extra_metadata || {})
      },
      null,
      2
    )
  )
  const lines = timeline.map((event) => JSON.stringify(event)).join('\n')
  await fs.writeFile(
    path.join(thread_dir, 'timeline.jsonl'),
    lines ? `${lines}\n` : ''
  )
}

describe('detect-thread-continuation', () => {
  describe('normalize_text', () => {
    it('lowercases and strips punctuation', () => {
      expect(normalize_text('Hello, WORLD!')).to.equal('hello world')
    })

    it('collapses whitespace runs', () => {
      expect(normalize_text('a   b\t\tc\n\nd')).to.equal('a b c d')
    })

    it('returns empty string for empty or non-string input', () => {
      expect(normalize_text('')).to.equal('')
      expect(normalize_text(null)).to.equal('')
      expect(normalize_text(undefined)).to.equal('')
    })

    it('replaces non-alphanumeric runs with single spaces', () => {
      expect(normalize_text('foo--bar__baz.qux')).to.equal('foo bar baz qux')
    })
  })

  describe('build_shingles', () => {
    it('produces sliding window k-shingles', () => {
      const tokens = Array.from({ length: 10 }, (_, i) => `t${i}`).join(' ')
      const shingles = build_shingles({ text: tokens, k: 3 })
      expect(shingles.size).to.equal(8)
      expect(shingles.has('t0 t1 t2')).to.be.true
      expect(shingles.has('t7 t8 t9')).to.be.true
    })

    it('deduplicates repeated shingles', () => {
      const shingles = build_shingles({ text: 'a b a b a b', k: 2 })
      expect(shingles.size).to.equal(2)
    })

    it('returns empty set for text shorter than k', () => {
      expect(build_shingles({ text: 'a b c', k: 5 }).size).to.equal(0)
      expect(build_shingles({ text: '', k: 3 }).size).to.equal(0)
    })
  })

  describe('extract_first_user_prompt', () => {
    it('returns first user message content', () => {
      const timeline = [
        { type: 'system' },
        { type: 'message', role: 'user', content: 'hello' },
        { type: 'message', role: 'assistant', content: 'hi' }
      ]
      expect(extract_first_user_prompt({ timeline })).to.equal('hello')
    })

    it('skips leading non-user events', () => {
      const timeline = [
        { type: 'tool_call' },
        { type: 'message', role: 'assistant', content: 'a' },
        { type: 'message', role: 'user', content: 'prompt' }
      ]
      expect(extract_first_user_prompt({ timeline })).to.equal('prompt')
    })

    it('returns null when no user messages exist', () => {
      expect(extract_first_user_prompt({ timeline: [] })).to.be.null
      expect(
        extract_first_user_prompt({
          timeline: [{ type: 'message', role: 'assistant', content: 'x' }]
        })
      ).to.be.null
    })
  })

  describe('extract_assistant_text', () => {
    it('concatenates all assistant message contents', () => {
      const timeline = [
        { type: 'message', role: 'user', content: 'u' },
        { type: 'message', role: 'assistant', content: 'one' },
        { type: 'message', role: 'assistant', content: 'two' }
      ]
      expect(extract_assistant_text({ timeline })).to.equal('one\n\ntwo')
    })

    it('returns empty string when no assistant messages', () => {
      expect(extract_assistant_text({ timeline: [] })).to.equal('')
    })
  })

  describe('score_continuation_coverage', () => {
    it('returns 1 for identical sets', () => {
      const s = new Set(['a', 'b', 'c'])
      expect(
        score_continuation_coverage({
          candidate_shingles: s,
          source_shingles: s
        })
      ).to.equal(1)
    })

    it('returns partial overlap ratio', () => {
      const a = new Set(['a', 'b', 'c', 'd'])
      const b = new Set(['a', 'b', 'x'])
      expect(
        score_continuation_coverage({
          candidate_shingles: a,
          source_shingles: b
        })
      ).to.equal(0.5)
    })

    it('returns 0 for disjoint or empty sets', () => {
      expect(
        score_continuation_coverage({
          candidate_shingles: new Set(['a']),
          source_shingles: new Set(['b'])
        })
      ).to.equal(0)
      expect(
        score_continuation_coverage({
          candidate_shingles: new Set(),
          source_shingles: new Set(['a'])
        })
      ).to.equal(0)
    })
  })

  describe('detect_continuation_source', () => {
    let user_dir

    before(() => {
      user_dir = create_temp_test_directory('continuation-test-')
    })

    after(() => {
      user_dir.cleanup()
    })

    it('finds in-window match, excludes out-of-window and self', async () => {
      const user_base_directory = user_dir.path

      // Build a prompt with >=20 unique 8-word shingles so the min-shingles
      // floor is satisfied and overlap is unambiguous.
      const tokens = Array.from({ length: 40 }, (_, i) => `tok${i}`).join(' ')
      const wrap_up_prompt = `continuation prompt -- continue the prior work. ${tokens}`
      const assistant_source_text = `Here is the prompt you should paste:\n\n~~~\n${wrap_up_prompt}\n~~~\n\nGood luck.`

      const analyzed_id = '11111111-1111-4111-8111-111111111111'
      const in_window_id = '22222222-2222-4222-8222-222222222222'
      const out_of_window_id = '33333333-3333-4333-8333-333333333333'

      const analyzed_created_at = '2026-04-10T00:00:00.000Z'

      await write_thread({
        user_base_directory,
        thread_id: analyzed_id,
        created_at: analyzed_created_at,
        updated_at: analyzed_created_at,
        timeline: [
          {
            type: 'message',
            role: 'user',
            content: wrap_up_prompt
          }
        ]
      })

      // In-window source: created before and updated within 14 days of analyzed.
      await write_thread({
        user_base_directory,
        thread_id: in_window_id,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-05T00:00:00.000Z',
        timeline: [
          { type: 'message', role: 'user', content: 'start' },
          {
            type: 'message',
            role: 'assistant',
            content: assistant_source_text
          }
        ]
      })

      // Out-of-window source: updated too long before analyzed.created_at.
      await write_thread({
        user_base_directory,
        thread_id: out_of_window_id,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
        timeline: [
          { type: 'message', role: 'user', content: 'start' },
          {
            type: 'message',
            role: 'assistant',
            content: assistant_source_text
          }
        ]
      })

      const analyzed_timeline = [
        { type: 'message', role: 'user', content: wrap_up_prompt }
      ]

      const matches = await detect_continuation_source({
        thread_id: analyzed_id,
        timeline: analyzed_timeline,
        analyzed_created_at,
        user_base_directory
      })

      expect(matches).to.have.lengthOf(1)
      expect(matches[0].source_thread_id).to.equal(in_window_id)
      expect(matches[0].coverage).to.be.greaterThan(0.3)
    })

    it('returns empty when prompt has no continuation signal (fast-path gate)', async () => {
      const user_base_directory = user_dir.path
      const no_signal_id = '77777777-7777-4777-8777-777777777777'
      // Long prompt without any signal vocabulary should short-circuit
      // before candidate enumeration via the fast-path gate.
      const tokens = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')

      const matches = await detect_continuation_source({
        thread_id: no_signal_id,
        timeline: [{ type: 'message', role: 'user', content: tokens }],
        analyzed_created_at: '2026-04-10T00:00:00.000Z',
        user_base_directory
      })

      expect(matches).to.deep.equal([])
    })

    it('prefilter drops has_continuation_prompt=false, keeps true and missing', async () => {
      const user_base_directory = path.join(user_dir.path, 'prefilter')
      await fs.mkdir(user_base_directory, { recursive: true })

      const tokens = Array.from({ length: 40 }, (_, i) => `pf${i}`).join(' ')
      const wrap_up_prompt = `continuation prompt: ${tokens}`
      const assistant_source_text = `Here is the prompt:\n\n~~~\nKey locations\n${wrap_up_prompt}\n~~~\n`

      const analyzed_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      const flag_true_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      const flag_false_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      const flag_missing_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

      const analyzed_created_at = '2026-04-10T00:00:00.000Z'

      await write_thread({
        user_base_directory,
        thread_id: analyzed_id,
        created_at: analyzed_created_at,
        timeline: [{ type: 'message', role: 'user', content: wrap_up_prompt }]
      })

      for (const { id, flag } of [
        { id: flag_true_id, flag: true },
        { id: flag_false_id, flag: false },
        { id: flag_missing_id, flag: undefined }
      ]) {
        const extra =
          flag === undefined ? undefined : { has_continuation_prompt: flag }
        await write_thread({
          user_base_directory,
          thread_id: id,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-05T00:00:00.000Z',
          extra_metadata: extra,
          timeline: [
            { type: 'message', role: 'user', content: 'start' },
            {
              type: 'message',
              role: 'assistant',
              content: assistant_source_text
            }
          ]
        })
      }

      const matches = await detect_continuation_source({
        thread_id: analyzed_id,
        timeline: [{ type: 'message', role: 'user', content: wrap_up_prompt }],
        analyzed_created_at,
        user_base_directory
      })

      const matched_ids = matches.map((m) => m.source_thread_id).sort()
      expect(matched_ids).to.deep.equal([flag_true_id, flag_missing_id].sort())
    })

    it('returns empty when prompt is too short', async () => {
      const user_base_directory = user_dir.path
      const short_id = '44444444-4444-4444-8444-444444444444'
      const analyzed_created_at = '2026-04-10T00:00:00.000Z'

      const matches = await detect_continuation_source({
        thread_id: short_id,
        timeline: [{ type: 'message', role: 'user', content: 'too short' }],
        analyzed_created_at,
        user_base_directory
      })

      expect(matches).to.deep.equal([])
    })
  })

  describe('schema round-trip for continued_from', () => {
    let user_dir
    const thread_id = '55555555-5555-4555-8555-555555555555'
    const source_id = '66666666-6666-4666-8666-666666666666'

    before(async () => {
      user_dir = create_temp_test_directory('continuation-roundtrip-')
      clear_registered_directories()
      register_base_directories({
        user_base_directory: user_dir.path,
        system_base_directory: user_dir.path
      })
      await write_thread({
        user_base_directory: user_dir.path,
        thread_id,
        created_at: '2026-04-10T00:00:00.000Z',
        updated_at: '2026-04-10T00:00:00.000Z',
        timeline: []
      })
    })

    after(() => {
      clear_registered_directories()
      user_dir.cleanup()
    })

    it('accepts relation matching the schema regex', async () => {
      const relation_string = `continued_from [[user:thread/${source_id}]]`
      expect(relation_string).to.match(THREAD_RELATION_REGEX)

      await update_thread_metadata({
        thread_id,
        metadata: { relations: [relation_string] }
      })

      const persisted = JSON.parse(
        await fs.readFile(
          path.join(user_dir.path, 'thread', thread_id, 'metadata.json'),
          'utf-8'
        )
      )
      expect(persisted.relations).to.deep.equal([relation_string])
    })
  })
})
