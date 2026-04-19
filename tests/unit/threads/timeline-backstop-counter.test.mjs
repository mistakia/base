import { expect } from 'chai'

import {
  increment_timeline_backstop_counter,
  read_and_reset_timeline_backstop_counter
} from '#libs-server/threads/timeline-backstop-counter.mjs'

describe('timeline-backstop-counter', () => {
  beforeEach(() => {
    read_and_reset_timeline_backstop_counter()
  })

  it('starts at zero', () => {
    expect(read_and_reset_timeline_backstop_counter()).to.equal(0)
  })

  it('advances on increment', () => {
    increment_timeline_backstop_counter()
    increment_timeline_backstop_counter()
    increment_timeline_backstop_counter()
    expect(read_and_reset_timeline_backstop_counter()).to.equal(3)
  })

  it('resets to zero after read', () => {
    increment_timeline_backstop_counter()
    increment_timeline_backstop_counter()
    read_and_reset_timeline_backstop_counter()
    expect(read_and_reset_timeline_backstop_counter()).to.equal(0)
  })
})
