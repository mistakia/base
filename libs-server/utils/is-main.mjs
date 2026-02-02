import { fileURLToPath } from 'url'
import { realpathSync } from 'fs'

const is_main = (p) => {
  const target = fileURLToPath(p)
  if (process.argv[1] === target) return true
  try {
    return realpathSync(process.argv[1]) === target
  } catch {
    return false
  }
}

export default is_main
