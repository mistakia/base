import path from 'path'

import debug from 'debug'

import { register } from './capability-registry.mjs'

const log = debug('extensions:providers')

/**
 * Load capability providers from discovered extensions.
 *
 * Three-pass loading:
 * 1. Collect all provided capabilities from all extensions
 * 2. Validate requires -- warn if a required capability is not provided
 * 3. Dynamic-import each provide/{name}.mjs and register
 *
 * @param {Object[]} extensions - discovered extension metadata from discover_extensions()
 */
export async function load_extension_providers(extensions) {
  // Pass 1: collect all provided capabilities across extensions
  const all_provided = new Set()
  for (const ext of extensions) {
    if (ext.provided_capabilities) {
      for (const cap of ext.provided_capabilities) {
        all_provided.add(cap)
      }
    }
  }

  // Pass 2: validate requires
  for (const ext of extensions) {
    if (!ext.requires || !Array.isArray(ext.requires)) continue
    for (const required_cap of ext.requires) {
      if (!all_provided.has(required_cap)) {
        log(
          `Warning: extension "${ext.name}" requires capability "${required_cap}" but no extension provides it`
        )
      }
    }
  }

  // Pass 3: import and register providers
  for (const ext of extensions) {
    if (!ext.provided_capabilities || ext.provided_capabilities.length === 0) {
      continue
    }

    for (const capability_name of ext.provided_capabilities) {
      const provide_path = path.join(
        ext.extension_path,
        'provide',
        `${capability_name}.mjs`
      )

      try {
        const module = await import(provide_path)
        register(capability_name, ext.name, module)
        log(
          `Registered provider "${ext.name}" for capability "${capability_name}"`
        )
      } catch (error) {
        log(
          `Warning: failed to load provider "${capability_name}" from extension "${ext.name}": ${error.message}`
        )
      }
    }
  }
}
