/* global describe, it, beforeEach, afterEach */

import { expect } from 'chai'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const BASE_CLI = path.join(process.cwd(), 'cli', 'base.mjs')

describe('extension CLI commands', () => {
  let temp_dir

  beforeEach(() => {
    temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-cli-test-'))
  })

  afterEach(() => {
    fs.rmSync(temp_dir, { recursive: true, force: true })
  })

  function run_cli(args, env_overrides = {}) {
    const env = {
      ...process.env,
      USER_BASE_DIRECTORY: temp_dir,
      NODE_ENV: undefined,
      ...env_overrides
    }
    return execSync(`bun ${BASE_CLI} ${args}`, {
      env,
      encoding: 'utf-8',
      timeout: 15000
    }).trim()
  }

  describe('base extension list', () => {
    it('should show no extensions when directory is empty', () => {
      const output = run_cli('extension list')
      expect(output).to.equal('No extensions found')
    })

    it('should list extensions with extension.md', () => {
      const ext_dir = path.join(temp_dir, 'extension', 'test-ext')
      fs.mkdirSync(ext_dir, { recursive: true })
      fs.writeFileSync(
        path.join(ext_dir, 'extension.md'),
        '---\nname: test-ext\ndescription: Test extension\n---\n'
      )
      fs.writeFileSync(
        path.join(ext_dir, 'command.mjs'),
        'export const command = "test-ext"\nexport const describe = "Test"\nexport const builder = () => {}\nexport const handler = () => {}\n'
      )

      const output = run_cli('extension list')
      expect(output).to.include('test-ext')
      expect(output).to.include('commands')
    })

    it('should support --json flag', () => {
      const ext_dir = path.join(temp_dir, 'extension', 'json-ext')
      fs.mkdirSync(ext_dir, { recursive: true })
      fs.writeFileSync(
        path.join(ext_dir, 'extension.md'),
        '---\nname: json-ext\ndescription: JSON test\n---\n'
      )
      fs.writeFileSync(path.join(ext_dir, 'command.mjs'), '')

      const output = run_cli('extension list --json')
      const parsed = JSON.parse(output)
      expect(parsed).to.be.an('array')
      expect(parsed).to.have.lengthOf(1)
      expect(parsed[0].name).to.equal('json-ext')
    })
  })

  describe('base skill list', () => {
    it('should discover skills from workflow directories', () => {
      const workflow_dir = path.join(temp_dir, 'workflow')
      fs.mkdirSync(workflow_dir, { recursive: true })
      fs.writeFileSync(
        path.join(workflow_dir, 'test-workflow.md'),
        '---\ntitle: Test Workflow\ntype: workflow\ndescription: A test workflow\n---\n'
      )

      const output = run_cli('skill list')
      expect(output).to.include('Test Workflow')
    })

    it('should support --json flag', () => {
      const workflow_dir = path.join(temp_dir, 'workflow')
      fs.mkdirSync(workflow_dir, { recursive: true })
      fs.writeFileSync(
        path.join(workflow_dir, 'test-skill.md'),
        '---\ntitle: JSON Skill\ntype: skill\ndescription: JSON test\n---\n'
      )

      const output = run_cli('skill list --json')
      const parsed = JSON.parse(output)
      expect(parsed).to.be.an('array')
      expect(parsed.length).to.be.greaterThan(0)
      const json_skill = parsed.find((s) => s.name === 'JSON Skill')
      expect(json_skill).to.exist
    })
  })

  describe('dynamic extension command registration', () => {
    it('should handle broken extensions gracefully', () => {
      const ext_dir = path.join(temp_dir, 'extension', 'broken')
      fs.mkdirSync(ext_dir, { recursive: true })
      fs.writeFileSync(
        path.join(ext_dir, 'extension.md'),
        '---\nname: broken\n---\n'
      )
      fs.writeFileSync(
        path.join(ext_dir, 'command.mjs'),
        'throw new Error("intentional breakage")\n'
      )

      // Should not throw, just warn
      const output = run_cli('extension list 2>&1')
      // The broken extension should not appear in the list but CLI should work
      expect(output).to.be.a('string')
    })
  })
})
