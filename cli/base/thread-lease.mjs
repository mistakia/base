import path from 'path'

import {
  list_active_leases,
  inspect_lease,
  release_lease,
  LeaseStoreUnreachable,
  LeaseClientConfigError
} from '#libs-server/threads/lease-client.mjs'
import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
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

const handle_release = async (argv) => {
  const { thread_id } = argv
  let lease
  try {
    lease = await inspect_lease({ thread_id })
  } catch (error) {
    if (_is_unreachable(error)) return _exit_unreachable(error)
    throw error
  }
  if (!lease) {
    process.stderr.write(`no active lease for ${thread_id}\n`)
    process.exit(1)
  }
  const me = get_current_machine_id()
  if (lease.machine_id && lease.machine_id !== me) {
    process.stderr.write(
      `lease held by ${lease.machine_id}; use --force on the holder to release\n`
    )
    process.exit(2)
  }
  let result
  try {
    result = await release_lease({
      thread_id,
      lease_token: lease.lease_token
    })
  } catch (error) {
    if (_is_unreachable(error)) return _exit_unreachable(error)
    throw error
  }
  if (argv.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  if (result?.released) {
    process.stdout.write(
      `released ${thread_id} (token=${lease.lease_token})\n`
    )
  } else {
    process.stdout.write(
      `release no-op for ${thread_id} (token=${lease.lease_token})\n`
    )
  }
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
        .command(
          'release <thread_id>',
          'Release an active thread lease held by this machine',
          (y) =>
            y
              .positional('thread_id', {
                describe: 'Thread id',
                type: 'string'
              })
              .option('json', {
                describe: 'Emit release result as JSON',
                type: 'boolean',
                default: false
              }),
          handle_release
        )
        .demandCommand(1, 'Specify a lease subcommand: list, inspect, release')
  )
