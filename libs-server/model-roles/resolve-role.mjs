import config from '#config'

/**
 * Resolve a role name to an explicit dispatch descriptor.
 *
 * Returns one of two mutually-exclusive shapes keyed on `provider_kind`:
 *   inference: { role, provider_kind: 'inference', provider, model, endpoint,    timeout_ms }
 *   harness:   { role, provider_kind: 'harness',   harness,  model, binary_path, timeout_ms, mode }
 *
 * Callers MUST switch on `provider_kind` before reading `endpoint` vs `binary_path`.
 *
 * @param {Object} params
 * @param {string} params.role
 * @returns {object}
 */
export const resolve_role = ({ role }) => {
  const model_roles = config.model_roles
  if (!model_roles) {
    throw new Error('config.model_roles is not configured')
  }

  const role_config = model_roles.roles?.[role]
  if (!role_config) {
    throw new Error(`Unknown role: ${role}`)
  }

  const { provider_kind, model } = role_config
  if (!provider_kind) {
    throw new Error(`role.${role}.provider_kind is required`)
  }
  if (!model) {
    throw new Error(`role.${role}.model is required`)
  }

  const timeout_ms =
    role_config.timeout_ms ?? model_roles.default_timeout_ms

  if (provider_kind === 'inference') {
    const provider = role_config.provider
    if (!provider) {
      throw new Error(`role.${role}.provider is required for inference kind`)
    }
    const provider_config = model_roles.inference_providers?.[provider]
    const endpoint = role_config.endpoint ?? provider_config?.endpoint
    return {
      role,
      provider_kind,
      provider,
      model,
      endpoint,
      timeout_ms
    }
  }

  if (provider_kind === 'harness') {
    const harness = role_config.harness
    if (!harness) {
      throw new Error(`role.${role}.harness is required for harness kind`)
    }
    const harness_config = model_roles.harness_providers?.[harness]
    const binary_path = role_config.binary_path ?? harness_config?.binary_path
    return {
      role,
      provider_kind,
      harness,
      model,
      binary_path,
      timeout_ms,
      mode: role_config.mode
    }
  }

  throw new Error(
    `Unknown provider_kind for role ${role}: ${provider_kind}`
  )
}
