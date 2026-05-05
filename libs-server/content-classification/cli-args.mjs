/**
 * Parse classification CLI arguments with standard flags and optional extras.
 *
 * Standard flags: --limit, --dry-run/-n, --reclassify, --help/-h
 *
 * @param {object} options
 * @param {string} options.usage - Usage line for --help output
 * @param {Array} [options.extra_args] - Additional arg definitions:
 *   { names: string[], default_value: any, help: string, validate?: Function }
 * @returns {object} Parsed arguments
 */
export function parse_classification_args({ usage, extra_args = [] } = {}) {
  const args = process.argv.slice(2)

  const get_arg = (names, default_value) => {
    for (const name of names) {
      const index = args.indexOf(name)
      if (index !== -1) {
        if (typeof default_value === 'boolean') return true
        return args[index + 1]
      }
    }
    return default_value
  }

  if (args.includes('--help') || args.includes('-h')) {
    const extra_help = extra_args
      .map((a) => `  ${a.names.join(', ').padEnd(16)} ${a.help}`)
      .join('\n')

    console.log(`Usage: ${usage || 'classify [options]'}

Options:
  --limit N        Process at most N items (default: all unclassified)
  --dry-run, -n    Preview classification without writing to database
  --reclassify     Re-process all items regardless of classified_at
${extra_help ? extra_help + '\n' : ''}  --help, -h       Show this help message
`)
    process.exit(0)
  }

  const limit_raw = get_arg(['--limit'], null)

  const result = {
    limit: limit_raw ? parseInt(limit_raw, 10) : null,
    dry_run: get_arg(['--dry-run', '-n'], false),
    reclassify: get_arg(['--reclassify'], false)
  }

  // Parse extra args
  for (const extra of extra_args) {
    const value = get_arg(extra.names, extra.default_value)
    if (extra.validate) {
      extra.validate(value)
    }
    const key = extra.names[0].replace(/^--/, '').replace(/-/g, '_')
    result[key] = value
  }

  return result
}
