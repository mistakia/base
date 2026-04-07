#!/usr/bin/env bun

/**
 * Build Script
 *
 * Cross-compiles the Base CLI into standalone Bun binaries for all
 * target platforms. Extensions and user-base content are loaded at
 * runtime via dynamic import and are NOT bundled into the binary.
 *
 * Usage:
 *   bun scripts/build.mjs                     # Build for current platform
 *   bun scripts/build.mjs --all               # Build for all platforms
 *   bun scripts/build.mjs --target linux-x64  # Build for specific target
 *
 * Output: dist/base-{platform}-{arch}
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const DIST_DIR = path.join(PROJECT_ROOT, 'dist')
const ENTRY = path.join(PROJECT_ROOT, 'cli', 'base.mjs')

const TARGETS = [
  'bun-darwin-arm64',
  'bun-darwin-x64',
  'bun-linux-x64',
  'bun-linux-arm64',
  'bun-windows-x64'
]

function parse_args() {
  const args = process.argv.slice(2)
  const build_all = args.includes('--all')
  const target_index = args.indexOf('--target')
  const specific_target = target_index !== -1 ? args[target_index + 1] : null

  if (specific_target) {
    const full_target = specific_target.startsWith('bun-')
      ? specific_target
      : `bun-${specific_target}`
    if (!TARGETS.includes(full_target)) {
      console.error(`Unknown target: ${specific_target}`)
      console.error(
        `Valid targets: ${TARGETS.map((t) => t.replace('bun-', '')).join(', ')}`
      )
      process.exit(1)
    }
    return [full_target]
  }

  if (build_all) {
    return TARGETS
  }

  // Default: current platform
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux'
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return [`bun-${platform}-${arch}`]
}

function build_target(target) {
  const is_windows = target.includes('windows')
  const output_name = `base-${target.replace('bun-', '')}${is_windows ? '.exe' : ''}`
  const output_path = path.join(DIST_DIR, output_name)

  console.log(`Building ${output_name}...`)

  const cmd = [
    'bun',
    'build',
    '--compile',
    ENTRY,
    `--target=${target}`,
    `--outfile=${output_path}`,
    '--external pg',
    '--external duckdb'
  ].join(' ')

  try {
    execSync(cmd, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production'
      }
    })

    const stat = fs.statSync(output_path)
    const size_mb = (stat.size / 1024 / 1024).toFixed(1)
    console.log(`  -> ${output_path} (${size_mb} MB)`)
    return { target, output_path, size: stat.size }
  } catch (error) {
    console.error(`  Build failed for ${target}: ${error.message}`)
    return null
  }
}

function generate_version_json(build_results) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')
  )

  const version_info = {
    version: pkg.version,
    built_at: new Date().toISOString(),
    targets: {}
  }

  for (const result of build_results) {
    if (result) {
      const target_key = result.target.replace('bun-', '')
      version_info.targets[target_key] = {
        file: path.basename(result.output_path),
        size: result.size
      }
    }
  }

  const version_path = path.join(DIST_DIR, 'version.json')
  fs.writeFileSync(version_path, JSON.stringify(version_info, null, 2) + '\n')
  console.log(`\nversion.json written to ${version_path}`)

  return version_info
}

// Main
fs.mkdirSync(DIST_DIR, { recursive: true })

const targets = parse_args()
console.log(
  `Building for targets: ${targets.map((t) => t.replace('bun-', '')).join(', ')}\n`
)

const results = targets.map(build_target)
const successful = results.filter(Boolean)

if (successful.length > 0) {
  const version_info = generate_version_json(successful)
  console.log(
    `\nBuild complete: ${successful.length}/${targets.length} targets`
  )
  console.log(`Version: ${version_info.version}`)
} else {
  console.error('\nAll builds failed')
  process.exit(1)
}
