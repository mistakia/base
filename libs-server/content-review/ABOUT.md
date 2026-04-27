# Content Review Module

Server-side library powering `base review` content classification. Combines
regex pattern scanning, an optional privacy-filter span detector, and Ollama
semantic classification into a per-file/per-thread visibility verdict.

See `user:text/base/content-review-and-redaction-system.md` for architecture
and the operational workflow.

## Layout

- `analyze-content.mjs` -- per-file orchestrator. Runs regex, optional
  privacy-filter span scan, optional short-circuit, Ollama (single-chunk or
  chunked), and applies regex/filter floors to the LLM verdict. Also exposes
  `analyze_thread` for thread directory aggregation.
- `pattern-scanner.mjs` -- compiles patterns from
  `config/sensitive-patterns.json` and scans filename, frontmatter (with
  exclusion list for structural fields), and body.
- `review-config.mjs` -- defaults plus deep-merge with user-base
  `config/content-review-config.json`. Owns the `privacy_filter` block.
- `classification-floors.mjs` -- `apply_regex_floor` and `apply_filter_floor`
  with shared most-restrictive-wins semantics. Both floor functions live here
  to keep policy-mapping logic out of the orchestrator.
- `privacy-filter-client.mjs` -- HTTP client for the privacy-filter sidecar
  managed by `extension/inference`. Idempotent `base inference ensure
  privacy-filter` shell-out on first call; one retry on `ECONNREFUSED`.

## Pipeline

```
file -> regex scan (full content)
     -> privacy-filter span scan (content_body, gated by config.enabled)
     -> optional short_circuit_public when both regex and filter are clean
     -> Ollama tier classifier (per chunk; receives regex + filter context)
     -> apply_regex_floor + apply_filter_floor (most-restrictive wins)
     -> classification
```
