---
title: Tool Information
type: text
description: Documentation on tools, their registration model, and usage within the system.
created_at: '2025-06-04T15:45:43.273Z'
entity_id: 64198ad4-c77b-42d5-813a-e26605bcada4
observations:
  - '[design] Documents tool registration and execution model.'
  - '[architecture] Defines three distinct tool categories with different purposes.'
relations:
  - relates_to [[system/text/system-design.md]]
  - relates_to [[system/text/change-request-design.md]]
updated_at: '2025-06-04T15:45:43.273Z'
user_id: 00000000-0000-0000-0000-000000000000
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

**File Tools**:

- `file_read` - Read file contents
- `file_write` - Write content to files
- `file_list` - List directory contents
- `file_delete` - Delete files
- `file_diff` - Compare file differences
- `file_search` - Search files by path

**Task Tools**:

- `task_get` - Retrieve specific task details
- `task_create` - Create new tasks
- `task_update` - Update existing tasks
- `task_delete` - Delete tasks
- `list_tasks` - List tasks with filtering

**Entity Tools**:

- `entity_create` - Create new entities

**Notion Tools**:

- `notion_search` - Search Notion content
- `notion_list_databases` - List available databases
- `notion_get_page` - Retrieve page content
- `notion_get_database` - Get database structure
- `notion_query_database` - Query database records
- `notion_create_page` - Create new pages
- `notion_update_page` - Update existing pages
- `notion_get_block_children` - Get child blocks
- `notion_append_block_children` - Add child blocks

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

- `terminate_thread` - Terminate thread execution permanently
- `pause_execution` - Pause thread until manual resumption

**User Communication**:

- `message_notify` - Send non-blocking notifications to user
- `message_ask` - Ask user questions and wait for response (blocking)

**State Management**:

- Thread tools update thread state through `update_thread_state()`
- Timeline entries track tool usage and state changes
- Worktree cleanup occurs on thread termination

## Integration Points

### Model Context Protocol (MCP)

The MCP server exposes registered tools to external agents through standardized interfaces. Tools maintain consistent schemas across MCP and internal execution.

### Thread Execution

Threads access tools through the registry and handle tool execution results based on the `stops_execution` property. Blocking tools pause thread execution while non-blocking tools continue execution flow.

### Thread-Workflow Execution

Threads execute workflows by first registering the workflow's custom tools, then running the workflow logic. Custom tool calls signal workflow completion. The thread execution system manages workflow tool registration and cleanup.

## Permissions and Access Control

_[Placeholder - Tool permission system design in progress]_

The system will implement role-based access control for tools with different permission levels. Current implementation provides basic access through the centralized registry without granular permissions.
