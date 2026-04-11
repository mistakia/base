import { createHash } from 'crypto'
import debug from 'debug'
import { list_tags_from_filesystem } from '#libs-server/tag/filesystem/list-tags-from-filesystem.mjs'
import { read_tag_from_filesystem } from '#libs-server/tag/filesystem/read-tag-from-filesystem.mjs'

const log = debug('metadata:tag-prompt')

// ============================================================================
// Constants
// ============================================================================

// Bump this when the prompt template or analysis logic changes.
// Threads analyzed with an older version become re-eligible for analysis.
// v3 (2026-04-11): add RANKING_RULES + BOUNDARY_EXEMPLARS, switch output to
// the {primary, secondary, rationale} structured shape.
const PROMPT_VERSION = 3

const TAG_CONSTRAINTS = {
  MAX_TAGS: 3
}

// Primary-vs-secondary ranking rules. These exist because model survey
// (gemma4:26b, devstral-small-2:24b, qwen3.5moe, nemotron-3-super:120b at
// 2026-04-11) found 100% retrieval but a ~67% ceiling on primary selection:
// the correct tag was in the top 3 in every miss, but models ranked an
// activity or domain tag ahead of the system/project tag where the work
// actually landed. These heuristics are pulled directly from the miss set.
const RANKING_RULES = `## Primary vs Secondary

The \`primary\` tag is where the actual work output lands or where the change
is persisted, not the domain the content is about. The \`secondary\` tags are
supporting categories (activity type, domain, cross-cutting concerns).

Apply these ranking heuristics in order:

1. If the thread references a data system, project, or tool (parcels,
   finance, league, record, homelab, base) as the thing being modified,
   that system tag is primary. The activity tag (search, calibration,
   refactor, audit, debug) is secondary. Example: a thread about
   calibrating a land-search scoring model with parcel geometry data has
   \`parcels-system\` as primary and \`land-search\` as secondary, because
   the scoring change ships inside the parcels system.

2. If a thread spans multiple projects, the project whose repository,
   entity, or file receives the commit, edit, or new file is primary.
   The other projects are secondary. Example: a thread about writing
   a league-xo-football analysis script that lives under the base
   \`cli/\` directory has \`base-project\` as primary and
   \`league-xo-football\` as secondary, because the file lands in base.

3. If no system/project anchors the work (pure research, pure planning,
   general refactor with no project home), pick the closest domain tag
   as primary and omit secondary, or return an empty secondary list.`

// Synthesized boundary exemplars. Each is a tight before/after showing the
// correct primary on a boundary pair that all four surveyed models got wrong.
// Content is synthesized, NOT copied from benchmark cases, to avoid test-set
// leakage. These exemplars target the five miss clusters identified during
// the 2026-04-11 model survey.
const BOUNDARY_EXEMPLARS = `## Worked Examples (Boundary Disambiguation)

Example A -- parcels-system vs land-search
Input: "Recalibrate the parcel scoring heuristic to weight slope under 8%
more heavily. Update the parcels DB materialized view and re-rank the top
100 candidates."
Output:
{
  "primary": "user:tag/parcels-system.md",
  "secondary": ["user:tag/land-search.md"],
  "rationale": "The scoring change ships inside the parcels system (DB view + rerank); land-search is the downstream activity consuming it."
}

Example B -- record-project vs homelab
Input: "Recover the TM2030 tracks from the failing NAS spindle; rebuild
the rekordbox library index and cross-check against the record-project
master catalog."
Output:
{
  "primary": "user:tag/record-project.md",
  "secondary": ["user:tag/homelab.md"],
  "rationale": "Work persists in the record catalog; NAS recovery is the incidental homelab operation enabling it."
}

Example C -- base-project vs league-xo-football
Input: "Add a cli/league/build-week-snapshot.mjs script under base that
queries the xo.football API and writes weekly snapshot JSON to
data/league/snapshots/. Used by league downstream."
Output:
{
  "primary": "user:tag/base-project.md",
  "secondary": ["user:tag/league-xo-football.md"],
  "rationale": "The new file lives in the base repo cli/ tree; league-xo-football is the downstream consumer of the snapshot output."
}

Example D -- home-design-and-management vs food / personal-information
Input: "Research and document countertop material choices (quartz vs
soapstone vs butcher block) for the kitchen renovation; capture maintenance
and food-safety tradeoffs."
Output:
{
  "primary": "user:tag/home-design-and-management.md",
  "secondary": ["user:tag/food.md"],
  "rationale": "The decision artifact is a home-renovation material choice; food-safety is one evaluation axis, not the subject of the work."
}

Example E -- nano-cryptocurrency vs crypto-management / software-task
Input: "Fix the Nano RPC import bug in the wallet-sync script that drops
transactions whose amount underflows the raw-to-Nano conversion at
decimals > 6."
Output:
{
  "primary": "user:tag/nano-cryptocurrency.md",
  "secondary": ["user:tag/software-task.md"],
  "rationale": "The bug is inside Nano-specific RPC logic; the generic software-task nature is the activity type, not the subject."
}`

