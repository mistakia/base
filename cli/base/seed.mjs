import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { flush_and_exit } from './lib/format.mjs'
import {
  get_registered_directories,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'

const SEED_KINDS = [
  { source: 'system/workflow', target: 'workflow' },
  { source: 'system/guideline', target: 'guideline' }
]

export const command = 'seed <command>'
export const describe = 'Seed base-repo entities into user-base'

export const builder = (yargs) =>
  yargs
    .command(
      'install',
      'Copy-if-absent seed workflows and guidelines from base into user-base',
      () => {},
      handle_install
    )
    .demandCommand(1, 'Specify a subcommand: install')

export const handler = () => {}

export function install_seeds({ system_base_directory, user_base_directory }) {
  const copied = []

  for (const { source, target } of SEED_KINDS) {
    const src_dir = join(system_base_directory, source)
    const dst_dir = join(user_base_directory, target)

    if (!existsSync(src_dir)) continue

    mkdirSync(dst_dir, { recursive: true })

    for (const name of readdirSync(src_dir)) {
      if (!name.endsWith('.md') || name === 'ABOUT.md') continue

      const dst_path = join(dst_dir, name)
      if (existsSync(dst_path)) continue

      writeFileSync(dst_path, readFileSync(join(src_dir, name), 'utf8'))
      copied.push(`${target}/${name}`)
    }
  }

  return { copied }
}

async function handle_install(argv) {
  handle_cli_directory_registration(argv)

  let exit_code = 0
  try {
    const { system_base_directory, user_base_directory } =
      get_registered_directories()

    if (!system_base_directory || !user_base_directory) {
      console.error(
        'Error: system_base_directory and user_base_directory must both be configured.'
      )
      flush_and_exit(1)
      return
    }

    const { copied } = install_seeds({
      system_base_directory,
      user_base_directory
    })

    if (argv.json) {
      console.log(JSON.stringify({ copied }, null, 2))
    } else if (copied.length === 0) {
      console.log('No new seed entities to install.')
    } else {
      console.log(`Copied ${copied.length} seed file(s):`)
      for (const rel of copied) console.log(`  + ${rel}`)
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }

  flush_and_exit(exit_code)
}
