import path from 'path'

import {
  list_active_leases,
  inspect_lease,
  LeaseStoreUnreachable,
  LeaseClientConfigError
} from '#libs-server/threads/lease-client.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'

const _exit_unreachable = (error) => {
  process.stderr.write(
    `lease store unreachable: ${error.message || error}\n`
  )
  process.exit(2)
}

const _is_unreachable = (error) =>
  error instanceof LeaseStoreUnreachable ||
  error instanceof LeaseClientConfigError

const _thread_dir = (thread_id) =>
  path.join(get_thread_base_directory({}), thread_id)

const handle_list = async (argv) => {
  const filter = argv.filter
  let leases
  try {
    leases = await list_active_leases({ filter })
  } catch (error) {
    if (_is_unreachable(error)) return _exit_unreachable(error)
    throw error
  }

  if (filter === 'owned-by-me' || filter === 'owned-by-remote') {
    for (const lease of leases) {
      process.stdout.write(`${_thread_dir(lease.thread_id)}\n`)
    }
    return
  }

  for (const lease of leases) {
    process.stdout.write(`${JSON.stringify(lease)}\n`)
  }
}

const handle_inspect = async (argv) => {
  let lease
  try {
    lease = await inspect_lease({ thread_id: argv.thread_id })
  } catch (error) {
    if (_is_unreachable(error)) return _exit_unreachable(error)
    throw error
  }
  if (!lease) {
    process.stderr.write(`no active lease for ${argv.thread_id}\n`)
    process.exit(1)
  }
  process.stdout.write(`${JSON.stringify(lease, null, 2)}\n`)
}

export const register_lease_commands = (yargs) =>
  yargs.command(
    'lease <command>',
    'Thread lease operations',
    (yargs_inner) =>
      yargs_inner
        .command(
          'list',
          'List active thread leases',
          (y) =>
            y.option('filter', {
              describe: 'Filter leases',
              type: 'string',
              choices: ['owned-by-me', 'owned-by-remote', 'all'],
              default: 'all'
            }),
          handle_list
        )
        .command(
          'inspect <thread_id>',
          'Inspect a single thread lease',
          (y) =>
            y.positional('thread_id', {
              describe: 'Thread id',
              type: 'string'
            }),
          handle_inspect
        )
        .demandCommand(1, 'Specify a lease subcommand: list, inspect')
  )
