/**
 * Timeline entry schema version.
 *
 * Versioning lets producers stamp entries on write and lets migrations
 * gate transformations on version rather than type inference, so any
 * file whose entries are all at the target version is left untouched
 * (no rewrite, no rename, no race with concurrent appenders).
 *
 *   1 = legacy 12-type schema (pre-consolidation; absent schema_version
 *       on disk also means version 1)
 *   2 = consolidated 5-type schema (message, tool_call, tool_result,
 *       thinking, system)
 */
export const TIMELINE_SCHEMA_VERSION = 2
