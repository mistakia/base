/* global describe, it */

import { expect } from 'chai'

import { merge_jsonl } from '../../cli/jsonl-merge-driver.mjs'

describe('jsonl-merge-driver', () => {
  it('should take ours when only ours appends', () => {
    const base_lines = ['{"a":1}', '{"a":2}']
    const ours_lines = ['{"a":1}', '{"a":2}', '{"a":3}']
    const theirs_lines = ['{"a":1}', '{"a":2}']

    const result = merge_jsonl({ base_lines, ours_lines, theirs_lines })

    expect(result).to.deep.equal(['{"a":1}', '{"a":2}', '{"a":3}'])
  })

  it('should take theirs when only theirs appends', () => {
    const base_lines = ['{"a":1}']
    const ours_lines = ['{"a":1}']
    const theirs_lines = ['{"a":1}', '{"a":2}', '{"a":3}']

    const result = merge_jsonl({ base_lines, ours_lines, theirs_lines })

    expect(result).to.deep.equal(['{"a":1}', '{"a":2}', '{"a":3}'])
  })

  it('should union when both sides append different lines', () => {
    const base_lines = ['{"a":1}']
    const ours_lines = ['{"a":1}', '{"b":1}']
    const theirs_lines = ['{"a":1}', '{"c":1}']

    const result = merge_jsonl({ base_lines, ours_lines, theirs_lines })

    expect(result).to.deep.equal(['{"a":1}', '{"b":1}', '{"c":1}'])
  })

  it('should deduplicate when both sides append same lines', () => {
    const base_lines = ['{"a":1}']
    const ours_lines = ['{"a":1}', '{"b":1}', '{"c":1}']
    const theirs_lines = ['{"a":1}', '{"b":1}', '{"d":1}']

    const result = merge_jsonl({ base_lines, ours_lines, theirs_lines })

    expect(result).to.deep.equal([
      '{"a":1}',
      '{"b":1}',
      '{"c":1}',
      '{"d":1}'
    ])
  })

  it('should return null when ours modifies a base line', () => {
    const base_lines = ['{"a":1}', '{"a":2}']
    const ours_lines = ['{"a":1}', '{"a":999}']
    const theirs_lines = ['{"a":1}', '{"a":2}', '{"a":3}']

    const result = merge_jsonl({ base_lines, ours_lines, theirs_lines })

    expect(result).to.be.null
  })

  it('should return null when theirs modifies a base line', () => {
    const base_lines = ['{"a":1}', '{"a":2}']
    const ours_lines = ['{"a":1}', '{"a":2}', '{"a":3}']
    const theirs_lines = ['{"a":1}', '{"a":999}']

    const result = merge_jsonl({ base_lines, ours_lines, theirs_lines })

    expect(result).to.be.null
  })

  it('should handle empty files', () => {
    const base_lines = []
    const ours_lines = []
    const theirs_lines = []

    const result = merge_jsonl({ base_lines, ours_lines, theirs_lines })

    expect(result).to.deep.equal([])
  })

  it('should handle empty base with both sides appending', () => {
    const base_lines = []
    const ours_lines = ['{"a":1}']
    const theirs_lines = ['{"b":1}']

    const result = merge_jsonl({ base_lines, ours_lines, theirs_lines })

    expect(result).to.deep.equal(['{"a":1}', '{"b":1}'])
  })

  it('should handle empty base with identical appends', () => {
    const base_lines = []
    const ours_lines = ['{"a":1}']
    const theirs_lines = ['{"a":1}']

    const result = merge_jsonl({ base_lines, ours_lines, theirs_lines })

    expect(result).to.deep.equal(['{"a":1}'])
  })
})
