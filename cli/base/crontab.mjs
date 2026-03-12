/**
 * Crontab subcommand -- thin shim that delegates to build-crontab
 *
 * The crontab preprocessor logic lives in the bootstrap repo as
 * build-crontab.sh (pure bash/awk). This shim preserves the
 * `base crontab build <file>` CLI interface for backwards
 * compatibility with project deployment scripts (e.g. league's
 * yarn load:crontab:main, nano-community's yarn load:crontab).
 */

import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

import { flush_and_exit } from './lib/format.mjs'

export const command = 'crontab <command>'
export const describe = 'Crontab preprocessing operations'

export const builder = (yargs) =>
  yargs
    .command(
      'build <file>',
      'Preprocess a crontab source file for deployment',
      (yargs) =>
        yargs.positional('file', {
          describe: 'Path to crontab source file',
          type: 'string'
        }),
      handle_build
    )
    .demandCommand(1, 'Specify a subcommand: build')

export const handler = () => {}

async function handle_build(argv) {
  let exit_code = 0
  try {
    // Resolve build-crontab from ~/bin or bootstrap repo
    const home_bin = path.join(process.env.HOME, 'bin', 'build-crontab')
    const script = existsSync(home_bin) ? home_bin : 'build-crontab'

    const output = execFileSync(script, [argv.file], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    })
    process.stdout.write(output)
  } catch (error) {
    if (error.stderr) {
      process.stderr.write(error.stderr)
    } else {
      console.error(`Error: ${error.message}`)
    }
    exit_code = error.status || 1
  }
  flush_and_exit(exit_code)
}
