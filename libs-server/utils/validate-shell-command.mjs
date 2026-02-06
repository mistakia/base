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
