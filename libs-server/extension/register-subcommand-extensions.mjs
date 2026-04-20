/**
 * Registry and registration helpers for extensions that contribute
 * subcommands to an existing built-in command group.
 *
 * Extensions declare `subcommand_of: <group>` in their manifest frontmatter
 * and export `register_subcommands(yargs)` from command.mjs. The CLI entry
 * point (cli/base.mjs) pre-loads those modules at startup and registers them
 * into the registry. Built-in command builders (e.g. cli/base/thread.mjs)
 * invoke register_subcommand_extensions to mount contributions synchronously
 * during yargs builder evaluation.
 */

const subcommand_contributors_by_group = new Map()

export function register_subcommand_contributor({
  group_name,
  extension_name,
  module: mod
}) {
  if (!group_name || typeof group_name !== 'string') return
  if (!mod || typeof mod.register_subcommands !== 'function') return
  if (!subcommand_contributors_by_group.has(group_name)) {
    subcommand_contributors_by_group.set(group_name, [])
  }
  subcommand_contributors_by_group
    .get(group_name)
    .push({ extension_name, module: mod })
}

// Called by load_extensions at the top of each CLI invocation to prevent
// stale contributors accumulating across repeated loads (e.g. in tests).
export function clear_subcommand_contributors() {
  subcommand_contributors_by_group.clear()
}

export function get_subcommand_contributors(group_name) {
  return subcommand_contributors_by_group.get(group_name) || []
}

export function register_subcommand_extensions(yargs, group_name) {
  const contributors = get_subcommand_contributors(group_name)
  for (const { extension_name, module: mod } of contributors) {
    try {
      const next = mod.register_subcommands(yargs)
      if (next) yargs = next
    } catch (error) {
      console.error(
        `Warning: subcommand extension "${extension_name}" failed to register under "${group_name}": ${error.message}`
      )
    }
  }
  return yargs
}
