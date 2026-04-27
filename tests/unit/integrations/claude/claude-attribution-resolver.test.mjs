import { expect } from 'chai'
import { homedir } from 'os'

import { build_claude_attribution_resolver } from '#libs-server/integrations/claude/claude-attribution-resolver.mjs'

const HOME = homedir()

// Helper: build a raw_session with a given file_path
const make_session = (file_path) => ({
  session_id: 'test-session',
  metadata: { file_path }
})

describe('build_claude_attribution_resolver', () => {
  describe('null / degenerate inputs', () => {
    it('returns null when machine_registry is null', () => {
      const resolver = build_claude_attribution_resolver({
        machine_registry: null
      })
      expect(resolver(make_session(`${HOME}/.claude/projects/foo.jsonl`))).to.be.null
    })

    it('returns null when raw_session has no metadata', () => {
      const registry = {
        macbook: {
          claude_paths: { host_config_dir: { main: `${HOME}/.claude/` } }
        }
      }
      const resolver = build_claude_attribution_resolver({
        machine_registry: registry
      })
      expect(resolver({})).to.be.null
      expect(resolver({ metadata: {} })).to.be.null
      expect(resolver(null)).to.be.null
    })

    it('returns null on no match', () => {
      const registry = {
        macbook: {
          claude_paths: { host_config_dir: { main: `${HOME}/.claude/` } }
        }
      }
      const resolver = build_claude_attribution_resolver({
        machine_registry: registry
      })
      expect(
        resolver(make_session('/some/completely/unknown/path/foo.jsonl'))
      ).to.be.null
    })
  })

  describe('host_config_dir', () => {
    it('resolves to controlled_host for a path under host_config_dir', () => {
      const registry = {
        macbook: {
          claude_paths: {
            host_config_dir: {
              primary: `${HOME}/.claude-primary/`
            }
          }
        }
      }
      const resolver = build_claude_attribution_resolver({
        machine_registry: registry
      })
      const result = resolver(
        make_session(`${HOME}/.claude-primary/projects/session.jsonl`)
      )
      expect(result).to.deep.equal({
        environment: 'controlled_host',
        machine_id: 'macbook',
        container_runtime: null,
        container_name: null,
        account_namespace: 'primary'
      })
    })

    it('tilde-expands paths', () => {
      const registry = {
        macbook: {
          claude_paths: {
            host_config_dir: {
              main: '~/.claude/'
            }
          }
        }
      }
      const resolver = build_claude_attribution_resolver({
        machine_registry: registry
      })
      const result = resolver(
        make_session(`${HOME}/.claude/projects/abc.jsonl`)
      )
      expect(result).not.to.be.null
      expect(result.environment).to.equal('controlled_host')
      expect(result.machine_id).to.equal('macbook')
    })
  })

  describe('admin_data_dir', () => {
    it('resolves to controlled_container with base-container', () => {
      const registry = {
        storage: {
          claude_paths: {
            admin_data_dir: {
              primary: '~/.base-container-data/claude-primary/'
            }
          }
        }
      }
      const resolver = build_claude_attribution_resolver({
        machine_registry: registry
      })
      const result = resolver(
        make_session(
          `${HOME}/.base-container-data/claude-primary/projects/sess.jsonl`
        )
      )
      expect(result).to.deep.equal({
        environment: 'controlled_container',
        machine_id: 'storage',
        container_runtime: 'docker',
        container_name: 'base-container',
        account_namespace: 'primary'
      })
    })
  })

  describe('user_data_dirs', () => {
    it('resolves to controlled_container with base-user-<username>', () => {
      const registry = {
        storage: {
          claude_paths: {
            user_data_dirs: {
              arrin: {
                main: '~/.base-user-arrin-data/claude/'
              }
            }
          }
        }
      }
      const resolver = build_claude_attribution_resolver({
        machine_registry: registry
      })
      const result = resolver(
        make_session(
          `${HOME}/.base-user-arrin-data/claude/projects/s.jsonl`
        )
      )
      expect(result).to.deep.equal({
        environment: 'controlled_container',
        machine_id: 'storage',
        container_runtime: 'docker',
        container_name: 'base-user-arrin',
        account_namespace: 'main'
      })
    })
  })

  describe('multiple machines', () => {
    it('resolves to the correct machine for each path', () => {
      const registry = {
        macbook: {
          claude_paths: {
            host_config_dir: { main: `${HOME}/.claude/` }
          }
        },
        storage: {
          claude_paths: {
            admin_data_dir: { work: `${HOME}/.base-container-data/work/` }
          }
        }
      }
      const resolver = build_claude_attribution_resolver({
        machine_registry: registry
      })

      const macbook_result = resolver(
        make_session(`${HOME}/.claude/projects/s.jsonl`)
      )
      expect(macbook_result.machine_id).to.equal('macbook')
      expect(macbook_result.environment).to.equal('controlled_host')

      const storage_result = resolver(
        make_session(`${HOME}/.base-container-data/work/projects/s.jsonl`)
      )
      expect(storage_result.machine_id).to.equal('storage')
      expect(storage_result.environment).to.equal('controlled_container')
    })
  })

  describe('longest-prefix match', () => {
    it('longer prefix wins over shorter', () => {
      const registry = {
        storage: {
          claude_paths: {
            admin_data_dir: {
              work: `${HOME}/.base-container-data/claude-work/`,
              root: `${HOME}/.base-container-data/`
            }
          }
        }
      }
      const resolver = build_claude_attribution_resolver({
        machine_registry: registry
      })
      // Should match 'work' (longer prefix), not 'root'
      const result = resolver(
        make_session(
          `${HOME}/.base-container-data/claude-work/projects/s.jsonl`
        )
      )
      expect(result.account_namespace).to.equal('work')
    })
  })

  describe('archive exclusion', () => {
    it('returns null for paths under /mnt/md0/claude-directory-archive/', () => {
      const registry = {
        macbook: {
          claude_paths: {
            host_config_dir: { main: '/mnt/md0/claude-directory-archive/' }
          }
        }
      }
      const resolver = build_claude_attribution_resolver({
        machine_registry: registry
      })
      // Even if we had a matching prefix, archive paths must be excluded
      const result = resolver(
        make_session(
          '/mnt/md0/claude-directory-archive/projects/session.jsonl'
        )
      )
      expect(result).to.be.null
    })

    it('returns null for paths under /Users/trashman/claude-directory-archive/', () => {
      const registry = {
        macbook: {
          claude_paths: {
            host_config_dir: {
              main: '/Users/trashman/claude-directory-archive/'
            }
          }
        }
      }
      const resolver = build_claude_attribution_resolver({
        machine_registry: registry
      })
      const result = resolver(
        make_session(
          '/Users/trashman/claude-directory-archive/projects/session.jsonl'
        )
      )
      expect(result).to.be.null
    })
  })

  describe('multiple accounts per machine', () => {
    it('resolves the correct account_namespace', () => {
      const registry = {
        'test-host': {
          claude_paths: {
            host_config_dir: {
              'test-primary': `${HOME}/.claude-test-primary/`,
              'test-secondary': `${HOME}/.claude-test-secondary/`
            }
          }
        }
      }
      const resolver = build_claude_attribution_resolver({
        machine_registry: registry
      })

      const primary = resolver(
        make_session(`${HOME}/.claude-test-primary/projects/s.jsonl`)
      )
      expect(primary.account_namespace).to.equal('test-primary')

      const secondary = resolver(
        make_session(`${HOME}/.claude-test-secondary/projects/s.jsonl`)
      )
      expect(secondary.account_namespace).to.equal('test-secondary')
    })
  })
})
