import { fileURLToPath } from 'url'
import { realpathSync } from 'fs'

/**
 * Check if the current module is the main entry point.
 *
 * In Bun compiled binaries, all bundled modules share the same
 * import.meta.url (e.g. /$bunfs/root/binary-name), so the normal
 * path comparison would return true for every module. We detect
 * compiled mode via the /$bunfs/ prefix and return false, letting
 * the CLI entry point (base.mjs) use its own compiled-mode guard.
 *
 * @param {string} import_meta_url - Pass import.meta.url from the calling module
 * @returns {boolean}
 */
const is_main = (import_meta_url) => {
  // Compiled binary: all modules share the same URL — only the
  // explicit entry-point guard in base.mjs should trigger execution.
  // Bun VFS: /$bunfs/ on Unix, %7EBUN in URL-encoded file: URL on Windows
  if (
    import_meta_url.includes('/$bunfs/') ||
    import_meta_url.includes('%7EBUN')
  ) {
    return false
  }

  const target = fileURLToPath(import_meta_url)
  if (process.argv[1] === target) return true
  try {
    return realpathSync(process.argv[1]) === target
  } catch {
    return false
  }
}

// Named export for CLI scripts, default export for libs-server modules
export { is_main as isMain }
export default is_main
