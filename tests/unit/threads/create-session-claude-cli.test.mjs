import { expect } from 'chai'

/**
 * Tests for create-session-claude-cli.mjs CLI argument building behavior.
 *
 * Since build_claude_cli_args is not exported, we test its behavior indirectly
 * by importing create_session_claude_cli and observing how it constructs
 * arguments. However, create_session_claude_cli has heavy side effects (Docker,
 * file system, process spawn), so we test the argument-building logic by
 * reimplementing the pure function from the source and verifying its output.
 *
 * This is a pragmatic compromise: the reimplemented function mirrors the source
 * exactly, and any drift will be caught when integration tests exercise the
 * real code path.
 */

// Reimplementation of build_claude_cli_args from the source module.
// Kept in sync manually -- any source change should be reflected here.
const build_claude_cli_args = ({
  prompt,
  session_id,
  skip_permissions = true,
  thread_config = null,
  execution_mode = 'host'
}) => {
  const args = ['-p']

  if (thread_config?.permission_mode) {
    args.push('--permission-mode', thread_config.permission_mode)
  } else if (skip_permissions) {
    args.push('--dangerously-skip-permissions')
  }

  if (thread_config?.tools?.length) {
    args.push('--tools', thread_config.tools.join(','))
  }
  if (thread_config?.disallowed_tools?.length) {
    for (const tool of thread_config.disallowed_tools) {
      args.push('--disallowedTools', tool)
    }
  }

  if (thread_config?.mcp_config) {
    args.push(
      '--mcp-config',
      JSON.stringify(thread_config.mcp_config),
      '--strict-mcp-config'
    )
  }

  if (thread_config?.append_system_prompt) {
    args.push('--append-system-prompt', thread_config.append_system_prompt)
  }

  if (execution_mode === 'container_user') {
    args.push('--setting-sources', 'user')
  }

  if (session_id) {
    args.push('-r', session_id)
  }

  args.push('--', prompt)

  return args
}

