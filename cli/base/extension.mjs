/**
 * Extension subcommand group
 *
 * List registered extensions and their metadata.
 */

import config from '#config'
import {
  discover_extensions,
  get_extension_paths
} from '#libs-server/extension/discover-extensions.mjs'
import { flush_and_exit } from './lib/format.mjs'

export const command = 'extension <command>'
export const describe = 'Extension operations (list)'

export const builder = (yargs) =>
  yargs
    .command('list', 'List registered extensions', {}, handle_list)
    .demandCommand(1, 'Specify a subcommand: list')

export const handler = () => {}

async function handle_list(argv) {
  let exit_code = 0
  try {
    const extensions = discover_extensions(get_extension_paths(config))

    if (extensions.length === 0) {
      if (argv.json) {
        console.log('[]')
      } else {
        console.log('No extensions found')
      }
    } else if (argv.json) {
      console.log(JSON.stringify(extensions, null, 2))
    } else {
      for (const ext of extensions) {
        console.log(`  ${ext.name.padEnd(18)} ${ext.description || ''}`)
        if (ext.has_commands) {
          console.log(`    commands: yes`)
        }
        if (ext.has_skills) {
          console.log(`    skills: yes`)
        }
        if (
          ext.provided_capabilities &&
          ext.provided_capabilities.length > 0
        ) {
          console.log(
            `    provides: ${ext.provided_capabilities.join(', ')}`
          )
        }
        console.log()
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
