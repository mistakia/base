---
title: Content Review and Redaction System
type: text
description: >-
  Architecture reference for the content review (classification) and content redaction (masking)
  subsystems
created_at: '2026-02-15T03:35:58.772Z'
entity_id: fdea20b4-8b7e-4352-87e8-204c6a2cd257
observations:
  - >-
    [architecture] Two distinct subsystems: content review (classification) and content redaction
    (API response masking)
  - >-
    [integration] Content review sets public_read on entities; redaction middleware reads it at
    response time
  - >-
    [principle] Stable architecture doc -- describes structure and integration, not implementation
    details
public_read: true
relations:
  - relates [[sys:system/guideline/review-for-personal-information.md]]
  - relates [[sys:system/guideline/review-for-secret-information.md]]
  - relates [[sys:system/workflow/review-for-non-public-information.md]]
tags:
  - user:tag/base-project.md
updated_at: '2026-02-15T03:35:58.772Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Content Review and Redaction System

Two distinct subsystems work together to protect non-public content:

1. **Content Review** -- classifies entities as public, acquaintance, or private and sets `public_read` on each entity
2. **Content Redaction** -- masks content at API response time when a user lacks read permission

These subsystems are independent. Content review is a batch/CLI operation that writes visibility metadata. Redaction is runtime middleware that reads permission state and masks responses.

## Content Review (Classification)

### Purpose

Scan files and threads to determine visibility tier, then persist that classification as entity metadata (`public_read`, `visibility_analyzed_at`).

### Classification Tiers

| Tier         | `public_read` | Description                                                                                               |
| ------------ | ------------- | --------------------------------------------------------------------------------------------------------- |
| public       | true          | Safe for unauthenticated access. Technical docs, open-source work, generic methodology.                   |
| acquaintance | false         | Personal context for known contacts. Project plans, hobby details, personal workflows. No PII or secrets. |
| private      | false         | PII, credentials, infrastructure details, financial records.                                              |

### Analysis Pipeline

Two-stage analysis runs per file:

1. **Regex scan** -- pattern-based detection using externalized patterns from `config/sensitive-patterns.json`. Markdown files have YAML frontmatter stripped before scanning to reduce false positives.
2. **LLM semantic analysis** -- local Ollama model classifies content using structured JSON output (classification, confidence, reasoning, findings). Falls back to regex-only when LLM is unavailable or content exceeds size limit.

Guidelines loaded during LLM analysis:

- `sys:system/guideline/review-for-personal-information.md`
- `sys:system/guideline/review-for-secret-information.md`

### Key Files

| File                                             | Role                                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `cli/review-content.mjs`                         | CLI entry point. Accepts file, directory, or glob. Supports `--regex-only`, `--apply-visibility`, `--propose-rules`, `--dry-run`. |
| `libs-server/content-review/analyze-content.mjs` | Core analysis: regex + LLM pipeline, thread analysis                                                                              |
| `libs-server/content-review/pattern-scanner.mjs` | Compiles and runs regex patterns from config                                                                                      |
| `libs-server/content-review/review-config.mjs`   | Loads and merges config (system defaults + user overlay from `config/content-review-config.json`)                                 |

### Configuration (User-Base)

| File                                | Purpose                                                               |
| ----------------------------------- | --------------------------------------------------------------------- |
| `config/sensitive-patterns.json`    | Regex patterns organized by category (PII, secrets, financial)        |
| `config/content-review-config.json` | LLM model, timeouts, tier definitions, guidance notes, guideline URIs |
| `config/content-review-benchmarks/` | Evaluation data for tuning classification accuracy                    |

### Operational Workflow

The review workflow (`sys:system/workflow/review-for-non-public-information.md`) defines a three-phase process:

1. **Regex-only pass** -- fast first scan to identify files needing deeper analysis
2. **LLM semantic review** -- full classification with parallel agents for large directories
3. **Apply visibility** -- write `public_read` and `visibility_analyzed_at` to entities; optionally propose role permission rule changes

The `--apply-visibility` flag writes metadata; `--propose-rules` suggests additions to role entities like `role/public-reader.md` and `role/acquaintance.md`.

## Content Redaction (API Response Masking)

Documented in detail in `docs/permission-system-design.md` Section 8. Key points summarized here.

### Purpose

When a user lacks read permission for a resource, return a redacted response that preserves structure while masking content. Users see that content exists without accessing the data.

### How It Works

1. Permission middleware sets `req.access.read_allowed` based on identity, role rules, and entity `public_read`
2. Response interceptor (`apply_redaction_interceptor`) wraps `res.json` to check access
3. If read denied, content-type-aware redaction replaces sensitive values with block characters (`U+2588`)
4. Redacted responses include `is_redacted: true` flag

### Redaction Strategies by Content Type

- **Text/code**: replace non-whitespace with block chars, preserve word boundaries and indentation
- **Markdown**: AST-aware redaction via remark -- preserves headings, lists, formatting structure
- **Paths/URIs**: preserve directory separators, extensions, hyphen positions
- **Relations**: preserve relation type and bracket structure, redact URIs
- **Entity properties**: type-aware -- timestamps keep shape, UUIDs keep dash positions, booleans become false, numbers become 9999

### Key Files

| File                                                           | Role                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `server/middleware/content-redactor.mjs`                       | All redaction functions (text, code, markdown, entities, threads, timelines)  |
| `server/middleware/permissions.mjs`                            | Response interceptor that triggers redaction based on `req.access`            |
| `client/views/components/primitives/styled/RedactedContent.js` | React component for rendering redacted content with restricted-access styling |

### Timeline Redaction

Thread timelines receive entry-type-specific redaction: message content, tool parameters (preserving structural params like `limit`/`offset`), tool results, thinking content, and state change metadata are all redacted independently.

## Integration Between Subsystems

```
Content Review (batch)              Permission System (runtime)
        |                                    |
  classifies files              checks identity + role rules
        |                          + entity public_read
        v                                    |
  sets public_read                           v
  on entity metadata  ------>  req.access.read_allowed
                                             |
                                             v
                               Content Redaction middleware
                                  masks response if denied
```

The `public_read` field is the bridge: content review writes it, the permission system reads it. Role-based rules can override per-entity visibility (e.g., a broad deny rule on a directory takes precedence over individual `public_read: true` settings).
