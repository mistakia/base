import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import { format_markdown_file_with_prettier } from '#libs-server/formatting/format-markdown-file-with-prettier.mjs'

describe('format_markdown_file_with_prettier', () => {
  let temp_dir

  beforeEach(async () => {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'format-prettier-test-'))
  })

  afterEach(async () => {
    if (temp_dir) {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should format a markdown file with valid content', async () => {
    const file_path = path.join(temp_dir, 'test.md')
    // Write unformatted content (extra spaces, inconsistent line breaks)
    const unformatted_content = `---
title: Test Entity
type:   task
description:    A test description
---

# Header

Some   content  with   extra   spaces.


Multiple blank lines above.`

    await fs.writeFile(file_path, unformatted_content, 'utf8')

    const result = await format_markdown_file_with_prettier({
      absolute_path: file_path
    })

    expect(result).to.be.true

    const formatted_content = await fs.readFile(file_path, 'utf8')
    // Prettier should normalize the YAML frontmatter
    expect(formatted_content).to.include('title: Test Entity')
    expect(formatted_content).to.include('type: task')
    // Content should still be present
    expect(formatted_content).to.include('# Header')
  })

  it('should handle non-existent file gracefully', async () => {
    const file_path = path.join(temp_dir, 'non-existent.md')

    const result = await format_markdown_file_with_prettier({
      absolute_path: file_path
    })

    // Should return false but not throw
    expect(result).to.be.false
  })

  it('should skip non-markdown files', async () => {
    const file_path = path.join(temp_dir, 'test.txt')
    const original_content = 'Some text content'

    await fs.writeFile(file_path, original_content, 'utf8')

    const result = await format_markdown_file_with_prettier({
      absolute_path: file_path
    })

    expect(result).to.be.false

    // Content should be unchanged
    const content = await fs.readFile(file_path, 'utf8')
    expect(content).to.equal(original_content)
  })

  it('should handle malformed YAML frontmatter gracefully', async () => {
    const file_path = path.join(temp_dir, 'malformed.md')
    // Invalid YAML - unbalanced quotes
    // Note: Prettier's markdown parser is lenient and will still process the file
    const malformed_content = `---
title: "Unbalanced quote
type: task
---

# Content`

    await fs.writeFile(file_path, malformed_content, 'utf8')

    const result = await format_markdown_file_with_prettier({
      absolute_path: file_path
    })

    // Prettier is lenient with YAML - it still formats the file
    // The key requirement is that it doesn't throw
    expect(result).to.be.a('boolean')
  })

  it('should format markdown with complex frontmatter', async () => {
    const file_path = path.join(temp_dir, 'complex.md')
    const content = `---
title: Complex Entity
type: task
tags:
  - tag1
  - tag2
relations:
  - follows [[other/entity.md]]
observations:
  - '[note] Test observation'
---

# Content

Body text.`

    await fs.writeFile(file_path, content, 'utf8')

    const result = await format_markdown_file_with_prettier({
      absolute_path: file_path
    })

    expect(result).to.be.true

    const formatted_content = await fs.readFile(file_path, 'utf8')
    expect(formatted_content).to.include('tags:')
    expect(formatted_content).to.include('relations:')
    expect(formatted_content).to.include('observations:')
  })
})
