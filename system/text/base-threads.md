---
title: Base Threads
type: text
description: Defines the execution model using Base Threads (formerly Worker Threads) for handling objectives within the system.
tags: [architecture, execution-model, threads, documentation]
observations:
  - '[design] Threads manage execution through distinct stages #workflow'
  - '[design] Threads support human interaction via blocking/non-blocking requests #collaboration'
  - '[architecture] Threads utilize a tiered memory system (Universal and Context) #memory'
  - '[design] Each thread is associated with a specific activity #organization'
relations:
  - 'relates_to [[system/text/system-design]]'
---

# Execution Model: Base Threads

The system utilizes Base Threads to execute objectives, such as completing Tasks or handling system events.

## Base Thread Definition

A **Base Thread** is an execution process responsible for accomplishing a defined objective. It manages its own internal workflow through distinct stages and can interact with humans when necessary. Threads are typically transient, existing only for the duration of their objective.

**Key Properties:**

- `thread_id`: Unique identifier for the thread instance. Also implicitly defines the path to its context memory (`user/threads/{thread_id}/`).
- `user_id`: Identifier of the user who owns the thread.
- `activity_base_relative_path`: Reference to the specific activity this thread is associated with and executing. (e.g., `system/activity/create-activity.md` or `user/activity/custom-activity.md`).
- `inference_provider`: Name of the AI provider being used (e.g., 'ollama').
- `model`: The specific model to use from the provider.
- `state`: The current lifecycle state:
  - `Active`: The thread is currently processing its objective.
  - `Paused`: The thread is temporarily halted, usually awaiting external input.
  - `Terminated`: The thread has finished its work (successfully or unsuccessfully) and ceased execution.
- `current_stage`: The current internal stage within the `Active` state (see below).
- `created_at`: Timestamp of initiation.
- `updated_at`: Timestamp of last update.
- `terminated_at`: Timestamp of termination (if applicable).
- `tools`: Array of tools available to this thread.
- `thread_change_request_id`: Reference to the change request that tracks all changes made in the thread's branch.

**Note:** The thread's "role" as presented in prompts or user interfaces is always derived from its assigned `activity`. The `activity_base_relative_path` is the canonical reference for the thread's objective and specialization. The term "role" is never used as a separate identifier in backend or schema logic.

## Thread Creation Process

When a new thread is created:

1. A unique `thread_id` is generated (UUID)
2. Directory structure is created at `user/threads/{thread_id}/`
3. Thread metadata is written to `metadata.json` file
4. Timeline is initialized in `timeline.json`
5. Memory directory is set up with a git repository
6. Git branches are created in both system and user knowledge bases with the format `thread/{thread_id}`
7. A default change request is created to track changes made in the thread branch relative to main
8. The thread is associated with a specific activity that it will execute

## Base Thread Stages (within `Active` State)

Base threads progress through these stages while active:

1.  **Research:** Gathering necessary information and context (reading Universal Memory, analyzing requirements, querying sources).
2.  **Plan:** Devising a sequence of steps to achieve the objective.
3.  **Act:** Executing the planned steps (using Tools, making Inference Requests, manipulating data).
4.  **Review / Verification:** Checking the results against requirements, potentially looping back to Plan or Act.
5.  **Complete:** Finalizing work, formatting outputs, preparing for termination.

_Note: Not all objectives might require all stages, or stages might be iterative._

## Human Interaction (`human_request`)

When a Base Thread requires human input or confirmation:

- **Concept:** A `human_request` object is created to manage the interaction.
- **Properties:** Includes `request_id`, `thread_id`, the `prompt` for the human, `type` (`Blocking` or `NonBlocking`), `status` (`Pending`, `Responded`, `Cancelled`), and the `response`.
- **Workflow:**
  - **Blocking:** The thread enters the `Paused` state until the request is `Responded` or `Cancelled`.
  - **Non-Blocking:** The thread remains `Active`, continuing work that doesn't depend on the response, and incorporates the response asynchronously when available.
- **Notification:** An external mechanism notifies the user and captures their response.

## Memory Structure

Base Threads utilize a tiered memory system:

1.  **Universal Memory (Knowledge Base):**

    - **Purpose:** System-wide, persistent knowledge, guidelines, schemas.
    - **Location:** `system/` and `user/` directories (Markdown files, version controlled).

2.  **Context Memory (Thread Context):**
    - **Purpose:** Persistent storage associated directly with a `thread_id`. Holds the necessary state for pause/resume, intermediate results, `human_request` objects, final outputs, a detailed execution history, and working files.
    - **Location:** Disk-based, deterministic path: `user/thread_context/{thread_id}/`.
    - **Git Repository:** Each thread's memory directory is initialized as a git repository with an initial commit containing a `.gitignore` file.

## Timeline Structure

Threads maintain a chronological timeline of interactions and events, structured as entries of different types:

- **MessageEntry:** User or assistant messages in the conversation
- **ToolCallEntry:** Requests by the assistant to invoke tools
- **ToolResultEntry:** Results from tool executions
- **ErrorEntry:** Error events that occurred during execution
- **StateChangeEntry:** Records of thread state transitions

Timeline entries are immutable and provide a complete audit trail of thread activities, enabling seamless resumption after pauses and comprehensive post-execution analysis.

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

## Thread Change Request

Each Base Thread automatically creates a thread change request as part of its initialization:

- **Purpose:** Tracks all changes made in the thread's branch relative to the main branch
- **Format:** Stored as a regular change request with a reference to the originating thread
- **Properties:**
  - `title`: Defaults to `Thread {thread_id} changes`
  - `description`: Describes that it contains changes made in the thread branch
  - `target_branch`: Main branch (typically 'main')
  - `feature_branch`: The thread's branch (`thread/{thread_id}`)
  - `thread_id`: Reference to the originating thread
  - `tags`: Includes 'thread-changes' and 'auto-generated' to indicate its purpose
- **Storage:** Indexed in the database and stored as a Markdown file like other change requests
- **Workflow:**
  - Created automatically during thread initialization
  - Referenced in thread metadata via `thread_change_request_id`
  - Can be used to review, approve, and merge thread-specific changes back to main

## Tool Calling

Base Threads support tool calling capabilities, allowing them to interact with system functionalities:

- **Tool Definition:** Tools are defined with schemas detailing parameters and return types
- **Invocation Flow:**
  1. Assistant generates a tool call request with parameters
  2. System executes the tool with the provided parameters
  3. Tool results are returned to the thread for processing
- **Execution Models:**
  - **Synchronous:** Thread waits for tool execution to complete
  - **Asynchronous:** Thread continues processing while tool executes

## Filesystem Structure

Each thread's context is stored in a dedicated directory structure within the user's `user/` directory:

```
user/
  thread_context/
    {thread_id}/
      metadata.json     # Thread metadata (state, inference_provider, model, etc.)
      timeline.json     # Consolidated chronological timeline of all thread activity
      memory/           # Thread-specific memory & working files (git subdirectory)
        .gitignore      # Configured to ignore temporary and binary files
```

The `metadata.json` file contains the thread's configuration and state, including:

- Basic thread properties (`thread_id`, `user_id`, `activity_base_relative_path`, etc.)
- Current execution state and stage
- Timestamps for thread lifecycle events
- Reference to associated change request

The `timeline.json` file contains an array of entries with a consistent structure:

- `id`: Unique identifier for the entry
- `timestamp`: When the entry was created
- `type`: Type of entry (message, tool_call, tool_result, state_change, etc.)
- `content`: The actual content of the entry

This filesystem structure enables persistent storage, versioning, and inspection of thread state, supporting both runtime operations and post-execution analysis.
