import fetch from 'node-fetch'
import qs from 'qs'

import config from '#config'

const { cloudflare } = config

export const get_records = async ({ name, per_page = 300 }) => {
  let url = `https://api.cloudflare.com/client/v4/zones/${cloudflare.zone_id}/dns_records`

  const query = qs.stringify(
    {
      name,
      per_page
    },
    {
      skipNulls: true
    }
  )

  if (query) {
    url = `${url}?${query}`
  }

  const options = {
    method: 'GET',
    headers: {
      'X-Auth-Email': cloudflare.user_email,
      Authorization: `Bearer ${cloudflare.token}`,
      'Content-Type': 'application/json'
    }
  }

  const res = await fetch(url, options)
  return res.json()
}

export const create_record = async ({
  type,
  name,
  content,
  ttl = 1,
  proxied = false
}) => {
  const url = `https://api.cloudflare.com/client/v4/zones/${cloudflare.zone_id}/dns_records`
  const options = {
    method: 'POST',
    headers: {
      'X-Auth-Email': cloudflare.user_email,
      Authorization: `Bearer ${cloudflare.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type,
      name,
      content,
      ttl,
      proxied
    })
  }

  const res = await fetch(url, options)
  return res.json()
}

export const delete_record = async ({ id }) => {
  const url = `https://api.cloudflare.com/client/v4/zones/${cloudflare.zone_id}/dns_records/${id}`
  const options = {
    method: 'DELETE',
    headers: {
      'X-Auth-Email': cloudflare.user_email,
      Authorization: `Bearer ${cloudflare.token}`,
      'Content-Type': 'application/json'
    }
  }

  const res = await fetch(url, options)
  return res.json()
}

export const update_record = async ({
  id,
  type,
  name,
  content,
  ttl = 1,
  proxied = false
}) => {
  const url = `https://api.cloudflare.com/client/v4/zones/${cloudflare.zone_id}/dns_records/${id}`
  const options = {
    method: 'PUT',
    headers: {
      'X-Auth-Email': cloudflare.user_email,
      Authorization: `Bearer ${cloudflare.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type,
      name,
      content,
      ttl,
      proxied
    })
  }

  const res = await fetch(url, options)
  return res.json()
}
