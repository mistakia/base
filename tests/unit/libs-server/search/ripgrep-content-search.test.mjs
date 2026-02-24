import { expect } from 'chai'

/**
 * Test ripgrep JSON output parsing by re-implementing the parse logic.
 * The parse_ripgrep_json_output function is not exported, so we test
 * the parsing logic directly. This mirrors the two-pass approach in
 * ripgrep-file-search.mjs.
 */

function parse_ripgrep_json_output({ output, max_results }) {
  if (!output.trim()) return []

  const lines = output.trim().split('\n')

  // First pass: collect all entries in order
  const entries = []
  for (const line of lines) {
    let parsed
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }

    if (parsed.type !== 'match' && parsed.type !== 'context') continue

    const data = parsed.data
    const raw_path = data.path?.text
    if (!raw_path) continue

    entries.push({
      type: parsed.type,
      relative_path: raw_path,
      line_number: data.line_number,
      text: (data.lines?.text || '').trimEnd()
    })
  }

  // Second pass: group context lines around matches
  const results = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (entry.type !== 'match') continue

    const context_before = []
    const context_after = []

    for (let j = i - 1; j >= 0; j--) {
      const prev = entries[j]
      if (prev.type !== 'context' || prev.relative_path !== entry.relative_path) break
      context_before.unshift(prev.text)
    }

    for (let j = i + 1; j < entries.length; j++) {
      const next = entries[j]
      if (next.type !== 'context' || next.relative_path !== entry.relative_path) break
      context_after.push(next.text)
    }

    results.push({
      relative_path: entry.relative_path,
      line_number: entry.line_number,
      match_line: entry.text,
      context_before,
      context_after
    })

    if (results.length >= max_results) break
  }

  return results
}

describe('Ripgrep Content Search Parsing', function () {
  it('should parse match JSON lines', () => {
    const output = JSON.stringify({
      type: 'match',
      data: {
        path: { text: 'task/test.md' },
        line_number: 10,
        lines: { text: 'const search_query = "hello"\n' }
      }
    })

    const results = parse_ripgrep_json_output({
      output,
      max_results: 50
    })

    expect(results).to.have.lengthOf(1)
    expect(results[0].relative_path).to.equal('task/test.md')
    expect(results[0].line_number).to.equal(10)
    expect(results[0].match_line).to.equal('const search_query = "hello"')
  })

  it('should attach context lines to matches', () => {
    const lines = [
      JSON.stringify({
        type: 'context',
        data: {
          path: { text: 'file.md' },
          line_number: 8,
          lines: { text: 'line before 1\n' }
        }
      }),
      JSON.stringify({
        type: 'context',
        data: {
          path: { text: 'file.md' },
          line_number: 9,
          lines: { text: 'line before 2\n' }
        }
      }),
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: 'file.md' },
          line_number: 10,
          lines: { text: 'the match line\n' }
        }
      }),
      JSON.stringify({
        type: 'context',
        data: {
          path: { text: 'file.md' },
          line_number: 11,
          lines: { text: 'line after 1\n' }
        }
      }),
      JSON.stringify({
        type: 'context',
        data: {
          path: { text: 'file.md' },
          line_number: 12,
          lines: { text: 'line after 2\n' }
        }
      })
    ]

    const results = parse_ripgrep_json_output({
      output: lines.join('\n'),
      max_results: 50
    })

    expect(results).to.have.lengthOf(1)
    expect(results[0].context_before).to.have.lengthOf(2)
    expect(results[0].context_after).to.have.lengthOf(2)
    expect(results[0].context_before[0]).to.equal('line before 1')
    expect(results[0].context_after[1]).to.equal('line after 2')
  })

  it('should handle multiple matches', () => {
    const lines = [
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: 'a.md' },
          line_number: 5,
          lines: { text: 'first match\n' }
        }
      }),
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: 'b.md' },
          line_number: 12,
          lines: { text: 'second match\n' }
        }
      })
    ]

    const results = parse_ripgrep_json_output({
      output: lines.join('\n'),
      max_results: 50
    })

    expect(results).to.have.lengthOf(2)
  })

  it('should respect max_results limit', () => {
    const lines = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: `file${i}.md` },
          line_number: i + 1,
          lines: { text: `match ${i}\n` }
        }
      })
    )

    const results = parse_ripgrep_json_output({
      output: lines.join('\n'),
      max_results: 3
    })

    expect(results).to.have.lengthOf(3)
  })

  it('should handle empty output', () => {
    const results = parse_ripgrep_json_output({
      output: '',
      max_results: 50
    })

    expect(results).to.deep.equal([])
  })

  it('should skip invalid JSON lines', () => {
    const output = 'not json\n' + JSON.stringify({
      type: 'match',
      data: {
        path: { text: 'file.md' },
        line_number: 1,
        lines: { text: 'valid match\n' }
      }
    })

    const results = parse_ripgrep_json_output({
      output,
      max_results: 50
    })

    expect(results).to.have.lengthOf(1)
  })
})
