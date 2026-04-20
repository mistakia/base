/* global describe, it */

import { expect } from 'chai'

import {
  CONTINUATION_SIGNAL_PATTERNS,
  has_continuation_signal,
  count_continuation_prompts
} from '#libs-server/metadata/continuation-signal.mjs'

describe('continuation-signal', () => {
  describe('has_continuation_signal', () => {
    it('returns false for empty and non-string input', () => {
      expect(has_continuation_signal('')).to.be.false
      expect(has_continuation_signal(null)).to.be.false
      expect(has_continuation_signal(undefined)).to.be.false
      expect(has_continuation_signal(42)).to.be.false
    })

    it('returns false for text with no signal', () => {
      expect(has_continuation_signal('just a regular message about nothing')).to
        .be.false
    })

    it('detects each vocabulary entry', () => {
      for (const entry of CONTINUATION_SIGNAL_PATTERNS) {
        const wrapped = `prefix ${entry} suffix`
        expect(
          has_continuation_signal(wrapped),
          `missing detection for: ${entry}`
        ).to.be.true
      }
    })

    it('is case-insensitive', () => {
      expect(has_continuation_signal('KEY LOCATIONS')).to.be.true
      expect(has_continuation_signal('Continuation Prompt')).to.be.true
      expect(has_continuation_signal('RAN OUT OF CONTEXT')).to.be.true
    })

    it('detects bare fence markers', () => {
      expect(has_continuation_signal('~~~')).to.be.true
      expect(has_continuation_signal('```')).to.be.true
    })
  })

  describe('count_continuation_prompts', () => {
    it('returns 0 for empty and non-string input', () => {
      expect(count_continuation_prompts('')).to.equal(0)
      expect(count_continuation_prompts(null)).to.equal(0)
      expect(count_continuation_prompts(undefined)).to.equal(0)
    })

    it('counts one tilde-fenced block with signal', () => {
      const text =
        'Here is the prompt:\n\n~~~\nKey locations\n- foo\n~~~\n\nThat is all.'
      expect(count_continuation_prompts(text)).to.equal(1)
    })

    it('counts one backtick-fenced block with signal', () => {
      const text = 'pre\n```\ncontinuation prompt here\n```\npost'
      expect(count_continuation_prompts(text)).to.equal(1)
    })

    it('does not count a fenced block without signal vocabulary', () => {
      const text = '```\nconst x = 1\nconsole.log(x)\n```'
      expect(count_continuation_prompts(text)).to.equal(0)
    })

    it('counts multiple fenced blocks separately', () => {
      const text = '~~~\nKey locations\n~~~\n\nthen\n\n~~~\nRemaining work\n~~~'
      expect(count_continuation_prompts(text)).to.equal(2)
    })

    it('counts standalone Continuation: line prefix outside fences', () => {
      const text = 'intro\n\nContinuation: pick up where we left off.\n'
      expect(count_continuation_prompts(text)).to.equal(1)
    })

    it('does not double-count Continuation: inside a counted fence', () => {
      const text = '~~~\nKey locations\nContinuation: do the thing\n~~~'
      expect(count_continuation_prompts(text)).to.equal(1)
    })

    it('combines fence and outside-fence prefix occurrences', () => {
      const text = '~~~\nKey locations\n~~~\n\nContinuation: resume task\n'
      expect(count_continuation_prompts(text)).to.equal(2)
    })

    it('is case-insensitive for the Continuation: prefix', () => {
      expect(count_continuation_prompts('CONTINUATION: next')).to.equal(1)
    })
  })
})
