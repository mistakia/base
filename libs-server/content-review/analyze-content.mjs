import { readFile } from 'fs/promises'
import path from 'path'

import debug from 'debug'
import frontMatter from 'front-matter'

import { call_tier_classifier } from './tier-classifier-client.mjs'
import { extract_json_from_response } from '#libs-server/metadata/parse-analysis-output.mjs'
import { read_guideline_from_filesystem } from '#libs-server/guideline/filesystem/read-guideline-from-filesystem.mjs'
import { scan_file_content } from './pattern-scanner.mjs'
import { load_review_config } from './review-config.mjs'
import {
  apply_filter_floor,
  apply_regex_floor
} from './classification-floors.mjs'
import { classify_text } from './privacy-filter-client.mjs'

const log = debug('content-review:analyze')

let cached_guideline_text = null

// JSON schema for Ollama structured output
const CONTENT_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    classification: {
      type: 'string',
      enum: ['public', 'acquaintance', 'private']
    },
    confidence: {
      type: 'number'
    },
    reasoning: {
      type: 'string'
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          description: { type: 'string' },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high']
          }
        },
        required: ['category', 'description', 'severity']
      }
    }
  },
  required: ['classification', 'confidence', 'reasoning', 'findings']
}

/**
 * Load guideline text from configured guideline entities.
 * Caches the result until config cache is cleared.
 *
 * @returns {Promise<string>} Concatenated guideline text
 */
async function load_guideline_text() {
  if (cached_guideline_text) {
    return cached_guideline_text
  }

  const review_config = await load_review_config()
  const guideline_uris = review_config.guidelines || []
  const sections = []

  for (const uri of guideline_uris) {
    try {
      const result = await read_guideline_from_filesystem({ base_uri: uri })
      if (result.success && result.content) {
        sections.push(result.content)
      } else {
        log(`Could not load guideline ${uri}: ${result.error || 'unknown'}`)
      }
    } catch (error) {
      log(`Error loading guideline ${uri}: ${error.message}`)
    }
  }

  cached_guideline_text = sections.join('\n\n')
  return cached_guideline_text
}

/**
 * Clear cached guideline text (call when config is reloaded)
 */
export function clear_guideline_cache() {
  cached_guideline_text = null
}

/**
 * Build the LLM prompt for content classification.
 * Loads tier definitions and guidance notes from config.
 */
