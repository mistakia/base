---
title: Analyze and Update Thread
type: workflow
description: Analyze a single thread and update its metadata
base_uri: sys:system/workflow/analyze-and-update-thread.md
created_at: '2025-08-20T12:00:00.000Z'
entity_id: 287fe69d-eff3-498d-a554-c4223ec1b0d1
observations:
  - '[focus] Single thread analysis ensures quality metadata'
  - '[efficiency] Recent timeline events provide best context'
  - '[simplicity] Direct CLI tool usage for updates'
prompt_properties:
  - name: thread_id
    type: string
    description: UUID of the thread to analyze
    required: true
  - name: mode
    type: string
    description: Analysis mode - 'initial' for user message only, 'full' for all events
    enum:
      - initial
      - full
    default: initial
  - name: dry_run
    type: boolean
    description: Show changes without applying them
    default: false
relations:
  - called_by [[sys:system/workflow/process-threads-missing-metadata.md]]
  - uses [[sys:system/workflow/read-thread.md]]
tools:
  - read
  - bash
updated_at: '2026-01-05T19:25:18.555Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Analyze and Update Thread

<task>
Analyze a single thread's content and update its missing title and description.
</task>

<context>
Each thread has metadata.json with current state and timeline.jsonll with execution history (JSONL format). Focus on recent events to generate concise, meaningful metadata.

For thread extraction commands, see [[sys:system/workflow/read-thread.md]].
</context>

<instructions>
1. **Read thread metadata**
   ```bash
   cat thread/[thread_id]/metadata.json
   ```
   - Check current title and short_description
   - If both exist and are non-empty, skip processing

2. **Analyze timeline based on mode**

   **Mode selection:**

   - `initial`: Extract only the first user message for quick analysis
   - `full`: Use comprehensive timeline analysis with size-based strategies

   **Initial mode** (fast, user message only):

   ```bash
   # Extract first substantive user message from timeline (skip warmup messages)
   jq -s '[.[] | select(.type == "message" and .role == "user")] | map(select(.content | ascii_downcase | test("^warmup$") | not)) | .[0] | {content, timestamp}' thread/[thread_id]/timeline.jsonl
   ```

   **Note**: Uses `jq -s` to slurp JSONL into array. Filters out standalone "warmup" messages and takes first substantive message.

   **Full mode** (comprehensive analysis):

   **Size-based strategy selection:**

   ```bash
   # Check file size to determine approach
   file_size=$(stat -f%z thread/[thread_id]/timeline.jsonl)

   if [ $file_size -lt 10240 ]; then
     strategy="full"      # <10KB: Process entirely
   elif [ $file_size -lt 102400 ]; then
     strategy="recent"    # 10KB-100KB: Recent events
   elif [ $file_size -lt 1048576 ]; then
     strategy="slice"     # 100KB-1MB: Smart slicing
   else
     strategy="summarize" # >1MB: Statistical summary
   fi
   ```

   **Processing approaches:**

   **Full analysis** (<10KB files):

   ```bash
   jq -s 'map({type, timestamp, tool: .content.tool_name // null, status: .content.execution_status // null})' thread/[thread_id]/timeline.jsonl
   ```

   **Recent events** (10KB-100KB):

   ```bash
   tail -100 thread/[thread_id]/timeline.jsonl | jq -s '.[-50:] | map({type, timestamp, tool: .content.tool_name // null})'
   ```

   **Smart slicing** (100KB-1MB):

   ```bash
   # Focus on key event types for metadata generation
   jq -s '[.[] | select(.type == "message" or .type == "tool_call" or .type == "error")] | .[-30:] | map({type, timestamp, content: (.content | if type == "string" then .[0:200] + "..." else {tool_name: .tool_name // null} end)})' thread/[thread_id]/timeline.jsonl
   ```

   **Statistical summary** (>1MB):

   ```bash
   jq -s '{
     total_events: length,
     timespan: {start: .[0].timestamp, end: .[-1].timestamp},
     event_summary: ([.[] | .type] | group_by(.) | map({type: .[0], count: length})),
     primary_tools: ([.[] | select(.type == "tool_call") | .content.tool_name] | group_by(.) | map({tool: .[0], count: length}) | sort_by(-.count) | .[0:5]),
     error_count: ([.[] | select(.type == "error")] | length),
     recent_activity: (.[-10:] | map({type, timestamp}))
   }' thread/[thread_id]/timeline.jsonl
   ```

3. **Generate metadata from analysis**

   **Mode-specific generation strategies:**

   **Initial mode** (user message only):

   - Extract action verbs and key nouns from user message
   - Focus on original intent and request
   - Generate concise titles based on user's stated goal
   - Examples: "Fix login bug", "Add user dashboard", "Optimize database queries"

   **Full mode** (comprehensive analysis):

   - Use existing complex analysis patterns
   - Consider actual execution outcomes and tool usage
   - Generate titles based on what was accomplished vs. requested

   **Title generation guidelines:**

   - Action-oriented, under 100 characters
   - Format: "[Primary Action] [Target/Subject]"
   - **Initial mode**: Base on user's original request
   - **Full mode**: Base on dominant tool patterns and execution outcomes
   - Examples: "Implement user authentication", "Debug database connection", "Refactor component architecture"

   **Description generation guidelines:**

   - 1-2 sentences, under 200 characters
   - **Initial mode**: Summarize user's original request
   - **Full mode**: Summarize purpose and outcome based on timeline shape
   - Include key tools used if relevant (full mode only)
   - For error-heavy threads, mention debugging/troubleshooting (full mode only)

   **Analysis-to-metadata mapping:**

   **Initial mode:**

   - Extract key action words from user message
   - Focus on the "what" the user wanted to accomplish
   - Simple, direct titles based on request

   **Full mode:**

   - **High Edit/Write activity**: "Implement/Create/Build" titles
   - **High Read/Bash activity**: "Debug/Analyze/Investigate" titles
   - **High MultiEdit activity**: "Refactor/Update/Modify" titles
   - **Mixed tool usage**: Focus on thread's primary objective from early messages
   - **Error patterns**: Include troubleshooting context

4. **Token efficiency considerations**

   **Mode-specific token usage:**

   - **Initial mode**: ~100-500 tokens (single user message)
   - **Full mode**: Variable based on file size and strategy

   **Processing limits by strategy:**

   - **Initial**: Single message extraction, <500 tokens
   - **Full**: Process if <2,500 tokens (~10KB)
   - **Recent**: Limit to 50 events max (~12,500 tokens)
   - **Slice**: Compress content, focus on types, max 30 events
   - **Summary**: Statistical overview only, <1,000 tokens

   **Fallback handling:**

   - **Initial mode**: No fallback needed (always lightweight)
   - **Full mode**: If selected strategy exceeds token limits, step down to next approach
   - Always have summary as final fallback for full mode
   - Track processing metrics for optimization

5. **Apply update** (if not dry_run)

   ```bash
   cd repository/active/base && \
   node libs-server/threads/update-thread.mjs \
     --thread_id "[thread_id]" \
     --title "[title]" \
     --short_description "[description]"
   ```

6. **Return result**
   </instructions>

<output_format>

```json
{
  "thread_id": "[thread_id]",
  "mode": "[initial|full]",
  "status": "updated|skipped|failed",
  "current": {
    "title": "[existing or null]",
    "description": "[existing or null]"
  },
  "updates": {
    "title": "[new title]",
    "description": "[new description]"
  },
  "dry_run": [true|false]
}
```

</output_format>