// Ollama `format` schema for structured tag classification output.
// `secondary` has no minItems so edge-case inputs can produce an empty list
// without violating the schema. `rationale` is capped to keep output bounded.
const TAG_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    primary: { type: 'string' },
    secondary: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 2
    },
    rationale: { type: 'string', maxLength: 200 }
  },
  required: ['primary']
}

// ============================================================================
// Tag Loading
// ============================================================================

/**
 * Load all available tags with their full content for context
 *
 * @param {Object} params
 * @param {string} params.user_public_key - User public key
 * @returns {Promise<Array>} Array of tag objects with full content
 */
export async function load_tags_with_content({ user_public_key }) {
  log('Loading tags with content')

  const tags = await list_tags_from_filesystem({
    user_public_key,
    include_archived: false
  })

  const tags_with_content = await Promise.all(
    tags.map(async (tag) => {
      const fallback = {
        base_uri: tag.base_uri,
        title: tag.title,
        description: tag.description,
        content: ''
      }

      try {
        const tag_result = await read_tag_from_filesystem({
          base_uri: tag.base_uri
        })

        if (tag_result.success) {
          return { ...fallback, content: tag_result.entity_content || '' }
        }
        return fallback
      } catch (error) {
        log(`Failed to read tag content for ${tag.base_uri}: ${error.message}`)
        return fallback
      }
    })
  )

  log(`Loaded ${tags_with_content.length} tags with content`)
  return tags_with_content
}

/**
 * Compute a content-based hash of the tag taxonomy.
 * Changes when tags are added, removed, or their content changes.
 * Does not change on git operations that only update mtimes.
 *
 * @param {Array} tags - Array of tag objects with base_uri, description, content
 * @returns {string} Short hex hash (first 12 chars of SHA-256)
 */
export function compute_taxonomy_hash(tags) {
  const sorted_entries = tags
    .map((t) => `${t.base_uri}|${t.description || ''}|${t.content || ''}`)
    .sort()

  const hash = createHash('sha256')
  hash.update(sorted_entries.join('\n'))
  return hash.digest('hex').substring(0, 12)
}

/**
 * Format tags for inclusion in the prompt
 *
 * @param {Array} tags - Array of tag objects with content
 * @returns {string} Formatted tag descriptions
 */
export function format_tags_for_prompt(tags) {
  return tags
    .map((tag) => {
      const content_preview = tag.content
        ? `\n${tag.content.substring(0, 500)}${tag.content.length > 500 ? '...' : ''}`
        : ''

      return `### ${tag.title}
base_uri: ${tag.base_uri}
${tag.description || ''}${content_preview}`
    })
    .join('\n\n')
}

// ============================================================================
// Prompt Generation
// ============================================================================

/**
 * Generate the tag analysis prompt for a thread
 *
 * @param {Object} params
 * @param {string} params.user_message - First user message from the thread
 * @param {string} params.title - Thread title (if available)
 * @param {string} params.short_description - Thread description (if available)
 * @param {Array} params.tags - Available tags with content
 * @returns {string} Prompt for the model
 */
