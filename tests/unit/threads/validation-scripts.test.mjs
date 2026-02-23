import { expect } from 'chai'
import { execFile } from 'child_process'
import { resolve } from 'path'

const VALIDATE_USER_COMMAND = resolve(
  'config/base-container/validate-user-command.sh'
)
const VALIDATE_FILE_ACCESS = resolve(
  'config/base-container/validate-file-access.sh'
)

/**
 * Run a validation script with JSON input piped to stdin.
 * Uses 'bash' as the interpreter since the scripts may not have +x permission
 * in the repository checkout.
 * Returns { stdout, stderr, exit_code }.
 */
const run_validation_script = (script_path, input_json) => {
  return new Promise((resolve) => {
    const child = execFile(
      'bash',
      [script_path],
      { timeout: 5000 },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exit_code: error ? error.code || 1 : 0
        })
      }
    )
    child.stdin.write(JSON.stringify(input_json))
    child.stdin.end()
  })
}

/**
 * Parse a deny decision from script stdout.
 * Returns null if the script produced no JSON output (allowed).
 */
const parse_decision = (stdout) => {
  if (!stdout) return null
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

describe('validation-scripts', function () {
  // Shell script execution can be slow on CI
  this.timeout(10000)

  describe('validate-user-command.sh', () => {
    describe('blocking network tools', () => {
      const network_tools = ['curl', 'wget', 'nc', 'ssh']

      for (const tool of network_tools) {
        it(`should block '${tool}' command`, async () => {
          const result = await run_validation_script(VALIDATE_USER_COMMAND, {
            tool_name: 'Bash',
            input: { command: `${tool} http://example.com` }
          })

          const decision = parse_decision(result.stdout)
          expect(decision).to.not.be.null
          expect(decision.decision).to.equal('deny')
          expect(decision.reason).to.be.a('string')
        })
      }

      it('should block network tools in piped commands', async () => {
        const result = await run_validation_script(VALIDATE_USER_COMMAND, {
          tool_name: 'Bash',
          input: { command: 'echo hello | curl http://example.com' }
        })

        const decision = parse_decision(result.stdout)
        expect(decision).to.not.be.null
        expect(decision.decision).to.equal('deny')
      })
    })

    describe('blocking destructive commands', () => {
      it('should block rm -rf', async () => {
        const result = await run_validation_script(VALIDATE_USER_COMMAND, {
          tool_name: 'Bash',
          input: { command: 'rm -rf /tmp/something' }
        })

        const decision = parse_decision(result.stdout)
        expect(decision).to.not.be.null
        expect(decision.decision).to.equal('deny')
      })

      it('should block sudo', async () => {
        const result = await run_validation_script(VALIDATE_USER_COMMAND, {
          tool_name: 'Bash',
          input: { command: 'sudo apt update' }
        })

        const decision = parse_decision(result.stdout)
        expect(decision).to.not.be.null
        expect(decision.decision).to.equal('deny')
      })

      it('should block docker', async () => {
        const result = await run_validation_script(VALIDATE_USER_COMMAND, {
          tool_name: 'Bash',
          input: { command: 'docker exec -it container bash' }
        })

        const decision = parse_decision(result.stdout)
        expect(decision).to.not.be.null
        expect(decision.decision).to.equal('deny')
      })

      it('should block chmod', async () => {
        const result = await run_validation_script(VALIDATE_USER_COMMAND, {
          tool_name: 'Bash',
          input: { command: 'chmod 777 /tmp/file' }
        })

        const decision = parse_decision(result.stdout)
        expect(decision).to.not.be.null
        expect(decision.decision).to.equal('deny')
      })
    })

    describe('allowing safe commands', () => {
      const safe_commands = [
        'ls -la /home/node',
        'cat /home/node/file.txt',
        'grep -r pattern src/',
        'node index.mjs',
        'git status',
        'git diff',
        'echo hello world',
        'pwd',
        'wc -l file.txt'
      ]

      for (const cmd of safe_commands) {
        it(`should allow '${cmd}'`, async () => {
          const result = await run_validation_script(VALIDATE_USER_COMMAND, {
            tool_name: 'Bash',
            input: { command: cmd }
          })

          const decision = parse_decision(result.stdout)
          expect(decision).to.be.null
          expect(result.exit_code).to.equal(0)
        })
      }
    })

    it('should exit 0 with no output when command is empty', async () => {
      const result = await run_validation_script(VALIDATE_USER_COMMAND, {
        tool_name: 'Bash',
        input: {}
      })

      expect(result.stdout).to.equal('')
      expect(result.exit_code).to.equal(0)
    })
  })

  describe('validate-file-access.sh', () => {
    describe('blocking path traversal', () => {
      it('should block paths with ..', async () => {
        const result = await run_validation_script(VALIDATE_FILE_ACCESS, {
          tool_name: 'Read',
          input: { file_path: '/home/node/user-base/../../../etc/passwd' }
        })

        const decision = parse_decision(result.stdout)
        expect(decision).to.not.be.null
        expect(decision.decision).to.equal('deny')
        expect(decision.reason).to.include('..')
      })

      it('should block relative path traversal at start', async () => {
        const result = await run_validation_script(VALIDATE_FILE_ACCESS, {
          tool_name: 'Read',
          input: { file_path: '../secret/file.txt' }
        })

        const decision = parse_decision(result.stdout)
        expect(decision).to.not.be.null
        expect(decision.decision).to.equal('deny')
      })
    })

    describe('blocking ~/.claude/ access', () => {
      it('should block access to .claude directory', async () => {
        const result = await run_validation_script(VALIDATE_FILE_ACCESS, {
          tool_name: 'Read',
          input: { file_path: '/home/node/.claude/settings.json' }
        })

        const decision = parse_decision(result.stdout)
        expect(decision).to.not.be.null
        expect(decision.decision).to.equal('deny')
        expect(decision.reason).to.include('Claude configuration')
      })

      it('should block .claude directory via pattern field', async () => {
        const result = await run_validation_script(VALIDATE_FILE_ACCESS, {
          tool_name: 'Glob',
          input: { pattern: '/home/node/.claude/**' }
        })

        const decision = parse_decision(result.stdout)
        expect(decision).to.not.be.null
        expect(decision.decision).to.equal('deny')
      })
    })

    describe('blocking system paths', () => {
      const system_paths = [
        { path: '/etc/passwd', label: '/etc/' },
        { path: '/usr/bin/env', label: '/usr/' },
        { path: '/proc/1/status', label: '/proc/' }
      ]

      for (const { path: sys_path, label } of system_paths) {
        it(`should block access to ${label}`, async () => {
          const result = await run_validation_script(VALIDATE_FILE_ACCESS, {
            tool_name: 'Read',
            input: { file_path: sys_path }
          })

          const decision = parse_decision(result.stdout)
          expect(decision).to.not.be.null
          expect(decision.decision).to.equal('deny')
          expect(decision.reason).to.include('system path')
        })
      }
    })

    describe('allowing valid paths', () => {
      const valid_paths = [
        '/home/node/user-base/task/my-task.md',
        '/home/node/user-base/text/readme.md',
        '/home/node/project/src/index.mjs',
        '/workspace/data/output.json'
      ]

      for (const file_path of valid_paths) {
        it(`should allow access to '${file_path}'`, async () => {
          const result = await run_validation_script(VALIDATE_FILE_ACCESS, {
            tool_name: 'Read',
            input: { file_path }
          })

          const decision = parse_decision(result.stdout)
          expect(decision).to.be.null
          expect(result.exit_code).to.equal(0)
        })
      }
    })

    it('should exit 0 with no output when file_path is empty', async () => {
      const result = await run_validation_script(VALIDATE_FILE_ACCESS, {
        tool_name: 'Read',
        input: {}
      })

      expect(result.stdout).to.equal('')
      expect(result.exit_code).to.equal(0)
    })

    it('should extract path from the path field as well', async () => {
      const result = await run_validation_script(VALIDATE_FILE_ACCESS, {
        tool_name: 'Grep',
        input: { path: '/etc/shadow' }
      })

      const decision = parse_decision(result.stdout)
      expect(decision).to.not.be.null
      expect(decision.decision).to.equal('deny')
    })
  })
})
