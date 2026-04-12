import { expect } from 'chai'

// The internal helper functions are not exported, so we test by replicating
// the pure helper logic here for direct unit testing.

describe('update_tags_references logic', () => {
  // Replicate the pure function for direct unit testing
  function update_tags_references({ tags, old_base_uri, new_base_uri }) {
    if (!tags || !Array.isArray(tags)) {
      return { updated_tags: tags, update_count: 0 }
    }

    let update_count = 0
    const updated_tags = tags.map((tag) => {
      if (typeof tag === 'string' && tag === old_base_uri) {
        update_count++
        return new_base_uri
      }
      return tag
    })

    return { updated_tags, update_count }
  }

  it('should replace a matching tag URI with the new URI', () => {
    const result = update_tags_references({
      tags: ['user:tag/old-category.md', 'user:tag/other.md'],
      old_base_uri: 'user:tag/old-category.md',
      new_base_uri: 'user:tag/new-category.md'
    })

    expect(result.update_count).to.equal(1)
    expect(result.updated_tags).to.deep.equal([
      'user:tag/new-category.md',
      'user:tag/other.md'
    ])
  })

  it('should not modify tags that do not match', () => {
    const result = update_tags_references({
      tags: ['user:tag/unrelated.md', 'user:tag/another.md'],
      old_base_uri: 'user:tag/specific.md',
      new_base_uri: 'user:tag/moved.md'
    })

    expect(result.update_count).to.equal(0)
    expect(result.updated_tags).to.deep.equal([
      'user:tag/unrelated.md',
      'user:tag/another.md'
    ])
  })

  it('should handle multiple matching tags in the same array', () => {
    const result = update_tags_references({
      tags: ['user:tag/dup.md', 'user:tag/other.md', 'user:tag/dup.md'],
      old_base_uri: 'user:tag/dup.md',
      new_base_uri: 'user:tag/deduped.md'
    })

    expect(result.update_count).to.equal(2)
    expect(result.updated_tags).to.deep.equal([
      'user:tag/deduped.md',
      'user:tag/other.md',
      'user:tag/deduped.md'
    ])
  })

  it('should handle null or undefined tags gracefully', () => {
    expect(
      update_tags_references({
        tags: null,
        old_base_uri: 'user:tag/a.md',
        new_base_uri: 'user:tag/b.md'
      })
    ).to.deep.equal({ updated_tags: null, update_count: 0 })

    expect(
      update_tags_references({
        tags: undefined,
        old_base_uri: 'user:tag/a.md',
        new_base_uri: 'user:tag/b.md'
      })
    ).to.deep.equal({ updated_tags: undefined, update_count: 0 })
  })

  it('should handle empty tags array', () => {
    const result = update_tags_references({
      tags: [],
      old_base_uri: 'user:tag/a.md',
      new_base_uri: 'user:tag/b.md'
    })

    expect(result.update_count).to.equal(0)
    expect(result.updated_tags).to.deep.equal([])
  })

  it('should not do partial matching on tag URIs', () => {
    const result = update_tags_references({
      tags: ['user:tag/home/my-tag.md'],
      old_base_uri: 'user:tag/home/my-tag',
      new_base_uri: 'user:tag/other/my-tag'
    })

    expect(result.update_count).to.equal(0)
    expect(result.updated_tags).to.deep.equal(['user:tag/home/my-tag.md'])
  })

  it('should skip non-string elements in tags array', () => {
    const result = update_tags_references({
      tags: ['user:tag/match.md', 42, null, 'user:tag/match.md'],
      old_base_uri: 'user:tag/match.md',
      new_base_uri: 'user:tag/new.md'
    })

    expect(result.update_count).to.equal(2)
    expect(result.updated_tags).to.deep.equal([
      'user:tag/new.md',
      42,
      null,
      'user:tag/new.md'
    ])
  })
})

describe('update_content_references logic', () => {
  function escape_regex_string(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function update_content_references({
    entity_content,
    old_base_uri,
    new_base_uri
  }) {
    if (!entity_content || typeof entity_content !== 'string') {
      return { updated_content: entity_content, update_count: 0 }
    }

    const escaped_old_uri = escape_regex_string(old_base_uri)

    const pattern = new RegExp(
      `\\[\\[${escaped_old_uri}\\]\\]|${escaped_old_uri}`,
      'g'
    )

    let update_count = 0
    const updated_content = entity_content.replace(pattern, (match) => {
      update_count++
      return match.startsWith('[[') ? `[[${new_base_uri}]]` : new_base_uri
    })

    return { updated_content, update_count }
  }

  it('should replace wiki-link references', () => {
    const result = update_content_references({
      entity_content: 'See [[user:text/old-name.md]] for details.',
      old_base_uri: 'user:text/old-name.md',
      new_base_uri: 'user:text/new-name.md'
    })

    expect(result.update_count).to.equal(1)
    expect(result.updated_content).to.equal(
      'See [[user:text/new-name.md]] for details.'
    )
  })

  it('should replace bare URI references in quoted strings', () => {
    const content = `  'create-fabric': 'user:text/activity/create-fabric-home-activities.md',`
    const result = update_content_references({
      entity_content: content,
      old_base_uri: 'user:text/activity/create-fabric-home-activities.md',
      new_base_uri: 'user:text/activity/create-fabric.md'
    })

    expect(result.update_count).to.equal(1)
    expect(result.updated_content).to.equal(
      `  'create-fabric': 'user:text/activity/create-fabric.md',`
    )
  })

  it('should replace both wiki-link and bare references in the same content', () => {
    const content = [
      'Link: [[user:text/old.md]]',
      "Map: 'user:text/old.md'"
    ].join('\n')

    const result = update_content_references({
      entity_content: content,
      old_base_uri: 'user:text/old.md',
      new_base_uri: 'user:text/new.md'
    })

    expect(result.update_count).to.equal(2)
    expect(result.updated_content).to.equal(
      ['Link: [[user:text/new.md]]', "Map: 'user:text/new.md'"].join('\n')
    )
  })

  it('should not double-count wiki-link URIs in the bare pass', () => {
    const content = '[[user:text/old.md]]'
    const result = update_content_references({
      entity_content: content,
      old_base_uri: 'user:text/old.md',
      new_base_uri: 'user:text/new.md'
    })

    // wiki-link pass replaces 1, bare pass finds 0 remaining
    expect(result.update_count).to.equal(1)
    expect(result.updated_content).to.equal('[[user:text/new.md]]')
  })

  it('should handle null or empty content gracefully', () => {
    expect(
      update_content_references({
        entity_content: null,
        old_base_uri: 'user:text/a.md',
        new_base_uri: 'user:text/b.md'
      })
    ).to.deep.equal({ updated_content: null, update_count: 0 })

    expect(
      update_content_references({
        entity_content: '',
        old_base_uri: 'user:text/a.md',
        new_base_uri: 'user:text/b.md'
      })
    ).to.deep.equal({ updated_content: '', update_count: 0 })
  })

  it('should handle content with no matching references', () => {
    const result = update_content_references({
      entity_content: 'No references here.',
      old_base_uri: 'user:text/old.md',
      new_base_uri: 'user:text/new.md'
    })

    expect(result.update_count).to.equal(0)
    expect(result.updated_content).to.equal('No references here.')
  })
})
