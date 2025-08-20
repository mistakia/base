import fetch from 'node-fetch'
import debug from 'debug'

import config from '#config'
import { isMain, cloudflare } from '#libs-server'

const log = debug('set-cloudflare-dns-records')
debug.enable('set-cloudflare-dns-records')

const get_ip_addresses = async (includeIPv6 = false) => {
  const response_v4 = await fetch('https://api.ipify.org?format=json')
  const { ip: ipv4 } = await response_v4.json()

  if (!includeIPv6) {
    return { ipv4 }
  }

  const response_v6 = await fetch('https://api6.ipify.org?format=json')
  const { ip: ipv6 } = await response_v6.json()

  return { ipv4, ipv6 }
}

const set_cloudflare_dns_records = async (options = {}) => {
  const { enableIPv6 = false } = options

  const { ipv4, ipv6 } = await get_ip_addresses(enableIPv6)
  log(`ipv4_address: ${ipv4}`)
  if (enableIPv6 && ipv6) {
    log(`ipv6_address: ${ipv6}`)
  }

  const base_hostname = config.base_hostname

  // get A records
  const a_records = await cloudflare.get_records({
    name: base_hostname,
    type: 'A'
  })

  // get AAAA records
  const aaaa_records = await cloudflare.get_records({
    name: base_hostname,
    type: 'AAAA'
  })

  // set A record
  if (a_records.result.length === 0) {
    log('creating A record')
    await cloudflare.create_record({
      type: 'A',
      name: base_hostname,
      content: ipv4
    })
  } else if (a_records.result[0].content !== ipv4) {
    log('updating A record')
    await cloudflare.update_record({
      id: a_records.result[0].id,
      type: 'A',
      name: base_hostname,
      content: ipv4
    })
  } else {
    log(
      `no change needed, A record content: ${a_records.result[0].content} matches ipv4_address: ${ipv4}`
    )
  }

  // handle AAAA records based on enableIPv6 flag
  if (enableIPv6 && ipv6) {
    // set AAAA record
    if (aaaa_records.result.length === 0) {
      log('creating AAAA record')
      await cloudflare.create_record({
        type: 'AAAA',
        name: base_hostname,
        content: ipv6
      })
    } else if (aaaa_records.result[0].content !== ipv6) {
      log('updating AAAA record')
      await cloudflare.update_record({
        id: aaaa_records.result[0].id,
        type: 'AAAA',
        name: base_hostname,
        content: ipv6
      })
    } else {
      log(
        `no change needed, AAAA record content: ${aaaa_records.result[0].content} matches ipv6_address: ${ipv6}`
      )
    }
  } else {
    // delete AAAA records if they exist (when IPv6 is disabled)
    if (aaaa_records.result.length > 0) {
      for (const record of aaaa_records.result) {
        log(`deleting AAAA record: ${record.content}`)
        await cloudflare.delete_record({
          id: record.id
        })
      }
    } else {
      log('no AAAA records to delete')
    }
  }
}

export default set_cloudflare_dns_records

const main = async () => {
  // Parse command line arguments
  const args = process.argv.slice(2)
  const enableIPv6 = args.includes('--enable-ipv6') || args.includes('-6')

  if (enableIPv6) {
    log('IPv6 support enabled via command line flag')
  }

  let error
  try {
    await set_cloudflare_dns_records({ enableIPv6 })
  } catch (err) {
    error = err
    console.log(error)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}
