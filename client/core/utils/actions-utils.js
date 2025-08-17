export const create_api_action_types = (base_action_type) => ({
  [`${base_action_type}_PENDING`]: `${base_action_type}_PENDING`,
  [`${base_action_type}_FULFILLED`]: `${base_action_type}_FULFILLED`,
  [`${base_action_type}_FAILED`]: `${base_action_type}_FAILED`
})

export const create_api_action =
  (type) =>
  (payload = {}) => ({
    type,
    payload
  })

export const create_api_actions = (base_action_type) => ({
  pending: create_api_action(`${base_action_type}_PENDING`),
  fulfilled: create_api_action(`${base_action_type}_FULFILLED`),
  failed: create_api_action(`${base_action_type}_FAILED`)
})
