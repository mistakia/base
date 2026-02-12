---
title: Analyze Thread for Metadata
type: workflow
description: Analyze individual thread timeline and metadata to generate title and description suggestions
base_uri: sys:system/workflow/analyze-thread-for-metadata.md
created_at: '2025-08-19T02:03:00.000Z'
entity_id: e131e9d8-44c8-43d3-9c72-6ab3d8e0b106
observations:
  - '[efficiency] Timeline slicing reduces token usage for large histories'
  - '[focus] Recent events usually provide best context for metadata'
  - '[accuracy] Combining metadata with timeline events improves suggestions'
prompt_properties:
  - name: thread_id
    type: string
    description: UUID of the thread to analyze
    required: true
  - name: timeline_config
    type: object
    description: Configuration for timeline processing
    properties:
      - name: strategy
        type: string
        description: Timeline slicing strategy
        enum:
          - recent
          - time_window
          - event_type
          - summary
        default: recent
      - name: limit
        type: number
        description: Maximum number of timeline events to process
        default: 50
      - name: time_window
        type: object
        description: Time window boundaries for time_window strategy
        properties:
          - name: start
            type: string
            description: Start of time window (ISO 8601 date-time)
          - name: end
            type: string
            description: End of time window (ISO 8601 date-time)
      - name: event_types
        type: array
        description: Event types to filter for event_type strategy
        items:
          type: string
relations:
  - follows [[sys:system/guideline/review-thread.md]]
  - follows [[sys:system/guideline/starting-point-philosophy.md]]
  - uses [[sys:system/workflow/read-thread.md]]
tags:
  - user:tag/base-project.md
tools:
  - read
  - bash
updated_at: '2026-01-05T19:25:18.901Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Analyze Thread for Metadata

<task>
Analyze a specific thread's metadata and timeline to generate appropriate title and description suggestions that follow established metadata requirements.
</task>

<context>
This workflow is designed to be called by agents with reduced context. It analyzes a single thread's data to suggest metadata improvements. Timeline files can be very large, so efficient processing strategies are essential.

For thread extraction commands, see [[sys:system/workflow/read-thread.md]].

Thread structure:

- Location: `/Users/trashman/user-base/thread/[thread_id]/`
- Files: metadata.json (current state), timeline.jsonl (event history, JSONL format)
- States: active, archived
- Key metadata fields: title, description, state, archive_reason
  </context>

<instructions>
1. **Load Thread Data**
   - Read metadata.json from thread directory
   - Validate thread exists and is accessible
   - Extract current title and description if present

2. **Process Timeline Efficiently**

   - Apply timeline_config.strategy:
     - **recent**: Load last N events (default 50)
     - **time_window**: Load events within specified date range
     - **event_type**: Load only specific event types
     - **summary**: Generate statistical summary without full events
   - For large timelines, use bash commands to slice data (see [[sys:system/workflow/read-thread.md]] for full reference):

     ```bash
     # Get last 50 events
     tail -50 timeline.jsonl

     # Get events by date range
     jq -s '[.[] | select(.timestamp >= "2024-01-01")]' timeline.jsonl

     # Count event types
     jq -s '[.[] | .type] | group_by(.) | map({type: .[0], count: length})' timeline.jsonl
     ```

3. **Analyze Thread Purpose**

   - Identify primary actions and outcomes from timeline
   - Look for patterns in tool usage and file operations
   - Determine if thread completed its objectives
   - Note any errors or abandoned states

4. **Generate Metadata Suggestions**

   - **Title**: Create action-oriented, specific title
     - Format: "[Action] [Object/Target] [Context if needed]"
     - Examples:
       - "Implement user authentication system"
       - "Debug production database connection issues"
       - "Create workflow for automated testing"
   - **Description**: Write 1-3 sentence summary including:
     - Primary purpose or problem being solved
     - Key outcomes or current status
     - Any notable decisions or blockers

5. **Validate Suggestions**

   - Ensure title is under 100 characters
   - Verify description provides meaningful context
   - Check that suggestions follow thread review guideline
   - Compare with existing metadata to ensure improvement

6. **Suggest Tags**

   - Delegate to suggest-thread-tags workflow using Task tool
   - Provide thread_id and analysis preferences
   - Collect tag recommendations for inclusion in metadata suggestions

7. **Estimate Token Usage**
   - Track tokens used in analysis
   - Report if timeline was truncated
   - Suggest alternative strategy if needed
     </instructions>

<output_format>
Return a structured analysis with metadata suggestions:

```yaml
thread_id: [thread_id]
current_metadata:
  title: [existing title or null]
  description: [existing description or null]
  state: [active|archived]
  last_updated: [timestamp]

timeline_analysis:
  events_processed: [number]
  total_events: [number]
  strategy_used: [strategy]
  primary_activities:
    - [activity type and count]
  key_files_accessed:
    - [file paths if relevant]
  completion_status: [completed|in_progress|abandoned|error]

suggested_metadata:
  title: '[Proposed title]'
  title_rationale: '[Why this title was chosen]'
  description: '[Proposed description]'
  description_rationale: '[Why this description was chosen]'
  tags:
    existing_tags_to_add: [array of tag URIs to add]
    tags_to_remove: [array of tag URIs to remove]
    new_tag_recommendations: [array of proposed new tags]

archive_recommendation:
  should_archive: [true|false]
  reason: [completed|user_abandoned|null]
  rationale: '[Why archival is recommended]'

token_usage:
  metadata_tokens: [number]
  timeline_tokens: [number]
  total: [number]

confidence: [high|medium|low]
notes: '[Any additional observations or concerns]'
```

</output_format>
