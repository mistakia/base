import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import debug from 'debug'

const log = debug('server:bundle-injector')
const __dirname = path.dirname(fileURLToPath(import.meta.url))

let script_cache = null

/**
 * Load bundle manifest and generate script tags from the manifest
 *
 * @returns {Promise<string>} HTML script tags for required bundles
 */
async function generate_script_tags() {
  if (script_cache) {
    return script_cache
  }

  try {
    const build_path = path.join(__dirname, '..', '..', 'build')
    const manifest_path = path.join(build_path, 'bundle-manifest.json')

    try {
      // Try to load from manifest first
      const manifest_content = await fs.readFile(manifest_path, 'utf-8')
      const manifest = JSON.parse(manifest_content)

      if (manifest.scripts && Array.isArray(manifest.scripts)) {
        const script_tags = manifest.scripts
          .map((src) => `<script defer="defer" src="${src}"></script>`)
          .join('\n    ')

        script_cache = script_tags
        log(
          `Generated script tags from manifest for ${manifest.scripts.length} bundles`
        )
        return script_tags
      }
    } catch (manifest_error) {
      log(
        `Manifest not found or invalid, falling back to directory scan: ${manifest_error.message}`
      )
    }

    // Fallback: scan build directory for JavaScript bundles
    const files = await fs.readdir(build_path)

    // Filter for JavaScript files, excluding maps and gzipped files
    const js_files = files
      .filter(
        (file) =>
          file.endsWith('.js') &&
          !file.endsWith('.map') &&
          !file.endsWith('.gz')
      )
      .sort((a, b) => {
        // Sort to ensure runtime loads first, main loads last
        if (a.startsWith('runtime')) return -1
        if (b.startsWith('runtime')) return 1
        if (a.startsWith('main')) return 1
        if (b.startsWith('main')) return -1
        return a.localeCompare(b)
      })

    // Generate script tags
    const script_tags = js_files
      .map((file) => `<script defer="defer" src="/${file}"></script>`)
      .join('\n    ')

    script_cache = script_tags
    log(
      `Generated script tags from directory scan for ${js_files.length} bundles`
    )

    return script_tags
  } catch (error) {
    log(`Error generating script tags: ${error.message}`)
    return '' // Return empty string as fallback
  }
}

/**
 * Clear script cache (useful when build changes)
 */
export function clear_bundle_cache() {
  script_cache = null
  log('Bundle cache cleared')
}

export { generate_script_tags }
export default generate_script_tags
