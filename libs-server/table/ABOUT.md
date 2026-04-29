# Table helpers

Server-side helpers shared by the data-view table endpoints (`POST /api/threads/table`, `POST /api/tasks/table`).

## Layout

- `search-filter.mjs` — `resolve_table_search({ q, entity_type, requesting_user_public_key })`. Enforces the 3-character minimum, calls `orchestrator_filter_mode` (see `libs-server/search/filter-mode.mjs`), and rekeys the resulting URI map to the entity type's natural row key.

## Contract with table request processors

Processors call `resolve_table_search` once per request:

- Below the minimum length, returns `null` and the table query runs unfiltered.
- Empty URI set short-circuits to `{ rows: [], total: 0, row_highlights: {} }`.
- Otherwise the processor builds a single `{ column_id, operator: 'IN', value }` filter from `uri_set_as_row_keys` and passes it to BOTH `query_*` and `count_*` so pagination totals reflect the filtered set.

Row-key rekeying:

- `entity_type: 'thread'` → `thread_id` (extracted from `user:thread/{id}` URIs).
- `entity_type: 'task'` → `base_uri` (pass-through).

The returned `row_highlights` Map is serialized to a plain object on the response payload alongside `rows` and `total_row_count` so the client cell renderers can read it via TanStack `meta.row_highlights`.

## Related

- `libs-server/search/filter-mode.mjs` — the orchestrator entry this helper wraps.
- `system/text/search-system-design.md` — full system design including filter mode and highlight transport.
- `server/lib/threads/process-thread-table-request.mjs`, `server/lib/tasks/process-task-table-request.mjs` — current consumers.
