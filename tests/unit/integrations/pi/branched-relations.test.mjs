import { describe, it } from 'mocha'
import { expect } from 'chai'

import {
  RELATION_BRANCHED_FROM,
  RELATION_BRANCHED_BY,
  get_all_standard_relation_types,
  get_reverse_relation_type
} from '#libs-shared/entity-relations.mjs'

describe('branched_from / branched_by relation constants', () => {
  it('appear in the standard relation set', () => {
    const all = get_all_standard_relation_types()
    expect(all).to.include(RELATION_BRANCHED_FROM)
    expect(all).to.include(RELATION_BRANCHED_BY)
  })

  it('are mutual inverses', () => {
    expect(
      get_reverse_relation_type({ relation_type: RELATION_BRANCHED_FROM })
    ).to.equal(RELATION_BRANCHED_BY)
    expect(
      get_reverse_relation_type({ relation_type: RELATION_BRANCHED_BY })
    ).to.equal(RELATION_BRANCHED_FROM)
  })
})
