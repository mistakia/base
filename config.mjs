import yargs from 'yargs/yargs'
import { hideBin } from 'yargs/helpers'

const argv = yargs(hideBin(process.argv)).argv

const env = process.env.NODE_ENV || 'development'
const config_path = argv.config || `./config.${env}.mjs`
const config = await import(config_path)
export default config.default
