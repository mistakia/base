/**
 * Update subcommand
 *
 * Self-update the Base CLI binary and system content.
 * Checks base.tint.space for newer versions and downloads if available.
 *
 * Usage:
 *   base update           # Update binary and system content
 *   base update --check   # Only check if update is available
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'

const exec_file_async = promisify(execFile)

export const command = 'update'
export const describe = 'Update Base CLI binary and system content'

export const builder = (yargs) =>
  yargs
    .option('check', {
      describe: 'Only check if an update is available (do not download)',
      type: 'boolean',
      default: false
    })
    .option('version', {
      describe: 'Install a specific version (e.g., v1.0.0)',
      type: 'string'
    })

const BASE_URL = 'https://base.tint.space'

function release_url(version_tag, file) {
  const release_path = version_tag || 'latest'
  return `${BASE_URL}/releases/${release_path}/${file}`
}

function detect_platform() {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux'
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return `${platform}-${arch}`
}

function get_install_dir() {
  return process.env.BASE_INSTALL_DIR || path.join(process.env.HOME, '.base')
}

function read_local_version() {
  const version_path = path.join(get_install_dir(), 'version.json')
  try {
    return JSON.parse(fs.readFileSync(version_path, 'utf8'))
  } catch {
    return null
  }
}

async function fetch_remote_version(version_tag) {
  const url = release_url(version_tag, 'version.json')
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return null
    }
    return await response.json()
  } catch {
    return null
  }
}

async function download_binary(platform, output_path, version_tag) {
  const url = release_url(version_tag, `base-${platform}`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  fs.writeFileSync(output_path, Buffer.from(buffer))
  fs.chmodSync(output_path, 0o755)
}

function compute_file_hash(file_path) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(file_path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

async function verify_checksum(file_path, platform, version_tag) {
  const checksums_url = release_url(version_tag, 'checksums.sha256')
  try {
    const response = await fetch(checksums_url)
    if (!response.ok) {
      console.log('Checksums not available (skipping verification)')
      return true
    }

    const checksums_text = await response.text()
    const binary_name = `base-${platform}`
    const line = checksums_text
      .split('\n')
      .find((l) => l.trim().endsWith(`  ${binary_name}`))

    if (!line) {
      console.log('No checksum entry for this platform (skipping verification)')
      return true
    }

    const expected_hash = line.trim().split(/\s+/)[0]
    const actual_hash = await compute_file_hash(file_path)

    if (actual_hash !== expected_hash) {
      console.error('Checksum verification failed!')
      console.error(`  Expected: ${expected_hash}`)
      console.error(`  Actual:   ${actual_hash}`)
      return false
    }

    console.log('Checksum verified')
    return true
  } catch {
    console.log('Checksum verification unavailable (skipping)')
    return true
  }
}

async function sync_system_content(install_dir) {
  const system_dir = path.join(install_dir, 'system')
  const system_url = `${BASE_URL}/system/`

  // Download system content manifest
  try {
    const manifest_response = await fetch(`${system_url}manifest.json`)
    if (!manifest_response.ok) {
      console.log('System content manifest not available, skipping')
      return false
    }

    const manifest = await manifest_response.json()
    let updated = 0

    for (const file of manifest.files || []) {
      const file_url = `${system_url}${file.path}`
      const local_path = path.join(system_dir, file.path)

      // Skip if local file matches hash
      if (fs.existsSync(local_path)) {
        // Simple size check for now
        const stat = fs.statSync(local_path)
        if (file.size && stat.size === file.size) {
          continue
        }
      }

      const dir = path.dirname(local_path)
      fs.mkdirSync(dir, { recursive: true })

      const response = await fetch(file_url)
      if (response.ok) {
        const content = await response.text()
        fs.writeFileSync(local_path, content)
        updated++
      }
    }

    if (updated > 0) {
      console.log(`Updated ${updated} system files`)
    } else {
      console.log('System content is up to date')
    }

    return updated > 0
  } catch (error) {
    console.log(`System content sync failed: ${error.message}`)
    return false
  }
}

export const handler = async (argv) => {
  const install_dir = get_install_dir()
  const local_version = read_local_version()

  console.log(
    `Current version: ${local_version?.version || 'unknown'}`
  )

  // Check for updates
  const version_tag = argv.version
  const remote_version = await fetch_remote_version(version_tag)

  if (!remote_version) {
    const target = version_tag || 'latest'
    console.log(
      `Could not fetch version info for ${target} (base.tint.space unreachable)`
    )
    return
  }

  const needs_update =
    !local_version ||
    local_version.version !== remote_version.version ||
    version_tag

  if (!needs_update) {
    console.log(`Already up to date (v${remote_version.version})`)

    // Still sync system content even if binary is current
    if (!argv.check) {
      await sync_system_content(install_dir)
    }
    return
  }

  if (version_tag) {
    console.log(`Installing version: ${version_tag}`)
  } else {
    console.log(`New version available: v${remote_version.version}`)
  }

  if (argv.check) {
    console.log('Run `base update` to install the update')
    return
  }

  // Download and install new binary
  const platform = detect_platform()
  const binary_path = path.join(install_dir, 'bin', 'base')

  console.log(`Downloading base-${platform}...`)

  try {
    const tmp_path = `${binary_path}.tmp`
    await download_binary(platform, tmp_path, version_tag)

    // Verify checksum before replacing
    const checksum_ok = await verify_checksum(tmp_path, platform, version_tag)
    if (!checksum_ok) {
      fs.unlinkSync(tmp_path)
      console.error('Update aborted: checksum mismatch')
      process.exit(1)
    }

    // Backup current binary before replacing
    const backup_path = `${binary_path}.bak`
    if (fs.existsSync(binary_path)) {
      fs.copyFileSync(binary_path, backup_path)
    }

    // Replace binary
    fs.renameSync(tmp_path, binary_path)

    // Smoke test: verify the new binary can report its version
    try {
      await exec_file_async(binary_path, ['--version'], { timeout: 10000 })
    } catch {
      console.error('Smoke test failed: new binary cannot run --version')
      if (fs.existsSync(backup_path)) {
        fs.renameSync(backup_path, binary_path)
        console.error('Rolled back to previous binary')
      }
      process.exit(1)
    }

    // Clean up backup from previous successful update
    if (fs.existsSync(backup_path)) {
      fs.unlinkSync(backup_path)
    }

    // Write version.json
    fs.writeFileSync(
      path.join(install_dir, 'version.json'),
      JSON.stringify(remote_version, null, 2) + '\n'
    )

    console.log(`Updated to v${remote_version.version}`)
  } catch (error) {
    console.error(`Update failed: ${error.message}`)
    process.exit(1)
  }

  // Sync system content
  await sync_system_content(install_dir)
}