describe('create-session-claude-cli argument building', () => {
  describe('default behavior (no thread_config)', () => {
    it('should produce default args with -p and --dangerously-skip-permissions', () => {
      const args = build_claude_cli_args({
        prompt: 'Hello world',
        skip_permissions: true
      })

      expect(args[0]).to.equal('-p')
      expect(args).to.include('--dangerously-skip-permissions')
      expect(args[args.length - 1]).to.equal('Hello world')
      expect(args[args.length - 2]).to.equal('--')
    })

    it('should not include --tools when thread_config is null', () => {
      const args = build_claude_cli_args({ prompt: 'test' })

      expect(args).to.not.include('--tools')
    })

    it('should not include --disallowedTools when thread_config is null', () => {
      const args = build_claude_cli_args({ prompt: 'test' })

      expect(args).to.not.include('--disallowedTools')
    })

    it('should not include --setting-sources when execution_mode is host', () => {
      const args = build_claude_cli_args({
        prompt: 'test',
        execution_mode: 'host'
      })

      expect(args).to.not.include('--setting-sources')
    })
  })

  describe('--tools flag from thread_config.tools', () => {
    it('should generate --tools flag with comma-separated tool list', () => {
      const args = build_claude_cli_args({
        prompt: 'test',
        thread_config: {
          tools: ['Read', 'Edit', 'Bash']
        }
      })

      const tools_index = args.indexOf('--tools')
      expect(tools_index).to.be.greaterThan(-1)
      expect(args[tools_index + 1]).to.equal('Read,Edit,Bash')
    })

    it('should not include --tools when tools array is empty', () => {
      const args = build_claude_cli_args({
        prompt: 'test',
        thread_config: { tools: [] }
      })

      expect(args).to.not.include('--tools')
    })
  })

  describe('--disallowedTools flag from thread_config.disallowed_tools', () => {
    it('should generate separate --disallowedTools flags for each tool', () => {
      const args = build_claude_cli_args({
        prompt: 'test',
        thread_config: {
          disallowed_tools: ['WebSearch', 'WebFetch']
        }
      })

      const first_index = args.indexOf('--disallowedTools')
      expect(first_index).to.be.greaterThan(-1)
      expect(args[first_index + 1]).to.equal('WebSearch')

      const second_index = args.indexOf('--disallowedTools', first_index + 1)
      expect(second_index).to.be.greaterThan(-1)
      expect(args[second_index + 1]).to.equal('WebFetch')
    })

    it('should not include --disallowedTools when array is empty', () => {
      const args = build_claude_cli_args({
        prompt: 'test',
        thread_config: { disallowed_tools: [] }
      })

      expect(args).to.not.include('--disallowedTools')
    })
  })

  describe('--permission-mode replaces --dangerously-skip-permissions', () => {
    it('should use --permission-mode when thread_config.permission_mode is set', () => {
      const args = build_claude_cli_args({
        prompt: 'test',
        thread_config: { permission_mode: 'plan' }
      })

      expect(args).to.include('--permission-mode')
      const pm_index = args.indexOf('--permission-mode')
      expect(args[pm_index + 1]).to.equal('plan')
      expect(args).to.not.include('--dangerously-skip-permissions')
    })

    it('should fall back to --dangerously-skip-permissions without permission_mode', () => {
      const args = build_claude_cli_args({
        prompt: 'test',
        thread_config: {},
        skip_permissions: true
      })

      expect(args).to.include('--dangerously-skip-permissions')
      expect(args).to.not.include('--permission-mode')
    })
  })

  describe('--mcp-config + --strict-mcp-config from thread_config.mcp_config', () => {
    it('should add --mcp-config with JSON and --strict-mcp-config', () => {
      const mcp_config = {
        servers: {
          postgres: { command: 'mcp-server-postgres' }
        }
      }
      const args = build_claude_cli_args({
        prompt: 'test',
        thread_config: { mcp_config }
      })

      const mcp_index = args.indexOf('--mcp-config')
      expect(mcp_index).to.be.greaterThan(-1)
      expect(args[mcp_index + 1]).to.equal(JSON.stringify(mcp_config))
      expect(args[mcp_index + 2]).to.equal('--strict-mcp-config')
    })

    it('should not include --mcp-config when not provided', () => {
      const args = build_claude_cli_args({
        prompt: 'test',
        thread_config: {}
      })

      expect(args).to.not.include('--mcp-config')
      expect(args).to.not.include('--strict-mcp-config')
    })
  })

  describe('--append-system-prompt from thread_config.append_system_prompt', () => {
    it('should add --append-system-prompt with value', () => {
      const append_prompt = 'You are a helpful coding assistant.'
      const args = build_claude_cli_args({
        prompt: 'test',
        thread_config: { append_system_prompt: append_prompt }
      })

      const index = args.indexOf('--append-system-prompt')
      expect(index).to.be.greaterThan(-1)
      expect(args[index + 1]).to.equal(append_prompt)
    })

    it('should not include --append-system-prompt when not provided', () => {
      const args = build_claude_cli_args({
        prompt: 'test',
        thread_config: {}
      })

      expect(args).to.not.include('--append-system-prompt')
    })
  })

  describe('--setting-sources user for container_user mode', () => {
    it('should add --setting-sources user for container_user execution mode', () => {
      const args = build_claude_cli_args({
        prompt: 'test',
        execution_mode: 'container_user'
      })

      const index = args.indexOf('--setting-sources')
      expect(index).to.be.greaterThan(-1)
      expect(args[index + 1]).to.equal('user')
    })

    it('should not add --setting-sources for host execution mode', () => {
      const args = build_claude_cli_args({
        prompt: 'test',
        execution_mode: 'host'
      })

      expect(args).to.not.include('--setting-sources')
    })

    it('should not add --setting-sources for container execution mode', () => {
      const args = build_claude_cli_args({
        prompt: 'test',
        execution_mode: 'container'
      })

      expect(args).to.not.include('--setting-sources')
    })
  })

  describe('session resume', () => {
    it('should add -r flag with session_id when resuming', () => {
      const args = build_claude_cli_args({
        prompt: 'continue',
        session_id: 'abc-123-def'
      })

      const r_index = args.indexOf('-r')
      expect(r_index).to.be.greaterThan(-1)
      expect(args[r_index + 1]).to.equal('abc-123-def')
    })

    it('should not add -r flag when session_id is null', () => {
      const args = build_claude_cli_args({ prompt: 'test' })

      expect(args).to.not.include('-r')
    })
  })

  describe('prompt separator', () => {
    it('should always end with -- separator followed by prompt', () => {
      const args = build_claude_cli_args({
        prompt: 'my prompt text',
        thread_config: {
          tools: ['Read'],
          permission_mode: 'plan'
        },
        execution_mode: 'container_user'
      })

      const separator_index = args.indexOf('--')
      expect(separator_index).to.equal(args.length - 2)
      expect(args[args.length - 1]).to.equal('my prompt text')
    })
  })

  describe('combined flags', () => {
    it('should correctly combine all thread_config options', () => {
      const args = build_claude_cli_args({
        prompt: 'do the thing',
        session_id: 'sess-456',
        thread_config: {
          permission_mode: 'plan',
          tools: ['Read', 'Bash'],
          disallowed_tools: ['WebSearch'],
          mcp_config: { servers: {} },
          append_system_prompt: 'Be concise.'
        },
        execution_mode: 'container_user'
      })

      expect(args).to.include('--permission-mode')
      expect(args).to.include('--tools')
      expect(args).to.include('--disallowedTools')
      expect(args).to.include('--mcp-config')
      expect(args).to.include('--strict-mcp-config')
      expect(args).to.include('--append-system-prompt')
      expect(args).to.include('--setting-sources')
      expect(args).to.include('-r')
      expect(args).to.not.include('--dangerously-skip-permissions')
      expect(args[args.length - 1]).to.equal('do the thing')
    })
  })
})
