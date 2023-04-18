import fetch from 'node-fetch'
import debug from 'debug'
// import yargs from 'yargs'
// import { hideBin } from 'yargs/helpers'

// import db from '#db'
import config from '#config'
import { isMain, cloudflare } from '#libs-server'

// const argv = yargs(hideBin(process.argv)).argv
const log = debug('set-cloudflare-dns-records')
debug.enable('set-cloudflare-dns-records')

const get_ip_address = async () => {
  const response = await fetch('https://api.ipify.org?format=json')
  const { ip } = await response.json()
  return ip
}

const set_cloudflare_dns_records = async () => {
  const ip_address = await get_ip_address()
  log(`ip_address: ${ip_address}`)

  const base_hostname = config.base_hostname
  const records = await cloudflare.get_records({ name: base_hostname })
  const a_records = records.result.filter((r) => r.type === 'A')
  const a_record = a_records[0]

  if (!a_record) {
    log('creating record')
    const record = await cloudflare.create_record({
      type: 'A',
      name: base_hostname,
      content: ip_address
    })
    log(record)
  } else if (a_record.content !== ip_address) {
    log('updating record')
    const record = await cloudflare.update_record({
      id: a_record.id,
      type: 'A',
      name: base_hostname,
      content: ip_address
    })
    log(record)
  } else {
    log(
      `no change needed, a record content: ${a_record.content} matchees ip_address: ${ip_address}`
    )
  }
}

export default set_cloudflare_dns_records

const main = async () => {
  let error
  try {
    await set_cloudflare_dns_records()
  } catch (err) {
    error = err
    console.log(error)
  }

  /* await db('jobs').insert({
   *   type: constants.jobs.EXAMPLE,
   *   succ: error ? 0 : 1,
   *   reason: error ? error.message : null,
   *   timestamp: Math.round(Date.now() / 1000)
   * })
   */
  process.exit()
}

if (isMain) {
  main()
}
