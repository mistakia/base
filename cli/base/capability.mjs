/**
 * Capability subcommand
 *
 * Inspect the current host's resolved capability set and write the bash
 * probe-helpers config files (~/.config/base/{machine-id,reach-targets.conf,
 * lan-networks.conf}) used by job-wrapper.sh on hosts that do not run the
 * cli-queue worker.
 */

import os from 'node:os'

import config from '#config'
import {
  current_capabilities,
  write_probe_config
} from '#libs-server/schedule/capability.mjs'
import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
import { flush_and_exit } from './lib/format.mjs'

export const command = 'capability <command>'
export const describe = 'Capability probe operations'

export const builder = (yargs) =>
  yargs
    .command(
      'list',
      'Print the resolved capability set for the current host',
      {},
      handle_list
    )
    .command(
      'write-probe-config',
      'Write ~/.config/base/{machine-id,reach-targets.conf,lan-networks.conf}',
      {},
      handle_write_probe_config
    )
    .demandCommand(1, 'Specify a subcommand: list, write-probe-config')

export const handler = () => {}

async function handle_list() {
  let exit_code = 0
  try {
    const capabilities = await current_capabilities()
    if (capabilities.length === 0) {
      console.log('(no capabilities resolvable)')
    } else {
      for (const { capability, ok } of capabilities) {
        console.log(`${ok ? 'ok    ' : 'unmet '} ${capability}`)
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_write_probe_config() {
  let exit_code = 0
  try {
    const registry = config.machine_registry || {}
    if (Object.keys(registry).length === 0) {
      console.error(
        'Error: config.machine_registry is empty. Check USER_BASE_DIRECTORY ' +
          'and CONFIG_ENCRYPTION_KEY are set in this environment (cron does ' +
          'not inherit interactive-shell exports).'
      )
      flush_and_exit(2)
      return
    }
    const hostname = os.hostname()
    const hostname_match = Object.entries(registry).find(
      ([, entry]) => entry && entry.hostname === hostname
    )
    if (!hostname_match) {
      const fallback_id = get_current_machine_id() || '(unresolved)'
      const known = Object.entries(registry)
        .map(([id, entry]) => `${id}=${entry?.hostname ?? '(no hostname)'}`)
        .join(', ')
      console.error(
        `Error: no machine_registry entry matches hostname '${hostname}'. ` +
          `Platform-fallback would resolve machine_id to '${fallback_id}', ` +
          `which would write the wrong machine-id and silently mis-route ` +
          `host:/reach: capability checks. Add a registry entry for this ` +
          `host (or correct its hostname) before re-running.\n` +
          `  Registry hostnames: ${known}`
      )
      flush_and_exit(2)
      return
    }
    const result = await write_probe_config()
    console.log(`Wrote probe config to ${result.directory}`)
    console.log(`  machine-id:        ${result.machine_id || '(empty)'}`)
    console.log(`  registry entries:  ${result.registry_entries}`)
    console.log(`  lan entries:       ${result.lan_entries}`)
    console.log(
      `  changed:           machine-id=${result.written.machine_id} reach=${result.written.reach_targets} lan=${result.written.lan_networks}`
    )
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
