---
title: MCP Server (Removed)
type: text
description: The Base MCP server layer has been removed in favor of the base entity create CLI command
base_uri: sys:system/text/mcp-server.md
created_at: '2025-01-06T21:10:00.000Z'
entity_id: cd0f483c-1392-43cc-8e6a-6ef35f961774
observations:
  - '[removed] MCP service layer removed 2026-02-23 in favor of CLI-based entity creation'
  - '[migration] entity_create functionality replaced by base entity create CLI command'
  - '[evaluation] Retained as deprecation record with migration guidance for historical references.'
public_read: true
relations:
  - relates_to [[sys:system/text/system-design.md]]
updated_at: '2026-03-02T06:41:47.455Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:36:56.923Z'
---

# MCP Server (Removed)

The Base MCP server layer (`services/mcp/`, `libs-server/mcp/`) has been removed. The only Base-specific MCP tool was `entity_create`, which is now available as the `base entity create` CLI command with full feature parity.

Third-party MCP servers (PostgreSQL, GraphQL, browser automation, etc.) configured in `.mcp.json` are unaffected by this removal.

## Migration

- `mcp__base__entity_create` tool calls -> `base entity create` CLI command via Bash tool
- Historical thread timelines retain `mcp__base__entity_create` references for backward compatibility
