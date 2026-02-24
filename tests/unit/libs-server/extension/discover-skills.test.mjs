/* global describe, it, beforeEach, afterEach */

import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import os from 'os'

import { discover_skills } from '#libs-server/extension/discover-skills.mjs'

describe('discover_skills', () => {
  let temp_dir

  beforeEach(() => {
    temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-discover-test-'))
  })

  afterEach(() => {
    fs.rmSync(temp_dir, { recursive: true, force: true })
  })

  it('should return empty array when no paths exist', () => {
    const result = discover_skills({
      extension_paths: ['/nonexistent'],
      workflow_paths: ['/nonexistent']
    })
    expect(result).to.deep.equal([])
  })

  it('should discover skills from extension skill/ directory', () => {
    const ext_dir = path.join(temp_dir, 'extensions')
    const my_ext = path.join(ext_dir, 'my-ext')
    const skill_dir = path.join(my_ext, 'skill')
    fs.mkdirSync(skill_dir, { recursive: true })
    fs.writeFileSync(
      path.join(my_ext, 'extension.md'),
      '---\nname: my-ext\n---\n'
    )
    fs.writeFileSync(
      path.join(skill_dir, 'analyze.md'),
      '---\ntitle: Analyze Data\ntype: skill\ndescription: Analyze data patterns\n---\n'
    )

    const result = discover_skills({
      extension_paths: [ext_dir],
      workflow_paths: []
    })
    expect(result).to.have.lengthOf(1)
    expect(result[0].name).to.equal('Analyze Data')
    expect(result[0].extension).to.equal('my-ext')
    expect(result[0].description).to.equal('Analyze data patterns')
  })

  it('should discover SKILL.md at extension root', () => {
    const ext_dir = path.join(temp_dir, 'extensions')
    const my_ext = path.join(ext_dir, 'my-ext')
    fs.mkdirSync(my_ext, { recursive: true })
    fs.writeFileSync(
      path.join(my_ext, 'extension.md'),
      '---\nname: my-ext\n---\n'
    )
    fs.writeFileSync(
      path.join(my_ext, 'SKILL.md'),
      '---\ntitle: Root Skill\ntype: skill\ndescription: A root-level skill\n---\n'
    )

    const result = discover_skills({
      extension_paths: [ext_dir],
      workflow_paths: []
    })
    expect(result).to.have.lengthOf(1)
    expect(result[0].name).to.equal('Root Skill')
    expect(result[0].extension).to.equal('my-ext')
  })

  it('should discover workflows from workflow directories', () => {
    const workflow_dir = path.join(temp_dir, 'workflows')
    fs.mkdirSync(workflow_dir)
    fs.writeFileSync(
      path.join(workflow_dir, 'build-report.md'),
      '---\ntitle: Build Report\ntype: workflow\ndescription: Generate a report\n---\n'
    )

    const result = discover_skills({
      extension_paths: [],
      workflow_paths: [workflow_dir]
    })
    expect(result).to.have.lengthOf(1)
    expect(result[0].name).to.equal('Build Report')
    expect(result[0].type).to.equal('workflow')
    expect(result[0].extension).to.be.null
  })

  it('should skip non-skill/workflow type entities in workflow directories', () => {
    const workflow_dir = path.join(temp_dir, 'workflows')
    fs.mkdirSync(workflow_dir)
    fs.writeFileSync(
      path.join(workflow_dir, 'a-task.md'),
      '---\ntitle: A Task\ntype: task\n---\n'
    )

    const result = discover_skills({
      extension_paths: [],
      workflow_paths: [workflow_dir]
    })
    expect(result).to.deep.equal([])
  })

  it('should combine results from multiple sources', () => {
    const ext_dir = path.join(temp_dir, 'extensions')
    const my_ext = path.join(ext_dir, 'my-ext')
    const skill_dir = path.join(my_ext, 'skill')
    fs.mkdirSync(skill_dir, { recursive: true })
    fs.writeFileSync(
      path.join(my_ext, 'extension.md'),
      '---\nname: my-ext\n---\n'
    )
    fs.writeFileSync(
      path.join(skill_dir, 'ext-skill.md'),
      '---\ntitle: Extension Skill\ntype: skill\n---\n'
    )

    const workflow_dir = path.join(temp_dir, 'workflows')
    fs.mkdirSync(workflow_dir)
    fs.writeFileSync(
      path.join(workflow_dir, 'wf-skill.md'),
      '---\ntitle: Workflow Skill\ntype: workflow\n---\n'
    )

    const result = discover_skills({
      extension_paths: [ext_dir],
      workflow_paths: [workflow_dir]
    })
    expect(result).to.have.lengthOf(2)
    expect(result.map((s) => s.name)).to.include.members([
      'Extension Skill',
      'Workflow Skill'
    ])
  })

  it('should handle missing or malformed skill files gracefully', () => {
    const workflow_dir = path.join(temp_dir, 'workflows')
    fs.mkdirSync(workflow_dir)
    fs.writeFileSync(
      path.join(workflow_dir, 'bad.md'),
      '---\n: invalid yaml\n---\n'
    )

    const result = discover_skills({
      extension_paths: [],
      workflow_paths: [workflow_dir]
    })
    // Should not throw, may or may not include the bad file
    expect(result).to.be.an('array')
  })

  it('should skip non-markdown files in skill directories', () => {
    const ext_dir = path.join(temp_dir, 'extensions')
    const my_ext = path.join(ext_dir, 'my-ext')
    const skill_dir = path.join(my_ext, 'skill')
    fs.mkdirSync(skill_dir, { recursive: true })
    fs.writeFileSync(
      path.join(my_ext, 'extension.md'),
      '---\nname: my-ext\n---\n'
    )
    fs.writeFileSync(path.join(skill_dir, 'notes.txt'), 'not a skill')

    const result = discover_skills({
      extension_paths: [ext_dir],
      workflow_paths: []
    })
    expect(result).to.deep.equal([])
  })
})
