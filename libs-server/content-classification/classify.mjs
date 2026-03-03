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
 * Classify a single item via Ollama with tag validation and hierarchy expansion.
 *
 * @param {object} options
 * @param {string} options.prompt - Pre-built classification prompt
 * @param {string} options.model - Ollama model identifier
 * @param {object} options.taxonomy - Resolved taxonomy from load_taxonomy
 * @param {Function} options.call_ollama - Ollama client function
 * @param {number} options.timeout_ms - Request timeout in milliseconds
 * @returns {Promise<{tags: string[], confidence: number}>}
 */
export async function classify_item({
  prompt,
  model,
  taxonomy,
  call_ollama,
  timeout_ms
}) {
  const valid_tags = new Set(taxonomy.domains.map((d) => d.tag))

  const { output } = await call_ollama({
    prompt,
    model,
    timeout_ms,
    format: CLASSIFICATION_SCHEMA
  })

  let result
  try {
    result = JSON.parse(output)
  } catch {
    console.error('Failed to parse Ollama response:', output.substring(0, 200))
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
