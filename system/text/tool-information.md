---
title: Tool Information
type: text
description: Documentation on tools, their registration model, and usage within the system.
base_uri: sys:system/text/tool-information.md
created_at: '2025-06-04T15:45:43.273Z'
entity_id: 64198ad4-c77b-42d5-813a-e26605bcada4
observations:
  - '[design] Documents tool registration and execution model.'
  - '[architecture] Defines three distinct tool categories with different purposes.'
public_read: true
relations:
  - relates_to [[sys:system/text/system-design.md]]
updated_at: '2026-01-05T19:25:18.075Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:38:32.259Z'
---

# Tool Information

This document outlines the tool architecture, registration system, and available tool categories within the system.

## Tool Definition

A tool is a capability provided to execution contexts (threads executing workflows, MCP clients) that allows them to perform specific actions or access resources. Tools are registered through a centralized registry system that manages tool definitions, implementations, and execution.

## Tool Architecture

The system uses a centralized tool registry (`libs-server/tools/registry.mjs`) that maintains tool definitions and implementations. All tools register themselves with this central registry, enabling consistent access across different execution contexts.

### Tool Registration Process

1. **Definition**: Tools define their schema including description, input parameters, and execution behavior
2. **Registration**: Tools register with the central registry using `register_tool()`
3. **Access**: Execution contexts access tools through registry functions like `get_tool()` and `execute_tool()`

### Tool Execution Properties

Each tool defines whether it stops execution through the `stops_execution` property:

- `stops_execution: true` - Tool pauses thread execution (blocking)
- `stops_execution: false` - Tool executes without pausing thread (non-blocking)

## Tool Categories

### Universal Tools

Universal tools are available to all threads and provide core system functionality. These tools are automatically registered when the system starts.

**Entity Tools**:

- `base entity create` - Create new entities (CLI command via Bash tool)

### Workflow-Defined Tools

Workflows can define custom tools that are registered dynamically when a thread begins executing the workflow. These tools serve as completion signals for workflow execution.

**Registration Process**:

1. Workflow defines tools in `tool_definition` property
2. `register_workflow_tools()` reads workflow and registers custom tools
3. Tools become available to the thread executing the workflow
4. Tool execution signals workflow completion

**Tool Implementation**:

- Custom tools return their parameters as the result
- All workflow-defined tools default to `stops_execution: true`
- Tool execution marks workflow as complete

### Thread Tools

Thread tools manage thread execution state and user communication. These tools control thread lifecycle and enable interaction patterns.

**Execution Control**:

- `archive_thread` - Archive thread execution and mark it as complete or abandoned
- `pause_execution` - Pause thread until manual resumption

**User Communication**:

- `message_notify` - Send non-blocking notifications to user
- `message_ask` - Ask user questions and wait for response (blocking)

**State Management**:

- Thread tools update thread state through `update_thread_state()`
- Timeline entries track tool usage and state changes
- Worktree cleanup occurs on thread archival

## Integration Points

### Model Context Protocol (MCP)

The Base-specific MCP server layer has been removed. Third-party MCP servers (PostgreSQL, GraphQL, browser automation, etc.) configured in `.mcp.json` continue to work independently. See [[sys:system/text/mcp-server.md]] for migration details.

### Thread Execution

Threads access tools through the registry and handle tool execution results based on the `stops_execution` property. Blocking tools pause thread execution while non-blocking tools continue execution flow.

### Thread-Workflow Execution

Threads execute workflows by first registering the workflow's custom tools, then running the workflow logic. Custom tool calls signal workflow completion. The thread execution system manages workflow tool registration and cleanup.

## Permissions and Access Control

Tool access is governed by the identity and permission system. Each identity entity can specify allowed and disallowed tools via `thread_config.tools` (allowlist) and `thread_config.disallowed_tools` (denylist patterns). See [[sys:system/text/identity-and-authentication.md]] for the full permission model.