async function build_review_prompt({
  content,
  file_path,
  regex_findings,
  filter_spans = [],
  metadata
}) {
  const review_config = await load_review_config()
  const guideline_text = await load_guideline_text()

  const tier_defs = review_config.tier_definitions || {}
  const guidance_notes = review_config.guidance_notes || []
  const allowable_usernames = review_config.allowable_usernames || []

  const findings_summary =
    regex_findings.length > 0
      ? `\nRegex pattern scan found ${regex_findings.length} potential issue(s). NOTE: These are heuristic matches and may contain false positives (e.g., numeric IDs matching phone patterns, technical terms matching password patterns). Use your judgment based on the actual content context:\n${regex_findings
          .map(
            (f) =>
              `- ${f.source || 'body'}${f.source === 'body' || !f.source ? ` line ${f.line_number}` : ''}: ${f.pattern_name} (${f.category}) - matched: "${f.matched_text}"`
          )
          .join('\n')}`
      : '\nRegex pattern scan found no issues.'

  const FILTER_PROMPT_SPAN_CAP = 50
  const filter_summary = (() => {
    if (!filter_spans || filter_spans.length === 0) return ''
    const sorted = [...filter_spans].sort(
      (a, b) => (b.score ?? 0) - (a.score ?? 0)
    )
    const shown = sorted.slice(0, FILTER_PROMPT_SPAN_CAP)
    const omitted = sorted.length - shown.length
    const lines = shown.map(
      (s) =>
        `- ${s.label} @${s.start}-${s.end} (score ${s.score?.toFixed ? s.score.toFixed(2) : s.score}): "${s.text}"`
    )
    if (omitted > 0) {
      lines.push(`(+${omitted} additional spans omitted; showing top ${FILTER_PROMPT_SPAN_CAP} by score)`)
    }
    return `\nPrivacy-filter token classifier found ${filter_spans.length} PII span(s). NOTE: These are model predictions and may include false positives; treat as supplementary evidence, not authority:\n${lines.join('\n')}`
  })()

  const guidance_section =
    guidance_notes.length > 0
      ? `\n## Additional Classification Guidance\n${guidance_notes.map((n) => `- ${n}`).join('\n')}\n`
      : ''

  const system = `You are a content reviewer classifying files for visibility permissions.

Use BOTH the file path and the content to classify. Directory context often signals the privacy tier — for example, files describing the same topic may be public in one directory and private in another based on whether they reference real personal assets. Apply path-based policy from the classification guidance below.

Classify each file into one of three tiers:
- "public": ${tier_defs.public || 'Safe for unauthenticated public access.'}
- "acquaintance": ${tier_defs.acquaintance || 'Contains information appropriate for known contacts but not the general public.'}
- "private": ${tier_defs.private || 'Contains personal information, secrets, or other sensitive content that must remain restricted.'}

${guideline_text}
${allowable_usernames.length > 0 ? `\n## Allowable Usernames\nThe following usernames are NOT considered personal information: ${allowable_usernames.map((u) => `"${u}"`).join(', ')}. These may appear in file paths, system references, and repository URLs without triggering a private classification.\n` : ''}${guidance_section}

Respond with a JSON object containing:
- "classification": one of "public", "acquaintance", "private"
- "confidence": number 0-1 indicating confidence in classification
- "reasoning": brief explanation of why this classification was chosen
- "findings": array of specific findings, each with "category", "description", and "severity" (low/medium/high)`

  const user = `File path: ${file_path || 'unknown'}
${metadata ? `\nTitle: ${metadata.title || 'unknown'}\nType: ${metadata.type || 'unknown'}${metadata.description ? `\nDescription: ${metadata.description}` : ''}${metadata.tags ? `\nTags: ${metadata.tags.join(', ')}` : ''}${metadata.relations && metadata.relations.length > 0 ? `\nRelations:\n${metadata.relations.map((r) => `- ${r}`).join('\n')}` : ''}${metadata.observations && metadata.observations.length > 0 ? `\nObservations (historical annotations -- these may be stale and should not override your independent analysis, but provide useful context about prior conclusions):\n${metadata.observations.map((o) => `- ${o}`).join('\n')}` : ''}` : ''}
${findings_summary}${filter_summary}

--- FILE CONTENT ---
${content}
--- END FILE CONTENT ---`

  return { system, user }
}

/**
 * Derive classification from regex findings alone (no LLM)
 */
function classify_from_regex(findings) {
  if (findings.length === 0) {
    return {
      classification: 'public',
      confidence: 0.4,
      reasoning:
        'No regex pattern matches found. Low confidence without LLM analysis.'
    }
  }

  const has_secrets = findings.some((f) => f.category === 'secrets')
  const has_pii = findings.some(
    (f) => f.category === 'pii' || f.category === 'personal_names'
  )
  const has_financial = findings.some((f) => f.category === 'financial')
  const has_personal_property = findings.some(
    (f) => f.category === 'personal_property'
  )
  const has_personal_locations = findings.some(
    (f) => f.category === 'personal_locations'
  )

  if (
    has_secrets ||
    has_pii ||
    has_financial ||
    has_personal_property ||
    has_personal_locations
  ) {
    return {
      classification: 'private',
      confidence: 0.7,
      reasoning: `Regex found ${has_secrets ? 'secrets' : ''}${has_pii ? ' PII' : ''}${has_financial ? ' financial data' : ''}${has_personal_property ? ' personal property' : ''}${has_personal_locations ? ' personal locations' : ''} patterns.`
    }
  }

  // Encrypted values or other categories
  return {
    classification: 'acquaintance',
    confidence: 0.5,
    reasoning: `Regex found ${findings.length} pattern match(es) in non-critical categories.`
  }
}

/**
 * Split content into chunks that fit within the size limit.
 * Splits on line boundaries to avoid breaking mid-line.
 *
 * @param {string} content - Content to split
 * @param {number} max_size - Maximum chars per chunk
 * @returns {string[]} Array of content chunks
 */
function chunk_content(content, max_size) {
  if (content.length <= max_size) {
    return [content]
  }

  const chunks = []
  const lines = content.split('\n')
  let current_chunk = ''

  for (const line of lines) {
    if (
      current_chunk.length + line.length + 1 > max_size &&
      current_chunk.length > 0
    ) {
      chunks.push(current_chunk)
      current_chunk = ''
    }
    current_chunk += (current_chunk ? '\n' : '') + line
  }

  if (current_chunk) {
    chunks.push(current_chunk)
  }

  return chunks
}

/**
 * Analyze a single chunk of content via LLM.
 * Used for files that fit within the size limit (single prompt).
 */
async function analyze_single_chunk({
  content,
  file_path,
  metadata,
  regex_findings,
  filter_spans = [],
  scan_result,
  model,
  timeout_ms
}) {
  const { system, user } = await build_review_prompt({
    content,
    file_path,
    regex_findings,
    filter_spans,
    metadata
  })

  const { output, duration_ms } = await call_tier_classifier({
    prompt: user,
    system,
    model,
    timeout_ms,
    format: CONTENT_REVIEW_SCHEMA
  })

  log(`LLM analysis completed in ${duration_ms}ms`)

  let llm_result = null
  try {
    llm_result = JSON.parse(output)
  } catch {
    llm_result = extract_json_from_response(output)
  }

  if (llm_result && llm_result.classification) {
    return {
      file_path,
      file_type: scan_result.file_type,
      lines_scanned: scan_result.lines_scanned,
      regex_findings,
      llm_analysis: llm_result,
      classification: llm_result.classification,
      confidence: llm_result.confidence || 0.5,
      reasoning: llm_result.reasoning || '',
      findings: llm_result.findings || [],
      method: 'llm',
      duration_ms
    }
  }

  log('LLM output could not be parsed, marking as llm_unavailable')
  return {
    file_path,
    file_type: scan_result.file_type,
    lines_scanned: scan_result.lines_scanned,
    regex_findings,
    llm_analysis: null,
    classification: null,
    confidence: 0,
    reasoning: 'LLM output could not be parsed as valid JSON',
    method: 'llm_unavailable',
    warning: 'LLM output could not be parsed as valid JSON'
  }
}

/**
 * Analyze a single file for sensitive content.
 *
 * @param {object} options
 * @param {string} options.file_path - Path to file to analyze
 * @param {string} [options.model] - Ollama model to use
 * @param {boolean} [options.regex_only] - If true, skip LLM analysis
 * @param {number} [options.max_content_size] - Max chars per chunk for LLM analysis
 * @param {number} [options.timeout_ms] - Timeout for LLM call
 * @returns {Promise<object>} Analysis result with classification and findings
 */
export async function analyze_content({
  file_path,
  model,
  regex_only = false,
  max_content_size,
  timeout_ms,
  privacy_filter_override
} = {}) {
  const review_config = await load_review_config()
  if (!model) model = review_config.default_model
  if (max_content_size == null)
    max_content_size = review_config.max_content_size
  if (timeout_ms == null) timeout_ms = review_config.timeout_ms

  const content = await readFile(file_path, 'utf8')

  // Stage 1: Regex pattern scan
  const scan_result = await scan_file_content({ file_path, content })

  // Prepare content body for LLM (strip frontmatter for markdown)
  const ext = path.extname(file_path).toLowerCase()
  let content_body = content
  let metadata = null
  if (ext === '.md' || ext === '.markdown') {
    try {
      const parsed = frontMatter(content)
      content_body = parsed.body
      if (parsed.attributes && typeof parsed.attributes === 'object') {
        metadata = {
          title: parsed.attributes.title,
          type: parsed.attributes.type,
          description: parsed.attributes.description,
          tags: Array.isArray(parsed.attributes.tags)
            ? parsed.attributes.tags
            : null,
          observations: Array.isArray(parsed.attributes.observations)
            ? parsed.attributes.observations
            : null,
          relations: Array.isArray(parsed.attributes.relations)
            ? parsed.attributes.relations
            : null
        }
      }
    } catch {
      content_body = content
    }
  }

  // Stage 2: Check if LLM analysis should be skipped
  if (regex_only) {
    const regex_classification = classify_from_regex(scan_result.findings)
    return {
      file_path,
      file_type: scan_result.file_type,
      lines_scanned: scan_result.lines_scanned,
      regex_findings: scan_result.findings,
      llm_analysis: null,
      classification: regex_classification.classification,
      confidence: regex_classification.confidence,
      reasoning: regex_classification.reasoning,
      method: 'regex_only'
    }
  }

  // Stage 2b: Privacy-filter span scan (single pass over content_body even
  // when chunking; filter handles 128K context natively)
  let filter_result = null
  const pf_config = { ...(review_config.privacy_filter || {}) }
  if (typeof privacy_filter_override === 'boolean') {
    pf_config.enabled = privacy_filter_override
  }
  if (pf_config.enabled) {
    try {
      filter_result = await classify_text({
        text: content_body,
        score_threshold: pf_config.score_threshold ?? 0.0
      })
    } catch (error) {
      log(`Privacy filter unavailable: ${error.message}`)
      filter_result = null
    }
  }
  const filter_spans = filter_result?.spans || []

  // Stage 2c: Short-circuit when both regex and filter are clean
  if (
    pf_config.enabled &&
    pf_config.short_circuit_public &&
    filter_result &&
    scan_result.findings.length === 0 &&
    filter_result.labels_found.length === 0
  ) {
    return {
      file_path,
      file_type: scan_result.file_type,
      lines_scanned: scan_result.lines_scanned,
      regex_findings: scan_result.findings,
      filter_result,
      llm_analysis: null,
      classification: 'public',
      confidence: 1.0,
      reasoning: 'no regex matches and no filter spans',
      findings: [],
      method: 'regex_filter_short_circuit'
    }
  }

  // Stage 3: LLM analysis via Ollama (with chunking for large files)
  try {
    const chunks = chunk_content(content_body, max_content_size)

    if (chunks.length === 1) {
      // Single chunk - standard path
      const single_result = await analyze_single_chunk({
        content: content_body,
        file_path,
        metadata,
        regex_findings: scan_result.findings,
        filter_spans,
        scan_result,
        model,
        timeout_ms
      })
      if (filter_result) single_result.filter_result = filter_result
      // Skip floor for llm_unavailable — classification is null when
      // LLM output is unparseable, so there is nothing to floor
      if (single_result.method === 'llm') {
        apply_regex_floor(single_result, scan_result.findings)
        apply_filter_floor(single_result, filter_result, pf_config)
      }
      return single_result
    }

    // Multi-chunk path: analyze each chunk, aggregate with most-restrictive
    log(
      `File split into ${chunks.length} chunks (${content_body.length} chars total)`
    )
    const chunk_results = []
    let total_duration_ms = 0

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const chunk_label = `[chunk ${i + 1}/${chunks.length}]`
      log(`Analyzing ${chunk_label} (${chunk.length} chars)`)

      try {
        const { system, user } = await build_review_prompt({
          content: chunk,
          file_path: `${file_path} ${chunk_label}`,
          regex_findings: i === 0 ? scan_result.findings : [],
          filter_spans: i === 0 ? filter_spans : [],
          metadata
        })

        const { output, duration_ms: chunk_duration } = await call_tier_classifier({
          prompt: user,
          system,
          model,
          timeout_ms,
          format: CONTENT_REVIEW_SCHEMA
        })

        total_duration_ms += chunk_duration
        let llm_result = null
        try {
          llm_result = JSON.parse(output)
        } catch {
          llm_result = extract_json_from_response(output)
        }

        if (llm_result && llm_result.classification) {
          chunk_results.push(llm_result)
        }
      } catch (error) {
        log(`Chunk ${i + 1} failed: ${error.message}`)
      }
    }

    if (chunk_results.length === 0) {
      log('All chunks failed, marking as llm_unavailable')
      return {
        file_path,
        file_type: scan_result.file_type,
        lines_scanned: scan_result.lines_scanned,
        regex_findings: scan_result.findings,
        filter_result: filter_result || null,
        llm_analysis: null,
        classification: null,
        confidence: 0,
        reasoning: 'All LLM chunks failed analysis',
        method: 'llm_unavailable',
        warning: `All ${chunks.length} chunks failed LLM analysis`
      }
    }

    // Aggregate: most restrictive classification wins
    const classification_priority = { private: 3, acquaintance: 2, public: 1 }
    const most_restrictive = chunk_results.reduce((best, r) =>
      (classification_priority[r.classification] || 0) >
      (classification_priority[best.classification] || 0)
        ? r
        : best
    )

    const all_findings = chunk_results.flatMap((r) => r.findings || [])
    const all_reasoning = chunk_results
      .filter((r) => r.classification === most_restrictive.classification)
      .map((r) => r.reasoning)
      .filter(Boolean)

    const chunked_result = {
      file_path,
      file_type: scan_result.file_type,
      lines_scanned: scan_result.lines_scanned,
      regex_findings: scan_result.findings,
      filter_result: filter_result || null,
      llm_analysis: most_restrictive,
      classification: most_restrictive.classification,
      confidence: most_restrictive.confidence || 0.5,
      reasoning: all_reasoning[0] || '',
      findings: all_findings,
      method: 'llm_chunked',
      duration_ms: total_duration_ms,
      chunks_analyzed: chunk_results.length,
      chunks_total: chunks.length
    }
    apply_regex_floor(chunked_result, scan_result.findings)
    apply_filter_floor(chunked_result, filter_result, pf_config)
    return chunked_result
  } catch (error) {
    // Ollama unreachable - do not classify without LLM
    log(`LLM analysis failed: ${error.message}`)
    return {
      file_path,
      file_type: scan_result.file_type,
      lines_scanned: scan_result.lines_scanned,
      regex_findings: scan_result.findings,
      llm_analysis: null,
      classification: null,
      confidence: 0,
      reasoning: `Ollama unavailable: ${error.message}`,
      method: 'llm_unavailable',
      warning: `Ollama unavailable: ${error.message}`
    }
  }
}

/**
 * Analyze a thread directory by scanning metadata.json and timeline.jsonl.
 * Aggregates findings into a single per-thread classification using the most
 * restrictive classification across files.
 *
 * @param {object} options
 * @param {string} options.thread_dir - Path to thread UUID directory
 * @param {string} [options.model] - Ollama model to use
 * @param {boolean} [options.regex_only] - Skip LLM analysis
 * @param {number} [options.max_content_size] - Max chars for LLM analysis
 * @param {boolean} [options.include_raw_data] - Include raw-data/ scanning
 * @param {boolean} [options.timeline_llm] - Use LLM analysis for timeline.jsonl (default: false, regex-only)
 * @returns {Promise<object>} Aggregated thread analysis result
 */
export async function analyze_thread({
  thread_dir,
  model,
  regex_only = false,
  max_content_size,
  include_raw_data = false,
  timeline_llm = false,
  privacy_filter_override
} = {}) {
  const review_config = await load_review_config()
  if (!model) model = review_config.default_model
  if (max_content_size == null)
    max_content_size = review_config.max_content_size

  const results = []
  const files_to_scan = []

  // Always scan metadata.json
  const metadata_path = path.join(thread_dir, 'metadata.json')
  files_to_scan.push(metadata_path)

  // Always scan timeline.jsonl (primary content)
  const timeline_path = path.join(thread_dir, 'timeline.jsonl')
  files_to_scan.push(timeline_path)

  // Optionally scan raw-data/
  if (include_raw_data) {
    const { readdir } = await import('fs/promises')
    try {
      const raw_dir = path.join(thread_dir, 'raw-data')
      const raw_files = await readdir(raw_dir)
      for (const f of raw_files) {
        files_to_scan.push(path.join(raw_dir, f))
      }
    } catch {
      // raw-data directory may not exist
    }
  }

  for (const file_path of files_to_scan) {
    try {
      const is_timeline = path.basename(file_path) === 'timeline.jsonl'
      const file_regex_only = regex_only || (is_timeline && !timeline_llm)
      const result = await analyze_content({
        file_path,
        model,
        regex_only: file_regex_only,
        max_content_size,
        privacy_filter_override
      })
      results.push(result)
    } catch (error) {
      log(`Skipping ${file_path}: ${error.message}`)
    }
  }

  if (results.length === 0) {
    return {
      thread_dir,
      classification: 'private',
      confidence: 0.3,
      reasoning: 'No files could be analyzed. Defaulting to private.',
      method: 'default',
      file_results: []
    }
  }

  // If any file result has llm_unavailable, propagate it for the thread
  const has_llm_unavailable = results.some(
    (r) => r.method === 'llm_unavailable'
  )
  if (has_llm_unavailable) {
    const total_findings = results.reduce(
      (sum, r) => sum + (r.regex_findings?.length || 0),
      0
    )
    return {
      thread_dir,
      classification: null,
      confidence: 0,
      reasoning: `LLM unavailable for one or more files in thread`,
      method: 'llm_unavailable',
      total_regex_findings: total_findings,
      file_results: results.map((r) => ({
        file_path: r.file_path,
        classification: r.classification,
        method: r.method,
        regex_finding_count: r.regex_findings?.length || 0,
        warning: r.warning || null
      }))
    }
  }

  // Use most restrictive classification across all files
  const classification_priority = { private: 3, acquaintance: 2, public: 1 }
  let most_restrictive = results[0]
  for (const r of results) {
    if (
      (classification_priority[r.classification] || 0) >
      (classification_priority[most_restrictive.classification] || 0)
    ) {
      most_restrictive = r
    }
  }

  const total_findings = results.reduce(
    (sum, r) => sum + (r.regex_findings?.length || 0),
    0
  )

  return {
    thread_dir,
    classification: most_restrictive.classification,
    confidence: most_restrictive.confidence,
    reasoning: `Most restrictive from ${results.length} file(s): ${most_restrictive.reasoning}`,
    method: most_restrictive.method,
    total_regex_findings: total_findings,
    file_results: results.map((r) => ({
      file_path: r.file_path,
      classification: r.classification,
      method: r.method,
      regex_finding_count: r.regex_findings?.length || 0,
      warning: r.warning || null
    }))
  }
}
