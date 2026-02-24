/**
 * Skill subcommand group
 *
 * List discovered agent skills from extensions and workflow directories.
 */

import path from 'path'

import config from '#config'
import { discover_skills } from '#libs-server/extension/discover-skills.mjs'
import { flush_and_exit } from './lib/format.mjs'

export const command = 'skill <command>'
export const describe = 'Skill operations (list)'

export const builder = (yargs) =>
  yargs
    .command('list', 'List discovered agent skills', {}, handle_list)
    .demandCommand(1, 'Specify a subcommand: list')

export const handler = () => {}

function get_discovery_paths() {
  const extension_paths = []
  const workflow_paths = []

  if (config.user_base_directory) {
    extension_paths.push(path.join(config.user_base_directory, 'extension'))
    workflow_paths.push(path.join(config.user_base_directory, 'workflow'))
  }
  if (config.system_base_directory) {
    extension_paths.push(
      path.join(config.system_base_directory, 'system', 'extension')
    )
    workflow_paths.push(
      path.join(config.system_base_directory, 'system', 'workflow')
    )
  }

  return { extension_paths, workflow_paths }
}

async function handle_list(argv) {
  let exit_code = 0
  try {
    const skills = discover_skills(get_discovery_paths())

    if (!skills || skills.length === 0) {
      if (argv.json) {
        console.log('[]')
      } else {
        console.log('No skills found')
      }
    } else if (argv.json) {
      console.log(JSON.stringify(skills, null, 2))
    } else {
      for (const skill of skills) {
        const source = skill.extension || skill.type
        console.log(`${skill.name}\t${source}\t${skill.description || ''}`)
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
