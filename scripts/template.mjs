import debug from 'debug'
import is_main from '#libs-server/utils/is-main.mjs'
// import yargs from 'yargs'
// import { hideBin } from 'yargs/helpers'

// import config from '#config'
// const argv = yargs(hideBin(process.argv)).argv
// const log = debug('template')
debug.enable('template')

const run = async () => {}

export default run

const main = async () => {
  let error
  try {
    await run()
  } catch (err) {
    error = err
    console.log(error)
  }

  // File-first architecture - no database logging needed
  // All operations should use filesystem-based logging if needed

  process.exit()
}

if (is_main(import.meta.url)) {
  main()
}
