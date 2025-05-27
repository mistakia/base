import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import crypto from 'crypto'
import { isMain } from '#libs-server'
import create_user from '#libs-server/users/create-user.mjs'

// TODO change the system to have the user id be derived from the private key

const argv = yargs(hideBin(process.argv))
  .option('username', {
    alias: 'u',
    description: 'Username for the new user',
    type: 'string'
  })
  .option('email', {
    alias: 'e',
    description: 'Email address for the new user',
    type: 'string'
  })
  .option('private_key', {
    alias: 'p',
    description: 'Private key for the new user',
    type: 'string',
    default: crypto.randomBytes(32)
  })
  .help()
  .alias('help', 'h').argv

const log = debug('create-user')
debug.enable('create-user')

const run = async () => {
  const { username, email, private_key } = argv

  log('Creating new user...')
  const user = await create_user({ username, email, private_key })

  // Output user information
  console.log('User created successfully:')
  console.log('-------------------------')
  console.log(`User ID:     ${user.user_id}`)
  console.log(`Username:    ${user.username}`)
  console.log(`Private Key: ${user.private_key.toString('hex')}`)

  return user
}

export default run

const main = async () => {
  try {
    await run()
  } catch (err) {
    console.error('Error creating user:', err.message)
    process.exit(1)
  }

  process.exit(0)
}

if (isMain(import.meta.url)) {
  main()
}
