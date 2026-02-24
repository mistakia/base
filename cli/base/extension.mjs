/**
 * Extension subcommand group
 *
 * List registered extensions and their metadata.
 */

import path from 'path'

import config from '#config'
import { discover_extensions } from '#libs-server/extension/discover-extensions.mjs'
import { flush_and_exit } from './lib/format.mjs'

export const command = 'extension <command>'
export const describe = 'Extension operations (list)'

export const builder = (yargs) =>
  yargs
    .command('list', 'List registered extensions', {}, handle_list)
    .demandCommand(1, 'Specify a subcommand: list')

export const handler = () => {}

function get_extension_paths() {
  const paths = []
  if (config.user_base_directory) {
    paths.push(path.join(config.user_base_directory, 'extension'))
  }
  if (config.system_base_directory) {
    paths.push(path.join(config.system_base_directory, 'system', 'extension'))
  }
  return paths
}

async function handle_list(argv) {
  let exit_code = 0
  try {
    const extensions = discover_extensions(get_extension_paths())

    if (!extensions || extensions.length === 0) {
      if (argv.json) {
        console.log('[]')
      } else {
        console.log('No extensions found')
      }
    } else if (argv.json) {
      console.log(JSON.stringify(extensions, null, 2))
    } else {
      for (const ext of extensions) {
        const flags = [
          ext.has_commands ? 'commands' : null,
          ext.has_skills ? 'skills' : null
        ]
          .filter(Boolean)
          .join(', ')
        console.log(
          `${ext.name}\t${flags || '-'}\t${ext.description || ''}`
        )
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
