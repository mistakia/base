/* global describe it */
import chai from 'chai'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execute = promisify(exec)
const expect = chai.expect

const cli_path = path.resolve('./cli/base.mjs')
const run = (args) =>
  execute(`bun ${cli_path} ${args}`, {
    cwd: path.resolve('.'),
    env: { ...process.env, NODE_ENV: 'test' },
    maxBuffer: 10 * 1024 * 1024
  })

describe('Unified Base CLI', function () {
  this.timeout(30000)

  describe('top-level', () => {
    it('should show help with --help', async () => {
      const { stdout } = await run('--help')
      expect(stdout).to.include('base <command>')
      expect(stdout).to.include('entity')
      expect(stdout).to.include('relation')
      expect(stdout).to.include('tag')
      expect(stdout).to.include('thread')
      expect(stdout).to.include('search')
      expect(stdout).to.include('queue')
    })

    it('should show error for unknown subcommand', async () => {
      try {
        await run('nonexistent')
        expect.fail('should have thrown')
      } catch (error) {
        expect(error.stderr || error.stdout).to.include('Unknown argument')
      }
    })
  })

  describe('entity subcommand', () => {
    it('should show entity help', async () => {
      const { stdout } = await run('entity --help')
      expect(stdout).to.include('list')
      expect(stdout).to.include('get')
      expect(stdout).to.include('move')
      expect(stdout).to.include('validate')
    })

    it('should list entities with --json flag', async () => {
      const { stdout } = await run('entity list -t task --limit 2 --json')
      const parsed = JSON.parse(stdout.trim())
      expect(parsed).to.be.an('array')
    })

    it('should get entity by base_uri with --json flag', async () => {
      // First list to find a known entity
      const { stdout: list_output } = await run(
        'entity list -t task --limit 1 --json'
      )
      const entities = JSON.parse(list_output.trim())
      if (entities.length === 0) {
        return // Skip if no entities exist
      }

      const entity = entities[0]
      // Skip when API server returns redacted entities (no auth token)
      if (entity.is_redacted) {
        return
      }

      const { stdout } = await run(`entity get "${entity.base_uri}" --json`)
      const parsed = JSON.parse(stdout.trim())
      expect(parsed).to.be.an('array').with.lengthOf(1)
      expect(parsed[0]).to.have.property('base_uri', entity.base_uri)
    })
  })

  describe('relation subcommand', () => {
    it('should show relation help', async () => {
      const { stdout } = await run('relation --help')
      expect(stdout).to.include('list')
      expect(stdout).to.include('forward')
      expect(stdout).to.include('reverse')
    })
  })

  describe('tag subcommand', () => {
    it('should show tag help', async () => {
      const { stdout } = await run('tag --help')
      expect(stdout).to.include('list')
      expect(stdout).to.include('stats')
      expect(stdout).to.include('add')
      expect(stdout).to.include('remove')
    })
  })

  describe('thread subcommand', () => {
    it('should show thread help', async () => {
      const { stdout } = await run('thread --help')
      expect(stdout).to.include('list')
      expect(stdout).to.include('archive')
      expect(stdout).to.include('analyze')
    })
  })

  describe('search subcommand', () => {
    it('should show search help', async () => {
      const { stdout } = await run('search --help')
      expect(stdout).to.include('query')
      expect(stdout).to.include('limit')
    })
  })

  describe('queue subcommand', () => {
    it('should show queue help', async () => {
      const { stdout } = await run('queue --help')
      expect(stdout).to.include('add')
      expect(stdout).to.include('status')
      expect(stdout).to.include('stats')
    })
  })

  describe('global options', () => {
    it('should accept --json flag on entity list', async () => {
      const { stdout } = await run('entity list -t task --limit 1 --json')
      // Should be valid JSON
      expect(() => JSON.parse(stdout.trim())).to.not.throw()
    })

    it('should accept --verbose flag on entity list', async () => {
      const { stdout } = await run('entity list -t task --limit 1 --verbose')
      // Verbose output has indented fields
      if (!stdout.includes('No entities found')) {
        expect(stdout).to.include('  ')
      }
    })
  })
})
