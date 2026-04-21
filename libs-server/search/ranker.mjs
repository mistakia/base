/**
 * Search Ranker
 *
 * Pure scoring: takes deduped hits (one per entity_uri, carrying per-source
 * best raw_score entries via a `matches` array) and computes a final score
 * using per-source min-max normalization, source weights, and a small
 * recency boost. Dedupe is owned by the orchestrator; this module does
 * not dedupe.
 */

const SOURCE_WEIGHTS = {
  entity: 1.0,
  thread_metadata: 0.9,
  thread_timeline: 0.7,
  path: 0.5,
  semantic: 0.8
}

const RECENCY_DECAY_DAYS = 365
const RECENCY_MAX_BOOST = 0.1
const MS_PER_DAY = 24 * 60 * 60 * 1000

function compute_per_source_ranges(hits) {
  const ranges = new Map()
  for (const hit of hits) {
    for (const match of hit.matches || []) {
      const cur = ranges.get(match.source) || {
        min: Infinity,
        max: -Infinity
      }
      if (match.raw_score < cur.min) cur.min = match.raw_score
      if (match.raw_score > cur.max) cur.max = match.raw_score
      ranges.set(match.source, cur)
    }
  }
  return ranges
}

function normalize(raw_score, range) {
  if (!range) return 0
  if (range.max === range.min) return 1
  return (raw_score - range.min) / (range.max - range.min)
}

function recency_boost(updated_at_iso) {
  if (!updated_at_iso) return 0
  const updated_at = Date.parse(updated_at_iso)
  if (Number.isNaN(updated_at)) return 0
  const age_days = Math.max(0, (Date.now() - updated_at) / MS_PER_DAY)
  return Math.min(
    RECENCY_MAX_BOOST,
    RECENCY_MAX_BOOST * Math.exp(-age_days / RECENCY_DECAY_DAYS)
  )
}

/**
 * Rank deduped hits. Each input hit has shape:
 *   {entity_uri, matches: [{source, raw_score, matched_field, snippet, extras}], updated_at?}
 *
 * @param {Object} params
 * @param {Array<Object>} params.hits
 * @returns {Array<Object>} Same shape with added `score` field, sorted desc
 */
export function rank({ hits }) {
  if (!hits || hits.length === 0) return []

  const ranges = compute_per_source_ranges(hits)
  const scored = hits.map((hit) => {
    let total = 0
    const per_source_best = new Map()
    for (const match of hit.matches || []) {
      const normalized = normalize(match.raw_score, ranges.get(match.source))
      const weight = SOURCE_WEIGHTS[match.source] ?? 0
      const weighted = normalized * weight
      const prior = per_source_best.get(match.source) ?? -Infinity
      if (weighted > prior) per_source_best.set(match.source, weighted)
    }
    for (const value of per_source_best.values()) {
      total += value
    }
    total += recency_boost(hit.updated_at)
    return { ...hit, score: total }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored
}

export {
  SOURCE_WEIGHTS,
  RECENCY_DECAY_DAYS,
  RECENCY_MAX_BOOST
}

export default { rank, SOURCE_WEIGHTS, RECENCY_DECAY_DAYS, RECENCY_MAX_BOOST }