export function generate_tag_analysis_prompt({
  user_message,
  title,
  short_description,
  tags
}) {
  const formatted_tags = format_tags_for_prompt(tags)

  const thread_context = [
    title ? `Title: ${title}` : null,
    short_description ? `Description: ${short_description}` : null
  ]
    .filter(Boolean)
    .join('\n')

  return `Classify this thread against the tag taxonomy below. Pick one primary tag and up to two secondary tags.

## Thread Information
${thread_context ? thread_context + '\n' : ''}
User messages:
"""
${user_message}
"""

## Available Tags

${formatted_tags}

${RANKING_RULES}

${BOUNDARY_EXEMPLARS}

## Instructions

1. Read the thread content and identify the work output -- what file, entity, repository, or system receives the change.
2. Pick the one tag whose scope best owns that work output. That is the primary.
3. Pick up to ${TAG_CONSTRAINTS.MAX_TAGS - 1} secondary tags for supporting categories (activity type, cross-cutting domain, downstream consumer). Omit secondary entirely if nothing else clearly applies.
4. Apply the ranking heuristics above when two tags compete for primary.
5. Check each tag's Scope and Decision Rule sections before assigning.
6. Only assign tags you are confident about. When in doubt about a secondary, omit it.

## Response Format

Return a single JSON object:

\`\`\`json
{
  "primary": "user:tag/example-tag.md",
  "secondary": ["user:tag/another-tag.md"],
  "rationale": "Under 200 chars. Name the work output and which tag owns it."
}
\`\`\``
}

/**
 * Parse the tag analysis response from the model
 *
 * @param {string} response_text - Raw model response text
 * @param {Array} available_tags - Available tags for validation
 * @returns {Object} Parsed result with tags array and success flag
 */
export function parse_tag_analysis_response(response_text, available_tags) {
  if (!response_text || typeof response_text !== 'string') {
    return {
      success: false,
      error: 'Empty response',
      tags: []
    }
  }

  // Extract JSON from response
  let json = null

  // Try markdown code block first
  const json_block_regex = /```(?:json)?\s*([\s\S]*?)```/
  const block_match = response_text.match(json_block_regex)

  if (block_match) {
    try {
      json = JSON.parse(block_match[1].trim())
    } catch (error) {
      log(`Failed to parse JSON from code block: ${error.message}`)
    }
  }

  // Try raw JSON object
  if (!json) {
    const json_object_regex = /\{[\s\S]*\}/
    const object_match = response_text.match(json_object_regex)

    if (object_match) {
      try {
        json = JSON.parse(object_match[0])
      } catch (error) {
        log(`Failed to parse raw JSON: ${error.message}`)
      }
    }
  }

  if (!json) {
    return {
      success: false,
      error: 'No JSON found in response',
      tags: []
    }
  }

  // Accept either the structured v3 shape ({primary, secondary, rationale})
  // or the legacy v2 shape ({tags, reasoning}). The structured shape is what
  // Ollama returns when called with TAG_OUTPUT_SCHEMA; the legacy shape is
  // what free-text v2 prompts and the OpenCode path produce.
  let tags
  const reasoning = json.reasoning || json.rationale || null
  if (typeof json.primary === 'string') {
    const secondary = Array.isArray(json.secondary) ? json.secondary : []
    tags = [json.primary, ...secondary]
  } else {
    tags = json.tags || []
  }

  if (!Array.isArray(tags)) {
    tags = []
  }

  // Validate tags against available tags
  const available_base_uris = new Set(available_tags.map((t) => t.base_uri))
  const valid_tags = tags.filter((tag) => {
    if (typeof tag !== 'string') {
      log(`Invalid tag type: ${typeof tag}`)
      return false
    }
    if (!available_base_uris.has(tag)) {
      log(`Tag not in available tags: ${tag}`)
      return false
    }
    return true
  })

  // Limit to max tags
  const final_tags = valid_tags.slice(0, TAG_CONSTRAINTS.MAX_TAGS)

  log(`Parsed ${final_tags.length} valid tags from response`)

  return {
    success: true,
    tags: final_tags,
    reasoning
  }
}

export { TAG_CONSTRAINTS, PROMPT_VERSION, TAG_OUTPUT_SCHEMA }
