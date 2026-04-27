import { homedir } from 'os'

const ARCHIVE_PREFIXES = [
  '/mnt/md0/claude-directory-archive/',
  '/Users/trashman/claude-directory-archive/'
]

/**
 * Expand a path entry by replacing leading `~` with the actual home directory.
 * Matches the convention in parse-jsonl.mjs.
 *
 * @param {string} p
 * @returns {string}
 */
const expand_tilde = (p) => p.replace(/^~/, homedir())

/**
 * Build a per-session execution attribution resolver for Claude imports.
 *
 * Iterates ALL machines in machine_registry (not just the current host) so
 * the resolver works for backfill of paths from non-current hosts.
 *
 * Path categories and their resulting attribution:
 *   host_config_dir.<account>    -> controlled_host, account_namespace=account
 *   admin_data_dir.<account>     -> controlled_container, container_name='base-container'
 *   user_data_dirs.<username>.<account> -> controlled_container, container_name='base-user-<username>'
 *
 * Longest-prefix match wins. Paths under archive prefixes return null (excluded).
 *
 * @param {Object} params
 * @param {Object} params.machine_registry - The machine_registry from config.
 * @returns {(raw_session: Object) => Object|null}
 */
export const build_claude_attribution_resolver = ({
  machine_registry
}) => {
  if (!machine_registry || typeof machine_registry !== 'object') {
    return () => null
  }

  // Build prefix list: [{prefix, attribution}], sorted longest-first for greedy match.
  const entries = []

  for (const [machine_id, machine] of Object.entries(machine_registry)) {
    const claude_paths = machine.claude_paths
    if (!claude_paths || typeof claude_paths !== 'object') continue

    // host_config_dir: { <account>: "<path>" }
    if (claude_paths.host_config_dir && typeof claude_paths.host_config_dir === 'object') {
      for (const [account, raw_path] of Object.entries(claude_paths.host_config_dir)) {
        const prefix = expand_tilde(raw_path)
        entries.push({
          prefix,
          attribution: {
            environment: 'controlled_host',
            machine_id,
            container_runtime: null,
            container_name: null,
            account_namespace: account
          }
        })
      }
    }

    // admin_data_dir: { <account>: "<path>" }
    if (claude_paths.admin_data_dir && typeof claude_paths.admin_data_dir === 'object') {
      for (const [account, raw_path] of Object.entries(claude_paths.admin_data_dir)) {
        const prefix = expand_tilde(raw_path)
        entries.push({
          prefix,
          attribution: {
            environment: 'controlled_container',
            machine_id,
            container_runtime: 'docker',
            container_name: 'base-container',
            account_namespace: account
          }
        })
      }
    }

    // user_data_dirs: { <username>: { <account>: "<path>" } }
    if (claude_paths.user_data_dirs && typeof claude_paths.user_data_dirs === 'object') {
      for (const [username, accounts] of Object.entries(claude_paths.user_data_dirs)) {
        if (!accounts || typeof accounts !== 'object') continue
        for (const [account, raw_path] of Object.entries(accounts)) {
          const prefix = expand_tilde(raw_path)
          entries.push({
            prefix,
            attribution: {
              environment: 'controlled_container',
              machine_id,
              container_runtime: 'docker',
              container_name: `base-user-${username}`,
              account_namespace: account
            }
          })
        }
      }
    }
  }

  // Sort by prefix length descending so longest match wins.
  entries.sort((a, b) => b.prefix.length - a.prefix.length)

  /**
   * @param {Object} raw_session
   * @returns {Object|null} attribution or null
   */
  return (raw_session) => {
    const file_path = raw_session?.metadata?.file_path
    if (!file_path || typeof file_path !== 'string') return null

    // Exclude archive paths.
    for (const archive_prefix of ARCHIVE_PREFIXES) {
      if (file_path.startsWith(archive_prefix)) return null
    }

    // Find longest matching prefix.
    for (const { prefix, attribution } of entries) {
      if (file_path.startsWith(prefix)) {
        return attribution
      }
    }

    return null
  }
}
