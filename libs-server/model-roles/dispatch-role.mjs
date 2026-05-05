import { resolve_role } from '#libs-server/model-roles/resolve-role.mjs'
import { dispatch_model } from '#libs-server/model-roles/dispatch-model.mjs'

/**
 * Role-aware dispatch. Resolves a role to a provider/model/endpoint descriptor
 * via `resolve_role`, then forwards inference roles to `dispatch_model`.
 *
 * Static dispatch params (provider, model, endpoint, timeout_ms, max_tokens,
 * temperature) come from role config — there are no per-call overrides for
 * static params on this surface. To vary these, declare a different role.
 *
 * Harness roles are declared but not yet implemented; this layer throws if a
 * harness-kind role is dispatched.
 *
 * @param {Object} params
 * @param {string} params.role
 * @param {string} params.prompt
 * @param {string} [params.system]
 * @param {object} [params.format]
 * @returns {Promise<{output: string, duration_ms: number}>}
 */
export const dispatch_role = async ({ role, prompt, system, format }) => {
  const resolved = resolve_role({ role })

  if (resolved.provider_kind === 'inference') {
    const args = {
      provider: resolved.provider,
      model: resolved.model,
      prompt,
      system,
      format,
      temperature: resolved.temperature,
      timeout_ms: resolved.timeout_ms
    }
    if (resolved.max_tokens !== undefined) {
      args.max_tokens = resolved.max_tokens
    }
    return dispatch_model(args)
  }

  if (resolved.provider_kind === 'harness') {
    throw new Error(`harness dispatch not implemented for role=${role}`)
  }

  throw new Error(
    `Unknown provider_kind for role ${role}: ${resolved.provider_kind}`
  )
}
