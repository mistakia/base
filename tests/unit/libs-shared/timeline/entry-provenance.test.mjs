import { expect } from 'chai'

import {
  PROVENANCE,
  is_valid_provenance,
  assert_valid_provenance,
  must_preserve_across_rebuild,
  classify_legacy_entry
} from '#libs-shared/timeline/entry-provenance.mjs'

describe('libs-shared/timeline/entry-provenance', () => {
  describe('PROVENANCE constants', () => {
    it('exposes the two enum values', () => {
      expect(PROVENANCE.SESSION_IMPORT).to.equal('session_import')
      expect(PROVENANCE.RUNTIME_EVENT).to.equal('runtime_event')
    })

    it('is frozen', () => {
      expect(Object.isFrozen(PROVENANCE)).to.equal(true)
    })
  })

  describe('is_valid_provenance', () => {
    it('returns true for enum values', () => {
      expect(is_valid_provenance('session_import')).to.equal(true)
      expect(is_valid_provenance('runtime_event')).to.equal(true)
    })

    it('returns false for anything else', () => {
      expect(is_valid_provenance('')).to.equal(false)
      expect(is_valid_provenance('SESSION_IMPORT')).to.equal(false)
      expect(is_valid_provenance(undefined)).to.equal(false)
      expect(is_valid_provenance(null)).to.equal(false)
      expect(is_valid_provenance(42)).to.equal(false)
      expect(is_valid_provenance({})).to.equal(false)
    })
  })

  describe('assert_valid_provenance', () => {
    it('passes on a valid entry', () => {
      expect(() =>
        assert_valid_provenance({
          id: 'x',
          provenance: PROVENANCE.RUNTIME_EVENT
        })
      ).to.not.throw()
    })

    it('throws when provenance is missing', () => {
      expect(() => assert_valid_provenance({ id: 'x' })).to.throw(
        /missing provenance field/
      )
    })

    it('throws on invalid value', () => {
      expect(() =>
        assert_valid_provenance({ id: 'x', provenance: 'something' })
      ).to.throw(/invalid provenance value/)
    })

    it('throws on non-object input', () => {
      expect(() => assert_valid_provenance(null)).to.throw()
      expect(() => assert_valid_provenance('str')).to.throw()
    })
  })

  describe('must_preserve_across_rebuild', () => {
    it('returns false for session_import entries', () => {
      expect(
        must_preserve_across_rebuild({ provenance: PROVENANCE.SESSION_IMPORT })
      ).to.equal(false)
    })

    it('returns true for runtime_event entries', () => {
      expect(
        must_preserve_across_rebuild({ provenance: PROVENANCE.RUNTIME_EVENT })
      ).to.equal(true)
    })

    it('returns true for entries missing provenance (migration safety net)', () => {
      expect(must_preserve_across_rebuild({})).to.equal(true)
      expect(must_preserve_across_rebuild({ provenance: undefined })).to.equal(
        true
      )
    })
  })

  describe('classify_legacy_entry', () => {
    it('maps thread_lifecycle=true to RUNTIME_EVENT', () => {
      expect(
        classify_legacy_entry({ metadata: { thread_lifecycle: true } })
      ).to.equal(PROVENANCE.RUNTIME_EVENT)
    })

    it('maps everything else to SESSION_IMPORT', () => {
      expect(classify_legacy_entry({})).to.equal(PROVENANCE.SESSION_IMPORT)
      expect(classify_legacy_entry({ metadata: {} })).to.equal(
        PROVENANCE.SESSION_IMPORT
      )
      expect(
        classify_legacy_entry({ metadata: { thread_lifecycle: false } })
      ).to.equal(PROVENANCE.SESSION_IMPORT)
      expect(
        classify_legacy_entry({ metadata: { thread_lifecycle: 'true' } })
      ).to.equal(PROVENANCE.SESSION_IMPORT)
    })
  })
})
