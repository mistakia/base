import { fileURLToPath } from 'url'
import { realpathSync } from 'fs'

const is_main = (p) => {
  // In compiled binaries, all bundled modules share the same
  // import.meta.url (/$bunfs/...). Return false to prevent
  // non-entry modules from running their standalone CLI code.
  if (p.includes('/$bunfs/')) {
    return false
  }

  const target = fileURLToPath(p)
  if (process.argv[1] === target) return true
  try {
    return realpathSync(process.argv[1]) === target
  } catch {
    return false
  }
}

export default is_main
