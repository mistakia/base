---
title: Review for Non-Public Information
type: workflow
description: >-
  Workflow to systematically review files for personal information, secret information, and other
  non-public data that should be protected, using the content review CLI tool
base_uri: sys:system/workflow/review-for-non-public-information.md
created_at: '2025-08-16T06:21:19.774Z'
entity_id: f15d1353-bf90-4ac7-957c-0c4dde4f427f
observations:
  - '[security] Protecting non-public information is critical for security and privacy'
  - '[pattern] CLI scripts provide reliable pattern detection for known sensitive data'
  - '[principle] Combining automated detection with semantic review ensures comprehensive coverage'
  - '[updated] 2026-02-14 - Migrated from file-review.sh + detect-sensitive-patterns.sh to review-content.mjs CLI'
prompt_properties:
  - name: directory_path
    type: string
    description: The directory path to review for non-public information
relations:
  - follows [[sys:system/guideline/write-workflow.md]]
  - uses [[sys:system/guideline/review-for-personal-information.md]]
  - uses [[sys:system/guideline/review-for-secret-information.md]]
tags: []
tools:
  - Task
  - Glob
  - Read
  - Edit
  - MultiEdit
  - LS
updated_at: '2026-02-14T00:00:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

<task>Review a directory structure for non-public information including personal data, secrets, and sensitive content</task>

<context>
This workflow systematically reviews files in a given directory path for various types of non-public information that should be protected or removed. It uses the `review-content.mjs` CLI tool which combines automated regex pattern detection with local LLM semantic analysis via Ollama.

The workflow applies two key guidelines:

- [[sys:system/guideline/review-for-personal-information.md]] - For identifying PII
- [[sys:system/guideline/review-for-secret-information.md]] - For identifying credentials and secrets

Directory to review: ${directory_path}
</context>

<instructions>
## Initial Setup: Read Guidelines

First, read and understand the review guidelines:

- Read [[sys:system/guideline/review-for-personal-information.md]] to understand PII patterns
- Read [[sys:system/guideline/review-for-secret-information.md]] to understand secret patterns
- Note all specific patterns and keywords to search for

## Phase 1: Full Scan (Regex + LLM Analysis)

1. Run the content review CLI with full analysis:

   ```bash
   node cli/review-content.mjs --path "${directory_path}" --progress --output /tmp/review-results.jsonl
   ```

   - Stage 1 (regex): Scans against externalized patterns in `config/sensitive-patterns.json`
   - Stage 2 (LLM): Classifies each file as `public`, `acquaintance`, or `private` via local Ollama model
   - For markdown files, strips YAML frontmatter before scanning to avoid false positives
   - For thread directories, scans `metadata.json` and `timeline.jsonl` (timeline uses regex-only by default)
   - Files exceeding the size limit (32K chars) are chunked for LLM analysis
   - Falls back to regex-only if Ollama is unavailable
   - JSONL output enables resume if scan is interrupted

2. Launch parallel review agents using the Task tool for large directories:
   - Split the directory into segments and review in parallel
   - Each agent runs `review-content.mjs` on its segment

3. Review the findings and classifications before proceeding

## Phase 2: Apply Visibility and Propose Rules

4. Apply visibility classifications to entities:

   ```bash
   # Preview changes first
   node cli/review-content.mjs --path "${directory_path}" --apply-visibility --dry-run --progress

   # Apply changes
   node cli/review-content.mjs --path "${directory_path}" --apply-visibility --progress
   ```

   - Sets `public_read` on each entity/thread based on classification
   - Sets `visibility_analyzed_at` timestamp for incremental scanning
   - Classification mapping: `public` -> `public_read: true`, `acquaintance`/`private` -> `public_read: false`

5. Propose role permission rule updates:

   ```bash
   node cli/review-content.mjs --path "${directory_path}" --propose-rules --json
   ```

   - Loads current rules from `role/public-reader.md` and `role/acquaintance.md`
   - Proposes new allow rules for paths that should be opened up
   - Proposes new deny rules for sensitive content within existing broad allows
   - Do NOT modify role files directly - only propose changes for human review

6. Document proposed permission changes:
   - List all paths that should potentially be restricted
   - Specify which roles should have access
   - Provide clear reasoning for each proposed rule
   - Include severity assessment for each recommendation
     </instructions>

<output_format>

## Review Summary

### Statistics

- Total files reviewed: X
- Issues found: Y
- Files classified: public=X, acquaintance=Y, private=Z

### Findings by Category

#### Critical - Secrets and Credentials

- File: path/to/file.ext
  - Line X: [Type of secret found]
  - Classification: private
  - Remediation: [Specific action needed]

#### High - Personal Information

- File: path/to/file.ext
  - Line X: [Type of PII found]
  - Classification: private
  - Remediation: [Specific action needed]

#### Medium - Other Sensitive Information

- File: path/to/file.ext
  - Line X: [Type of sensitive data]
  - Classification: acquaintance
  - Remediation: [Specific action needed]

### Visibility Changes Applied

- Files set to public_read: true: X
- Files set to public_read: false: Y
- Files skipped (already analyzed): Z

### Proposed Role Rule Changes

#### public-reader

- action: deny, pattern: "path/to/sensitive.md", reason: "Contains credentials"

#### acquaintance

- action: deny, pattern: "path/to/private.md", reason: "Contains PII"

### Recommended Actions

1. Immediate actions for critical findings
2. Short-term remediation plan
3. Long-term security improvements
   </output_format>
