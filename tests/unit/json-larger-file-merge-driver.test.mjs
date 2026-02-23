/* global describe, it */

import { expect } from 'chai'

import { merge_take_larger } from '../../cli/json-larger-file-merge-driver.mjs'

describe('json-larger-file-merge-driver', () => {
  it('should take theirs when theirs is larger', () => {
    const ours_content = '{"entries": [1, 2]}'
    const theirs_content = '{"entries": [1, 2, 3, 4, 5]}'

    const result = merge_take_larger({ ours_content, theirs_content })

    expect(result).to.equal(theirs_content)
  })

  it('should take ours when ours is larger', () => {
    const ours_content = '{"entries": [1, 2, 3, 4, 5]}'
    const theirs_content = '{"entries": [1, 2]}'

    const result = merge_take_larger({ ours_content, theirs_content })

    expect(result).to.equal(ours_content)
  })

  it('should take theirs when same size', () => {
    const ours_content = '{"a": 1}'
    const theirs_content = '{"b": 2}'

    const result = merge_take_larger({ ours_content, theirs_content })

    expect(result).to.equal(theirs_content)
  })

  it('should handle empty ours', () => {
    const ours_content = ''
    const theirs_content = '{"entries": [1]}'

    const result = merge_take_larger({ ours_content, theirs_content })

    expect(result).to.equal(theirs_content)
  })

  it('should handle empty theirs', () => {
    const ours_content = '{"entries": [1]}'
    const theirs_content = ''

    const result = merge_take_larger({ ours_content, theirs_content })

    expect(result).to.equal(ours_content)
  })

  it('should handle both empty', () => {
    const ours_content = ''
    const theirs_content = ''

    const result = merge_take_larger({ ours_content, theirs_content })

    expect(result).to.equal(theirs_content)
  })

  it('should compare by byte length not character count', () => {
    // Multi-byte characters make string shorter in chars but larger in bytes
    const ours_content = 'aaaaaa'
    const theirs_content = '\u00e9\u00e9\u00e9' // 3 chars but 6 bytes in utf8

    const result = merge_take_larger({ ours_content, theirs_content })

    expect(result).to.equal(theirs_content)
  })
})
