---
title: Update Thread Metadata
type: workflow
description: >-
  Update metadata for a single thread by analyzing its content and applying appropriate title and
  description
base_uri: sys:system/workflow/update-thread-metadata.md
created_at: '2025-08-19T06:28:47.650Z'
entity_id: 7b089100-ef7f-4355-a38b-c207fc65b188
observations:
  - '[efficiency] Focused single-thread processing reduces token usage'
  - '[accuracy] Using analyze-thread-for-metadata workflow ensures consistent analysis'
  - '[simplicity] Direct CLI integration for updates'
prompt_properties:
  - name: thread_id
    type: string
    description: UUID of the thread to update
    required: true
  - name: dry_run
    type: boolean
    description: Whether to show changes without applying them
    default: false
relations:
  - uses [[sys:system/workflow/analyze-thread-for-metadata.md]]
  - uses [[sys:system/workflow/read-thread.md]]
  - follows [[sys:system/guideline/review-thread.md]]
  - follows [[sys:system/guideline/starting-point-philosophy.md]]
tools:
  - read
  - bash
  - task
updated_at: '2026-01-05T19:25:17.455Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Update Thread Metadata

<task>
Update metadata (title and short_description) for a single thread by analyzing its content and applying appropriate updates.
</task>

<context>
This workflow is designed for batch processing of individual threads. It analyzes a thread's content and updates its metadata using the CLI tools directly. The workflow uses efficient timeline processing to minimize token usage.

CLI tool location: `repository/active/base/libs-server/threads/update-thread.mjs`

Thread structure:

- Location: `$USER_BASE_DIRECTORY/thread/[thread_id]/`
- Files: metadata.json (current state), timeline.jsonl (event history, JSONL format)
- Key fields to update: title, short_description

For thread extraction commands, see [[sys:system/workflow/read-thread.md]].
</context>

<instructions>
1. **Analyze Thread**
   - Use Task tool to delegate to @workflow/analyze-thread-for-metadata.md
   - Provide thread_id and timeline_config with strategy: "recent" and limit: 50
   - Receive metadata suggestions from the analysis

2. **Review Suggestions**

   - Verify title is concise and under 100 characters
   - Ensure short_description is under 200 characters
   - Check that suggestions follow thread review guideline

3. **Apply Updates** (if not dry_run)

   - Use the update-thread.mjs CLI tool to apply metadata changes
   - Command format:
     ```bash
     cd repository/active/base && \
     node libs-server/threads/update-thread.mjs \
       --thread_id "[thread_id]" \
       --title "[new_title]" \
       --short_description "[new_description]"
     ```

4. **Return Results**
   - Format response as JSON for machine parsing
   - Include status and details of changes made or proposed
     </instructions>

<output_format>
Return a JSON object with the following structure:

```json
{
  "thread_id": "[thread_id]",
  "status": "success|error|no_changes",
  "current_metadata": {
    "title": "[existing title or null]",
    "short_description": "[existing description or null]"
  },
  "updates": {
    "title": "[new title if updated]",
    "short_description": "[new description if updated]"
  },
  "message": "[Brief status message]",
  "dry_run": [true|false]
}
```

Status meanings:

- **success**: Metadata was successfully updated
- **no_changes**: Thread already has adequate metadata
- **error**: An error occurred during processing
  </output_format>
