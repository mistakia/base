---
title: Base Threads
type: text
description: Defines the execution model using Base Threads (formerly Worker Threads) for handling objectives within the system.
tags: [architecture, execution-model, threads, documentation]
observations:
  - '[design] Threads manage execution through distinct stages #workflow'
  - '[design] Threads support human interaction via blocking/non-blocking requests #collaboration'
  - '[architecture] Threads utilize a tiered memory system (Universal and Context) #memory'
relations:
  - 'relates_to [[System Design]]'
  - 'part_of [[Documentation]]'
---

# Execution Model: Base Threads

The system utilizes Base Threads to execute objectives, such as completing Tasks or handling system events.

## Base Thread Definition

A **Base Thread** is an execution process responsible for accomplishing a defined objective. It manages its own internal workflow through distinct stages and can interact with humans when necessary. Threads are typically transient, existing only for the duration of their objective.

**Key Properties:**

- `thread_id`: Unique identifier for the thread instance. Also implicitly defines the path to its context memory (`data/thread_context/{thread_id}/`).
- `state`: The current lifecycle state:
  - `Active`: The thread is currently processing its objective.
  - `Paused`: The thread is temporarily halted, usually awaiting external input.
  - `Terminated`: The thread has finished its work (successfully or unsuccessfully) and ceased execution.
- `current_stage`: The current internal stage within the `Active` state (see below).
- `created_at`: Timestamp of initiation.
- `terminated_at`: Timestamp of termination (if applicable).

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
    - **Location:** `system/` and `data/` directories (Markdown files, version controlled).
    - **Access:** Read-mostly by threads. Writes require Change Requests.

2.  **Context Memory (Thread Context):**
    - **Purpose:** Persistent storage associated directly with a `thread_id`. Holds the necessary state for pause/resume, intermediate results, `human_request` objects, final outputs, and a detailed execution history.
    - **Location:** Disk-based, deterministic path: `data/thread_context/{thread_id}/`.
    - **Access:** Read/Write access for the associated thread while `Active` or `Paused`.

## Timeline Structure

Threads maintain a chronological timeline of interactions and events, structured as entries of different types:

- **MessageEntry:** User or assistant messages in the conversation
- **ToolCallEntry:** Requests by the assistant to invoke tools
- **ToolResultEntry:** Results from tool executions
- **ErrorEntry:** Error events that occurred during execution
- **StateChangeEntry:** Records of thread state transitions

Timeline entries are immutable and provide a complete audit trail of thread activities, enabling seamless resumption after pauses and comprehensive post-execution analysis.

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

Each thread's context is stored in a dedicated directory structure:

```
data/
  thread_context/
    {thread_id}/
      metadata.json     # Thread metadata (state, inference_provider, model, etc.)
      timeline.json     # Consolidated chronological timeline of all thread activity
      memory/           # Thread-specific memory storage
```

The `timeline.json` file contains an array of entries with a consistent structure:

- `id`: Unique identifier for the entry
- `timestamp`: When the entry was created
- `type`: Type of entry (message, tool_call, tool_result, state_change, etc.)
- `content`: The actual content of the entry

This filesystem structure enables persistent storage, versioning, and inspection of thread state, supporting both runtime operations and post-execution analysis.
