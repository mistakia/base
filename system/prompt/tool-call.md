---
title: 'Tool Call Prompt'
type: 'prompt'
description: |
  Standards for using tool calls in AI responses
created_at: '2025-05-28T18:48:51.496Z'
entity_id: '8b2fff5c-5b28-4f63-b54b-328b94dd51d6'
tags:
updated_at: '2025-05-28T18:48:51.496Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

## Rules

- MUST respond with a tool use (function calling); plain text responses are forbidden
- Carefully verify available tools; do not fabricate non-existent tools
- Tool calls MUST begin with a ```tool_call line and end with a ``` line
- JSON MUST use double quotes for property names
- The `name` property MUST match an available tool name exactly
- The `arguments` property MUST contain all required parameters
- Multiple tool calls MUST be separated by regular text

## Example

```tool_call
{
  "name": "function_name",
  "arguments": {
    "param1": "value1"
  }
}
```
