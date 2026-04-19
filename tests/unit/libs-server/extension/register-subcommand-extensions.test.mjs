/* global describe, it, beforeEach */

import { expect } from 'chai'

import {
  register_subcommand_contributor,
  register_subcommand_extensions,
  clear_subcommand_contributors,
  get_subcommand_contributors
} from '#libs-server/extension/register-subcommand-extensions.mjs'

describe('register_subcommand_extensions', () => {
  beforeEach(() => {
    clear_subcommand_contributors()
  })

  it('should return the yargs instance unchanged when no contributors registered', () => {
    const yargs_stub = { command: () => yargs_stub, _marker: 'untouched' }
    const result = register_subcommand_extensions(yargs_stub, 'thread')
    expect(result).to.equal(yargs_stub)
  })

  it('should invoke register_subcommands on each contributor for the group', () => {
    const calls = []
    const yargs_stub = { command: () => yargs_stub }
    register_subcommand_contributor({
      group_name: 'thread',
      extension_name: 'alpha',
      module: {
        register_subcommands: (y) => {
          calls.push('alpha')
          return y
        }
      }
    })
    register_subcommand_contributor({
      group_name: 'thread',
      extension_name: 'beta',
      module: {
        register_subcommands: (y) => {
          calls.push('beta')
          return y
        }
      }
    })
    register_subcommand_contributor({
      group_name: 'entity',
      extension_name: 'gamma',
      module: {
        register_subcommands: (y) => {
          calls.push('gamma')
          return y
        }
      }
    })

    register_subcommand_extensions(yargs_stub, 'thread')
    expect(calls).to.deep.equal(['alpha', 'beta'])
  })

  it('should ignore modules without a register_subcommands function', () => {
    register_subcommand_contributor({
      group_name: 'thread',
      extension_name: 'no-op',
      module: { something: 1 }
    })
    expect(get_subcommand_contributors('thread')).to.deep.equal([])
  })

  it('should isolate groups from each other', () => {
    register_subcommand_contributor({
      group_name: 'thread',
      extension_name: 'a',
      module: { register_subcommands: (y) => y }
    })
    register_subcommand_contributor({
      group_name: 'entity',
      extension_name: 'b',
      module: { register_subcommands: (y) => y }
    })
    expect(get_subcommand_contributors('thread')).to.have.lengthOf(1)
    expect(get_subcommand_contributors('entity')).to.have.lengthOf(1)
    expect(get_subcommand_contributors('missing')).to.deep.equal([])
  })

  it('should catch contributor errors and continue with other contributors', () => {
    const calls = []
    const yargs_stub = { command: () => yargs_stub }
    register_subcommand_contributor({
      group_name: 'thread',
      extension_name: 'bad',
      module: {
        register_subcommands: () => {
          throw new Error('boom')
        }
      }
    })
    register_subcommand_contributor({
      group_name: 'thread',
      extension_name: 'good',
      module: {
        register_subcommands: (y) => {
          calls.push('good')
          return y
        }
      }
    })

    const original_error = console.error
    console.error = () => {}
    try {
      register_subcommand_extensions(yargs_stub, 'thread')
    } finally {
      console.error = original_error
    }
    expect(calls).to.deep.equal(['good'])
  })
})
