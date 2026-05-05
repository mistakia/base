import { dispatch_role } from '#libs-server/model-roles/dispatch-role.mjs'

const CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    tags: {
      type: 'array',
      items: { type: 'string' }
    },
    confidence: {
      type: 'number'
    }
  },
  required: ['tags', 'confidence']
}

/**
 * Classify a single item with tag validation and hierarchy expansion.
 *
 * @param {object} options
 * @param {string} options.prompt - Pre-built classification prompt
 * @param {object} options.taxonomy - Resolved taxonomy from load_taxonomy
 * @returns {Promise<{tags: string[], confidence: number}>}
 */
export async function classify_item({ prompt, taxonomy }) {
  const valid_tags = new Set(taxonomy.domains.map((d) => d.tag))

  const { output } = await dispatch_role({
    role: 'content_classifier',
    prompt,
    format: CLASSIFICATION_SCHEMA
  })

  let result
  try {
    result = JSON.parse(output)
  } catch {
    console.error(
      'Failed to parse classifier response:',
      output.substring(0, 200)
    )
    return { tags: [], confidence: 0 }
  }

  // Validate tags against taxonomy
  const validated_tags = (result.tags || []).filter((t) => valid_tags.has(t))

  // Apply tag hierarchy -- child tags imply parent
  const hierarchy = taxonomy.tag_hierarchy || {}
  for (const tag of [...validated_tags]) {
    if (hierarchy[tag] && !validated_tags.includes(hierarchy[tag])) {
      validated_tags.push(hierarchy[tag])
    }
  }

  const confidence = Math.max(0, Math.min(1, result.confidence || 0))

  return { tags: validated_tags, confidence }
}
