---
title: MCP Server
type: text
description: Model Context Protocol server implementation with tool filtering capabilities
created_at: '2025-01-06T21:10:00.000Z'
entity_id: 'a8b9c0d1-e2f3-4567-8901-234567890abc'
observations:
  - '[architecture] Factory pattern enables tool filtering at server creation time'
  - '[security] Tool whitelisting prevents unauthorized access to system capabilities'
  - '[simplicity] Command line interface provides easy configuration without code changes'
relations:
  - relates_to [[sys:system/text/tool-information.md]]
  - relates_to [[sys:system/text/system-design.md]]
updated_at: '2025-01-06T21:10:00.000Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# MCP Server

Model Context Protocol server that exposes system tools to external agents with selective tool filtering.

## Design

Factory pattern creates server instances with tool filtering at instantiation time. This avoids runtime tool registry modifications and enables multiple servers with different capabilities.

**Tool Filtering**:

1. Whitelist provided during server creation
2. Tool registry returns filtered subset
3. Server capabilities reflect filtered tools only
4. Tool calls validate against allowed tools

**Whitelist Behavior**:

- No whitelist: all tools available
- Empty whitelist: no tools available
- Invalid tools: silently ignored

## Command Interface

Stdio script accepts tool filtering via command arguments without code modification. Arguments parsed before server creation to configure tool availability.
