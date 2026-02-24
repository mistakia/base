/* global describe, it, beforeEach, afterEach */

import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import os from 'os'

import { discover_extensions } from '#libs-server/extension/discover-extensions.mjs'

describe('discover_extensions', () => {
  let temp_dir

  beforeEach(() => {
    temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-discover-test-'))
  })

  afterEach(() => {
    fs.rmSync(temp_dir, { recursive: true, force: true })
  })

  it('should return empty array when no extension directories exist', () => {
    const result = discover_extensions(['/nonexistent/path'])
    expect(result).to.deep.equal([])
  })

  it('should return empty array when extension directory is empty', () => {
    const result = discover_extensions([temp_dir])
    expect(result).to.deep.equal([])
  })

  it('should discover extension with extension.md and command.mjs', () => {
    const ext_dir = path.join(temp_dir, 'test-ext')
    fs.mkdirSync(ext_dir)
    fs.writeFileSync(
      path.join(ext_dir, 'extension.md'),
      '---\nname: test-ext\ndescription: A test extension\nrequires:\n  libs: [entity]\n---\n# Test Extension\n'
    )
    fs.writeFileSync(
      path.join(ext_dir, 'command.mjs'),
      'export const command = "test-ext"\n'
    )

    const result = discover_extensions([temp_dir])
    expect(result).to.have.lengthOf(1)
    expect(result[0].name).to.equal('test-ext')
    expect(result[0].description).to.equal('A test extension')
    expect(result[0].has_commands).to.be.true
    expect(result[0].has_skills).to.be.false
    expect(result[0].requires).to.deep.equal({ libs: ['entity'] })
  })

  it('should discover skills-only extension without command.mjs', () => {
    const ext_dir = path.join(temp_dir, 'skills-only')
    fs.mkdirSync(ext_dir)
    fs.mkdirSync(path.join(ext_dir, 'skill'))
    fs.writeFileSync(
      path.join(ext_dir, 'extension.md'),
      '---\nname: skills-only\ndescription: Skills only\n---\n'
    )
    fs.writeFileSync(
      path.join(ext_dir, 'skill', 'my-skill.md'),
      '---\ntitle: My Skill\ntype: skill\n---\n'
    )

    const result = discover_extensions([temp_dir])
    expect(result).to.have.lengthOf(1)
    expect(result[0].has_commands).to.be.false
    expect(result[0].has_skills).to.be.true
  })

  it('should detect SKILL.md at extension root', () => {
    const ext_dir = path.join(temp_dir, 'skill-root')
    fs.mkdirSync(ext_dir)
    fs.writeFileSync(
      path.join(ext_dir, 'extension.md'),
      '---\nname: skill-root\n---\n'
    )
    fs.writeFileSync(
      path.join(ext_dir, 'SKILL.md'),
      '---\ntitle: Root Skill\n---\n'
    )

    const result = discover_extensions([temp_dir])
    expect(result).to.have.lengthOf(1)
    expect(result[0].has_skills).to.be.true
  })

  it('should handle missing extension.md when command.mjs exists', () => {
    const ext_dir = path.join(temp_dir, 'no-manifest')
    fs.mkdirSync(ext_dir)
    fs.writeFileSync(
      path.join(ext_dir, 'command.mjs'),
      'export const command = "no-manifest"\n'
    )

    const result = discover_extensions([temp_dir])
    expect(result).to.have.lengthOf(1)
    expect(result[0].name).to.equal('no-manifest')
    expect(result[0].description).to.equal('')
  })

  it('should skip directories without extension.md and without command.mjs', () => {
    const ext_dir = path.join(temp_dir, 'empty-ext')
    fs.mkdirSync(ext_dir)
    fs.writeFileSync(path.join(ext_dir, 'README.md'), '# Nothing here')

    const result = discover_extensions([temp_dir])
    expect(result).to.deep.equal([])
  })

  it('should use first-match-wins for duplicate extension names', () => {
    const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-test-dir1-'))
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-test-dir2-'))

    try {
      const ext1 = path.join(dir1, 'dupe')
      fs.mkdirSync(ext1)
      fs.writeFileSync(
        path.join(ext1, 'extension.md'),
        '---\nname: dupe\ndescription: First\n---\n'
      )
      fs.writeFileSync(path.join(ext1, 'command.mjs'), '')

      const ext2 = path.join(dir2, 'dupe')
      fs.mkdirSync(ext2)
      fs.writeFileSync(
        path.join(ext2, 'extension.md'),
        '---\nname: dupe\ndescription: Second\n---\n'
      )
      fs.writeFileSync(path.join(ext2, 'command.mjs'), '')

      const result = discover_extensions([dir1, dir2])
      expect(result).to.have.lengthOf(1)
      expect(result[0].description).to.equal('First')
    } finally {
      fs.rmSync(dir1, { recursive: true, force: true })
      fs.rmSync(dir2, { recursive: true, force: true })
    }
  })

  it('should handle malformed frontmatter gracefully', () => {
    const ext_dir = path.join(temp_dir, 'bad-yaml')
    fs.mkdirSync(ext_dir)
    fs.writeFileSync(
      path.join(ext_dir, 'extension.md'),
      '---\n: invalid: yaml: here\n---\n'
    )
    fs.writeFileSync(path.join(ext_dir, 'command.mjs'), '')

    const result = discover_extensions([temp_dir])
    expect(result).to.have.lengthOf(1)
    expect(result[0].name).to.equal('bad-yaml')
  })

  it('should skip non-directory entries', () => {
    fs.writeFileSync(path.join(temp_dir, 'not-a-dir.txt'), 'file')

    const result = discover_extensions([temp_dir])
    expect(result).to.deep.equal([])
  })

  it('should handle null and empty paths', () => {
    const result = discover_extensions([null, '', undefined])
    expect(result).to.deep.equal([])
  })
})
