import { expect } from 'chai'

import { execute_command } from '#libs-server/cli-queue/execute-command.mjs'

describe('CLI Queue', function () {
  this.timeout(10000)

  describe('execute_command', () => {
    it('should execute a simple command successfully', async () => {
      const result = await execute_command({
        command: 'echo "hello world"',
        timeout_ms: 5000
      })

      expect(result.success).to.be.true
      expect(result.exit_code).to.equal(0)
      expect(result.stdout.trim()).to.equal('hello world')
      expect(result.timed_out).to.be.false
      expect(result.duration_ms).to.be.a('number')
    })

    it('should capture stderr output', async () => {
      // Use a command that writes to stderr without shell redirection operators
      // The 'ls' command with a non-existent file writes an error to stderr
      const result = await execute_command({
        command: 'ls /nonexistent_path_for_test_12345',
        timeout_ms: 5000
      })

      expect(result.exit_code).to.not.equal(0)
      expect(result.stderr).to.include('No such file')
    })

    it('should return correct exit code for failing command', async () => {
      const result = await execute_command({
        command: 'exit 42',
        timeout_ms: 5000
      })

      expect(result.success).to.be.false
      expect(result.exit_code).to.equal(42)
    })

    it('should handle command timeout', async () => {
      const result = await execute_command({
        command: 'sleep 10',
        timeout_ms: 100
      })

      expect(result.success).to.be.false
      expect(result.timed_out).to.be.true
    })

    it('should respect working directory', async () => {
      const result = await execute_command({
        command: 'pwd',
        working_directory: '/tmp',
        timeout_ms: 5000
      })

      expect(result.success).to.be.true
      // On macOS /tmp is a symlink to /private/tmp
      expect(result.stdout.trim()).to.satisfy(
        (path) => path === '/tmp' || path === '/private/tmp'
      )
    })

    it('should handle non-existent command', async () => {
      const result = await execute_command({
        command: 'nonexistent_command_xyz123',
        timeout_ms: 5000
      })

      expect(result.success).to.be.false
      expect(result.exit_code).to.not.equal(0)
    })

    it('should capture multi-line output', async () => {
      // Use printf which can output multiple lines without shell metacharacters
      const result = await execute_command({
        command: 'printf "line1\\nline2\\nline3\\n"',
        timeout_ms: 5000
      })

      expect(result.success).to.be.true
      const lines = result.stdout.trim().split('\n')
      expect(lines).to.have.lengthOf(3)
      expect(lines[0]).to.equal('line1')
      expect(lines[1]).to.equal('line2')
      expect(lines[2]).to.equal('line3')
    })
  })
})
