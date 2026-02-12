// Shell metacharacters that could enable command injection
// Blocks: command chaining (;), pipes (|), command substitution (`$), redirects (><), background (&)
const SHELL_METACHARACTER_PATTERN = /[;|`$><&]/

/**
 * Validate command for dangerous shell metacharacters.
 * Note: This blocks commands containing these characters anywhere in the string,
 * including within quoted arguments. Use spawn with shell: false for commands
 * that need to pass arguments containing these characters.
 * @param {string} command - Command to validate
 * @throws {Error} if command contains dangerous metacharacters
 */
export function validate_shell_command(command) {
  if (SHELL_METACHARACTER_PATTERN.test(command)) {
    throw new Error(
      `Command rejected: contains shell metacharacters (;|$\`><&). Command: ${command.substring(0, 100)}...`
    )
  }
}

/**
 * Validate a queued CLI command for dangerous shell metacharacters.
 * More permissive than validate_shell_command -- allows $VAR/${VAR}
 * expansion and && conditional chaining, which scheduled commands depend on.
 *
 * Blocks: ; (chaining), | (pipes), ` (backtick substitution), $( (command
 * substitution), > < (redirects), standalone & (background execution)
 *
 * Allows: $VAR, ${VAR}, &&
 *
 * @param {string} command - Command to validate
 * @throws {Error} if command contains dangerous metacharacters
 */
export function validate_queued_command(command) {
  if (/;/.test(command)) {
    throw new Error(
      `Command rejected: contains semicolon (;). Command: ${command.substring(0, 100)}`
    )
  }

  if (/\|/.test(command)) {
    throw new Error(
      `Command rejected: contains pipe (|). Command: ${command.substring(0, 100)}`
    )
  }

  if (/`/.test(command)) {
    throw new Error(
      `Command rejected: contains backtick substitution. Command: ${command.substring(0, 100)}`
    )
  }

  if (/\$\(/.test(command)) {
    throw new Error(
      `Command rejected: contains command substitution $(...). Command: ${command.substring(0, 100)}`
    )
  }

  if (/[><]/.test(command)) {
    throw new Error(
      `Command rejected: contains redirect (> or <). Command: ${command.substring(0, 100)}`
    )
  }

  if (/(?<!&)&(?!&)/.test(command)) {
    throw new Error(
      `Command rejected: contains background operator (&). Command: ${command.substring(0, 100)}`
    )
  }
}
