---
title: 'Execution Threads'
type: 'text'
description: |
  Defines the execution model using Threads for handling objectives within the system.
created_at: '2025-05-27T18:10:20.241Z'
entity_id: '576c86bd-3ff4-4d88-b246-f168f3f11700'
observations:
  - '[design] Threads are the execution environment for workflows and execute exactly one workflow'
  - '[design] Threads support human interaction via blocking/non-blocking requests'
  - '[architecture] Threads utilize a tiered memory system (Universal and Context)'
relations:
  - 'relates_to [[system/text/system-design.md]]'
  - 'relates_to [[system/text/workflow.md]]'
tags:
updated_at: '2025-05-27T18:10:20.242Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# Execution Threads

Execution threads execute objectives such as completing tasks or handling system events.

## Definition

An **Execution Thread** is a process responsible for accomplishing a defined objective. It manages its workflow through stages and interacts with humans when necessary. Threads coordinate with each other, leveraging specialized workflows to achieve goals.

## Properties

- `thread_id`: Unique identifier for the thread instance. Also implicitly defines the path to its context memory (`user/threads/{thread_id}/`).
- `user_id`: Identifier of the user who owns the thread.
- `workflow_base_relative_path`: Reference to the specific workflow this thread is associated with and executing. (e.g., `system/workflow/write-workflow.md` or `user/workflow/custom-workflow.md`).
- `inference_provider`: Name of the AI provider being used (e.g., 'ollama').
- `model`: The specific model to use from the provider.
- `thread_state`: The current lifecycle state:
  - `Active`: The thread is currently processing its objective.
  - `Paused`: The thread is temporarily halted, usually awaiting external input.
  - `Terminated`: The thread has finished its work (successfully or unsuccessfully) and ceased execution.
- `created_at`: Timestamp of initiation.
- `updated_at`: Timestamp of last update.
- `terminated_at`: Timestamp of termination (if applicable).
- `tools`: Array of tools available to this thread.
- `thread_change_request_id`: Reference to the change request that tracks all changes made in the thread's branch.

**Note:** The thread's "role" in prompts or UI is derived from its assigned `workflow`. The `workflow_path` is the canonical reference for the thread's objective. The term "role" is never used as an identifier in backend or schema logic.

When a new thread is created:

1. A unique `thread_id` is generated (UUID)
2. Directory structure is created at `user/threads/{thread_id}/`
3. Thread metadata is written to `metadata.json` file
4. Timeline is initialized in `timeline.json`
5. Memory directory is set up with a git repository
6. Git branches are created in both system and user knowledge bases with the format `thread/{thread_id}`
7. A default change request is created to track changes made in the thread branch relative to main
8. The thread is associated with a specific workflow that it will execute

## States

- `active`: Operational
- `paused`: Temporarily suspended, awaiting action
- `terminated`: Successfully completed or terminated

## Key Functions

- **Tool Calling**: Use system tools to interact with resources
- **Timeline Tracking**: Maintain chronological record of activity
- **Context Management**: Dynamically manage context window
- **Knowledge Retrieval**: Search and access relevant knowledge
- **User Interaction**: Communicate with users for input
- **Change Request Creation**: Propose knowledge base changes

## Tool Calling

Execution Threads support tool calling capabilities, allowing them to interact with resources and perform actions:

- tools are defined with schemas detailing parameters and return types
- **Invocation Flow:**
  1. Workflow generates a tool call request with parameters
  2. System executes the tool with the provided parameters
  3. Tool results are returned to the thread for processing
- **Execution Models:**
  - **Synchronous:** Thread waits for tool execution to complete
  - **Asynchronous:** Thread continues processing while tool executes

## Timeline Structure

Threads maintain a chronological timeline of interactions and events, structured as entries of different types:

- **MessageEntry:** User or workflow generated messages
- **ToolCallEntry:** Requests by the workflow to invoke tools
- **ToolResultEntry:** Results from tool executions
- **ErrorEntry:** Error events that occurred during execution
- **StateChangeEntry:** Records of thread state transitions

