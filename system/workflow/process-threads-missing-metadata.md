---
title: Process Threads Missing Metadata
type: workflow
description: Find threads with missing metadata and delegate analysis to sub-agents
base_uri: sys:system/workflow/process-threads-missing-metadata.md
created_at: '2025-08-20T12:00:00.000Z'
entity_id: ae204013-b638-4b9f-b86e-6e3cbe344428
observations:
  - '[efficiency] Delegating to sub-agents reduces main context usage'
  - '[focus] Processing one thread per agent ensures quality analysis'
  - '[simplicity] Direct bash command for finding threads'
  - '[performance] Initial mode processes threads 10x faster than full mode'
  - '[flexibility] Mode selection allows balancing speed vs. analysis depth'
prompt_properties:
  - name: max_threads
    type: number
    description: Maximum number of threads to process
    default: 5
  - name: mode
    type: string
    description: Analysis mode to pass to child workflows
    enum:
      - initial
      - full
    default: initial
  - name: dry_run
    type: boolean
    description: Show changes without applying them
    default: false
relations:
  - calls [[sys:system/workflow/analyze-and-update-thread.md]]
  - uses [[sys:system/workflow/read-thread.md]]
tools:
  - bash
  - task
updated_at: '2026-01-05T19:25:17.452Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Process Threads Missing Metadata

<task>
Find threads missing title or description and delegate analysis to sub-agents for metadata updates.
</task>

<context>
Threads are stored in `$USER_BASE_DIRECTORY/thread/` with UUID directories containing metadata.json and timeline.jsonl files. This workflow identifies threads with missing metadata and assigns each to a sub-agent for focused analysis.

For thread extraction commands, see [[sys:system/workflow/read-thread.md]].
</context>

<instructions>
1. **Find threads with missing metadata**
   ```bash
   find thread -name metadata.json -exec sh -c 'jq -r "select(.title == null or .short_description == null or .title == \"\" or .short_description == \"\") | .thread_id // empty" "$1" 2>/dev/null' _ {} \;
   ```

2. **Limit processing**
   - Take first `max_threads` results
   - Stop if no threads found

3. **Delegate to sub-agents**
   - For each thread_id found (up to max_threads):
     - Launch analyze-and-update-thread via Task tool in parallel for all selected threads
     - Pass named arguments: thread_id, mode, dry_run
     - Collect results as tasks complete

4. **Report results**
   - Summarize all thread updates
   - List any failures
     </instructions>

<output_format>
Return summary of all processed threads:

```yaml
threads_found: [number]
threads_processed: [number]
mode: [initial|full]
results:
  - thread_id: [id]
    status: [updated|skipped|failed]
    title: [new title if updated]
    description: [new description if updated]
errors:
  - thread_id: [id]
    error: [message]
dry_run: [true|false]
```

</output_format>
