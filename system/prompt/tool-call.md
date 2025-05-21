---
title: Tool Call Prompt
type: prompt
description: Standards for using tool calls in AI responses
tags: []
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