Timeline entries are immutable and provide a complete audit trail of thread actions, events, and state changes, enabling seamless resumption after pauses and comprehensive post-execution analysis.

## Memory Structure

Execution Threads utilize a tiered memory system:

1. **Transient Context Memory**: Information held in context window during execution.

2. **Persistent Working Memory**: Stored in the thread's memory directory:
   - **Scratch Space**: Temporary files and computational data
   - **Knowledge Cache**: Frequently accessed information
   - **Reasoning Artifacts**: Intermediate outputs and processing results

3. **Long-term Memory**:
   - **Universal Memory (Knowledge Base):**
     - **Purpose:** System-wide, persistent knowledge, guidelines, schemas.
     - **Location:** `system/` and `user/` directories (Markdown files, version controlled).
   
   - **Persistent Working Memory:**
     - **Purpose:** Persistent storage associated directly with a `thread_id`. Holds the necessary state for pause/resume, intermediate results, `human_request` objects, final outputs, a detailed execution history, and working files.
     - **Location:** Disk-based, deterministic path: `user/thread_context/{thread_id}/`.
     - **Git Repository:** Each thread's memory directory is initialized as a git repository with an initial commit containing a `.gitignore` file.
   
   - **External Memory:** Accessed via knowledge base lookups, file system operations, and external tool calls.

## Human Interaction (`human_request`)

When an Execution Thread requires human input or confirmation:

- **Concept:** A `human_request` is created to manage the interaction.
- **Properties:** Includes `request_id`, `thread_id`, the `prompt` for the human, `type` (`Blocking` or `NonBlocking`), `status` (`Pending`, `Responded`, `Cancelled`), and the `response`.
- **Workflow:**
  - **Blocking:** The thread enters the `Paused` state until the request is `Responded` or `Cancelled`.
  - **Non-Blocking:** The thread remains `Active`, continuing work that doesn't depend on the response, and incorporates the response asynchronously when available.
- **Notification:** An external mechanism notifies the user and captures their response.

## Thread Change Request

Each thread creates a change request at initialization to:

- Capture and review changes made during execution
- Track modifications in thread metadata

- **Properties:**
  - `title`: Defaults to `Thread {thread_id} changes`
  - `description`: Describes that it contains changes made in the thread branch
  - `target_branch`: Main branch (typically 'main')
  - `feature_branch`: The thread's branch (`thread/{thread_id}`)
  - `thread_id`: Reference to the originating thread
- **Storage:** Indexed in the database and stored as a Markdown file like other change requests

## Git Branch Structure

For source control operations, each thread uses dedicated Git branches:

- **Format:** `thread/{thread_id}`
- **Repositories:** Created in both system and user knowledge base repositories
- **Purpose:** Isolates file modifications associated with specific threads
- **Workflow:**
  - Thread-specific file operations are performed within the thread's branch
  - Changes can be reviewed, merged, or discarded based on thread outcomes
  - Maintains separation between concurrent thread activities
- **Creation:** Branches are automatically created during thread initialization

## Filesystem Structure

Each thread's context is stored in a dedicated directory structure within the user's `user/` directory:

```
user/
  thread_context/
    {thread_id}/
      metadata.json     # Thread metadata (state, inference_provider, model, etc.)
      timeline.json     # Consolidated chronological timeline of all thread events and state changes
      memory/           # Thread-specific memory & working files (git subdirectory)
        .gitignore      # Configured to ignore temporary and binary files
```

The `metadata.json` file contains the thread's configuration and state, including:

- Basic thread properties (`thread_id`, `user_id`, `workflow_base_relative_path`, etc.)
- Current execution thread_state
- Timestamps for thread lifecycle events
- Reference to associated change request

The `timeline.json` file contains an array of entries with a consistent structure:

- `id`: Unique identifier for the entry
- `timestamp`: When the entry was created
- `type`: Type of entry (message, tool_call, tool_result, state_change, etc.)
- `content`: The actual content of the entry
This filesystem structure enables persistent storage, versioning, and inspection of thread state, supporting both runtime operations and post-execution analysis.

