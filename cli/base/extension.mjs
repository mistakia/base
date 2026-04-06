/**
 * Extension subcommand group
 *
 * List registered extensions and their metadata.
 * Build distribution artifacts for extensions.
 */

import { execFileSync } from 'child_process'
import path from 'path'

import config from '#config'
import {
  discover_extensions,
  get_extension_paths
} from '#libs-server/extension/discover-extensions.mjs'
import { flush_and_exit } from './lib/format.mjs'

export const command = 'extension <command>'
export const describe = 'Extension operations (list, build)'

export const builder = (yargs) =>
  yargs
    .command('list', 'List registered extensions', {}, handle_list)
    .command(
      'build [name]',
      'Generate dist artifacts for extensions',
      (yargs) =>
        yargs.positional('name', {
          describe: 'Extension name (builds all if omitted)',
          type: 'string'
        }),
      handle_build
    )
    .demandCommand(1, 'Specify a subcommand: list, build')

export const handler = () => {}

async function handle_build(argv) {
  let exit_code = 0
  try {
    const extensions = discover_extensions(get_extension_paths(config))

    if (extensions.length === 0) {
      console.log('No extensions found')
      flush_and_exit(0)
      return
    }

    const targets = argv.name
      ? extensions.filter((ext) => ext.name === argv.name)
      : extensions

    if (targets.length === 0) {
      console.error(`Extension not found: ${argv.name}`)
      flush_and_exit(1)
      return
    }

    const manifest_script = path.join(
      config.system_base_directory,
      'scripts',
      'generate-content-manifest.mjs'
    )

    let built = 0
    for (const ext of targets) {
      const source = ext.extension_path
      const output = path.join(ext.extension_path, 'dist')
      try {
        const result = execFileSync(
          'bun',
          [manifest_script, source, output],
          { encoding: 'utf-8' }
        ).trim()
        console.log(result)
        built++
      } catch (err) {
        const stderr = err.stderr ? err.stderr.toString().trim() : err.message
        console.error(`Failed to build ${ext.name}: ${stderr}`)
        exit_code = 1
      }
    }

    console.log(`\nBuilt ${built} extension${built === 1 ? '' : 's'}`)
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

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
