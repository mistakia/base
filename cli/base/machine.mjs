/**
 * Machine subcommand group
 *
 * Inspect current machine identity, registry, and platform info.
 */

import os from 'os'
import config from '#config'
import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
import { flush_and_exit } from './lib/format.mjs'

export const command = 'machine'
export const describe = 'Show current machine identity and registry'

export const builder = (yargs) => yargs

export const handler = async (argv) => {
  let exit_code = 0
  try {
    const machine_id = get_current_machine_id()
    const hostname = os.hostname()
    const platform = os.platform()
    const arch = os.arch()
    const registry = config.machine_registry || {}
    const current_entry = machine_id ? registry[machine_id] : null

    if (argv.json) {
      console.log(
        JSON.stringify(
          {
            machine_id,
            hostname,
            platform,
            arch,
            registry_entry: current_entry,
            registry
          },
          null,
          2
        )
      )
    } else {
      console.log('Current Machine')
      console.log(`  ID:       ${machine_id || '(unknown)'}`)
      console.log(`  Hostname: ${hostname}`)
      console.log(`  Platform: ${platform}`)
      console.log(`  Arch:     ${arch}`)

      if (current_entry) {
        const extra_keys = Object.keys(current_entry).filter(
          (k) => !['hostname', 'platform'].includes(k)
        )
        if (extra_keys.length > 0) {
          console.log('  Config:')
          for (const key of extra_keys) {
            console.log(`    ${key}: ${current_entry[key]}`)
          }
        }
      }

      const registry_keys = Object.keys(registry)
      if (registry_keys.length > 0 && argv.verbose) {
        console.log('')
        console.log('Machine Registry')
        for (const key of registry_keys) {
          const entry = registry[key]
          const is_current = key === machine_id ? ' (current)' : ''
          console.log(`  ${key}${is_current}`)
          console.log(`    hostname: ${entry.hostname}`)
          console.log(`    platform: ${entry.platform}`)
          const extra = Object.keys(entry).filter(
            (k) => !['hostname', 'platform'].includes(k)
          )
          for (const k of extra) {
            console.log(`    ${k}: ${entry[k]}`)
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
