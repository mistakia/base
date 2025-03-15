# Human-in-the-Loop Agent System Design

## 1. System Overview

The system is designed to create a collaborative environment where AI agents and humans work together on tasks and knowledge management. It follows these key principles:

- **Version Control for Everything**: All data changes (prompts, tasks, guidelines, etc.) are tracked with git
- **Pull Request Model**: Agents propose changes rather than directly implementing them
- **Data-Centric Architecture**: All system elements are treated as versioned, classified data
- **Activity-Based Organization**: Actions are classified by activity types for better context management
- **Multi-Model Support**: Different models can process the same inference requests
- **Self-Improvement**: System can recursively work on improving its own components
- **Guidelines-Driven**: Activities follow established guidelines that evolve over time
- **Access Control**: Tools have configurable permissions based on sensitivity
- **Async Collaboration**: Support for asynchronous human-agent interaction

## 2. Core Components

The system is organized into a modular directory structure with clear separation of concerns. See [Directory Structure](./directory-structure.md) for the complete organization.

### 2.1 Core Engine

#### Model Context Protocol (MCP) Handler
```
└── libs-server/mcp_handler/
    ├── protocol.mjs          # Core MCP implementation
    ├── resources.mjs         # Resource management
    ├── prompts.mjs           # Prompt template management with version control
    ├── tools.mjs             # Tool registration and access control
    ├── sampling.mjs          # Controls for model output sampling
    ├── model_router.mjs      # Routes inference requests to appropriate models
    └── context_manager.mjs   # Manages context for inference requests
```

#### Agent System
```
└── libs-server/agents/
    ├── agent_manager.mjs     # Manages agent lifecycle and scheduling
    ├── agent_registry.mjs    # Stores agent configurations
    ├── event_system.mjs      # Event triggers for agent activation
    ├── scheduler.mjs         # Time-based agent execution
    ├── improvement_agent.mjs # Specialized for self-improvement tasks
    └── types/
        ├── base_agent.mjs    # Abstract agent class
        ├── task_agent.mjs    # Specialized for task management
        └── knowledge_agent.mjs # Specialized for knowledge operations
```

### 2.2 Data Layer

#### Version Control System
```
└── libs-server/vcs/
    ├── git_manager.mjs       # Git operations wrapper
    ├── diff_generator.mjs    # Creates human-readable diffs
    ├── change_request.mjs    # PR-like structure for proposed changes
    ├── change_reviewer.mjs   # Handles review/approval workflow
    └── data_versioning.mjs   # Manages versioning for all system data
```

#### Data Management
```
└── libs-server/data/
    ├── data_manager.mjs      # Core data operations
    ├── data_classifier.mjs   # Classifies data by type and activity
    ├── data_schema.mjs       # Data models and validation
    ├── data_indexer.mjs      # Indexes data for efficient retrieval
    └── data_access.mjs       # Controls data access patterns
```

#### Activity System
```
└── libs-server/activities/
    ├── activity_registry.mjs # Stores activity definitions
    ├── activity_matcher.mjs  # Matches inference requests to activities
    ├── guideline_manager.mjs # Manages guidelines for activities
    ├── activity_tracker.mjs  # Tracks activity performance metrics
    └── activity_improver.mjs # Suggests improvements to activities
```

#### Task Management
```
└── libs-server/tasks/
    ├── task_manager.mjs      # Core task operations
    ├── task_schema.mjs       # Task data model
    ├── dependency_tracker.mjs # Manages task dependencies
    ├── assignment.mjs        # Handles task assignments
    ├── label_manager.mjs     # Manages task labels and categorization
    └── task_improver.mjs     # Identifies task improvement opportunities
```

### 2.3 Human Interaction Layer

#### Interaction Manager
```
└── libs-server/human_interaction/
    ├── interaction_manager.mjs  # Orchestrates human-agent interactions
    ├── notification_system.mjs  # Alerts for human attention
    ├── approval_workflow.mjs    # Handles approval processes
    ├── feedback_collector.mjs   # Collects human feedback for improvement
    └── async_communication.mjs  # Manages async message exchanges
```

#### Access Control
```
└── libs-server/access_control/
    ├── permission_manager.mjs   # Manages tool permissions
    ├── human_confirmation.mjs   # Handles confirmation workflows
    └── audit_logger.mjs         # Logs all sensitive operations
```

### 2.4 Inference Layer

#### Inference Management
```
└── libs-server/inference/
    ├── inference_manager.mjs    # Manages inference requests
    ├── model_registry.mjs       # Registers available models
    ├── request_router.mjs       # Routes requests to appropriate models
    ├── result_comparator.mjs    # Compares results from different models
    ├── result_evaluator.mjs     # Evaluates quality of inference results
    └── inference_optimizer.mjs  # Optimizes inference requests
```

## 3. Data Models

### 3.1 Agent Schema
```javascript
{
  agent_id: 'string', // Unique identifier
  name: 'string', // Human-readable name
  description: 'string', // Purpose description
  mcp_config: {
    resources: [], // Array of resource IDs
    prompts: [], // Array of prompt template IDs
    tools: [], // Array of tool IDs with permission levels
    sampling: {}, // Model sampling parameters
    context: {} // Context management configuration
  },
  supported_activities: [], // Activities this agent can perform
  triggers: [
    {
      type: 'string', // 'event', 'schedule', or 'activity'
      config: {} // Trigger-specific configuration
    }
  ],
  improvement_goals: [], // Areas where agent seeks to improve
  status: 'string', // 'active', 'inactive', 'error'
  created_at: 'timestamp',
  updated_at: 'timestamp',
  version: 'string' // Git version identifier
}
```

### 3.2 Task Schema
```javascript
{
  task_id: 'string', // Unique identifier
  title: 'string', // Task title
  description: 'string', // Task details
  status: 'string', // 'todo', 'in_progress', 'review', 'done'
  priority: 'number', // 1-5 priority level
  labels: [], // Array of string labels for categorization
  activities: [], // Associated activities
  parent_id: 'string', // Optional parent task
  child_ids: [], // Array of child task IDs
  depends_on: [], // Array of blocker task IDs
  dependents: [], // Array of dependent task IDs
  assignee: {
    type: 'string', // 'agent' or 'human'
    id: 'string' // ID of the assignee
  },
  improvement_notes: [], // Notes on how task could be improved
  blockers: [], // Current blockers preventing completion
  created_at: 'timestamp',
  updated_at: 'timestamp',
  due_date: 'timestamp',
  version: 'string' // Git version identifier
}
```

### 3.3 Activity Schema
```javascript
{
  activity_id: 'string', // Unique identifier
  name: 'string', // Human-readable name
  description: 'string', // Purpose description
  guidelines: [], // IDs of associated guidelines
  related_data_types: [], // Types of data associated with this activity
  related_activities: [], // IDs of related activities
  suggested_models: [], // Models recommended for this activity
  improvement_metrics: [], // Metrics to track for improvement
  created_at: 'timestamp',
  updated_at: 'timestamp',
  version: 'string' // Git version identifier
}
```

### 3.4 Guideline Schema
```javascript
{
  guideline_id: 'string', // Unique identifier
  title: 'string', // Guideline title
  description: 'string', // Detailed description
  content: 'string', // The actual guideline content using RFC 2119 keywords
  activities: [], // Activities this guideline applies to
  priority: 'string', // 'MUST', 'SHOULD', 'MAY' etc. (RFC 2119)
  rationale: 'string', // Explanation of why this guideline exists
  examples: [], // Example applications of the guideline
  created_at: 'timestamp',
  updated_at: 'timestamp',
  version: 'string' // Git version identifier
}
```

### 3.5 Inference Request Schema
```javascript
{
  request_id: 'string', // Unique identifier
  prompt: 'string', // The prompt text
  activities: [], // Associated activities
  guidelines: [], // Guidelines to follow
  context_data: [], // Additional context data IDs
  models: [], // Models to use for inference
  evaluation_criteria: [], // How to evaluate the results
  created_at: 'timestamp',
  status: 'string', // 'pending', 'processing', 'completed', 'failed'
  results: [
    {
      model_id: 'string', // ID of the model used
      output: 'string', // Model output
      evaluation: {}, // Evaluation results
      selected: 'boolean' // Whether this was the selected result
    }
  ],
  version: 'string' // Git version identifier
}
```

### 3.6 Data Item Schema
```javascript
{
  data_id: 'string', // Unique identifier
  title: 'string', // Data title
  description: 'string', // Data description
  content_type: 'string', // MIME type or format
  content: 'any', // The actual data content
  classification: {
    type: 'string', // Type of data (prompt, guideline, task, etc.)
    activities: [], // Associated activities
    sensitivity: 'string' // Security classification
  },
  metadata: {}, // Additional metadata
  created_at: 'timestamp',
  updated_at: 'timestamp',
  version: 'string' // Git version identifier
}
```

## 4. Workflows

### 4.1 Inference Request Workflow
1. System receives an inference request
2. Activity matcher identifies relevant activities
3. Guideline manager collects applicable guidelines
4. Data manager gathers relevant context data
5. Request router sends request to appropriate models
6. Result comparator evaluates outputs from different models
7. Best result is selected and returned
8. Results are stored with version control
9. Improvement opportunities are identified

### 4.2 Activity-Based Task Workflow
1. Task is created and associated with activities
2. Relevant guidelines are attached based on activities
3. Task is assigned to human or agent
4. If assigned to agent, triggers agent activation
5. Agent processes task using appropriate activities and guidelines
6. Agent identifies potential blockers and improvement opportunities
7. Agent proposes task updates via change requests
8. Task status and properties updated through approval workflow

### 4.3 Self-Improvement Workflow
1. System continuously monitors performance metrics
2. Improvement agent identifies enhancement opportunities
3. Improvement tasks are created and prioritized
4. Agents propose improvements to prompts, guidelines, or data
5. Changes are submitted as change requests
6. Human reviews and approves/rejects/modifies
7. Approved changes are implemented and versioned
8. System evaluates impact of improvements

### 4.4 Change Request Workflow
1. Agent proposes changes via change request
2. Version control system generates diff
3. Human is notified of pending change
4. Human reviews and approves/rejects/modifies
5. On approval, changes are implemented to target systems
6. Change status is updated and logged
7. Git commit is created to version the change

## 5. Guidelines Implementation

Guidelines MUST follow RFC 2119 conventions for requirement levels:

- **MUST** (or **REQUIRED**): Absolute requirement
- **MUST NOT** (or **SHALL NOT**): Absolute prohibition
- **SHOULD** (or **RECOMMENDED**): Strong recommendation
- **SHOULD NOT** (or **NOT RECOMMENDED**): Strong discouragement
- **MAY** (or **OPTIONAL**): Optional item

Example guideline for "Email Writing" activity:

```
Guideline: Email Composition
Priority: SHOULD

Email subjects MUST be concise and descriptive.
Email bodies SHOULD begin with a greeting.
Paragraphs SHOULD be limited to 3-5 sentences for readability.
Technical jargon SHOULD NOT be used unless the recipient is known to understand it.
Emails MAY include a signature with contact information.
```

## 6. Security and Access Control

### 6.1 Tool Permission Levels
- **Read-Only**: Can only read data, no modification
- **Propose-Only**: Can propose changes but requires approval
- **Auto-Approve-Low-Risk**: Can auto-approve changes deemed low-risk
- **Full-Access**: Can make changes without approval (restricted)

### 6.2 Human Confirmation Workflows
- Direct approval: Human explicitly approves each change
- Batch approval: Group of changes approved together
- Time-limited delegation: Auto-approve for a set period
- Risk-based approval: Higher risk = higher approval requirements

## 7. Glossary

### 7.1 Key Terms

- **Activity**: A classification of actions that share common patterns, guidelines, and data requirements (e.g., "writing an email", "creating a task").
- **Agent**: An AI entity configured to perform specific activities or tasks within the system.
- **Change Request**: A proposal for modifications to data or content that requires review and approval.
- **Data Item**: Any piece of information stored in the system, classified by type and associated activities.
- **Guideline**: A set of rules or recommendations associated with activities that MUST, SHOULD, or MAY be followed.
- **Inference Request**: The process of submitting a prompt to one or more AI models and receiving the generated outputs.
- **Model**: An AI system capable of processing inference requests and generating outputs.
- **Prompt**: A structured input provided to a model to guide its response generation.
- **Task**: A discrete unit of work that can be assigned, tracked, and completed within the system.
- **Tool**: A capability provided to agents that allows them to perform specific actions or access particular resources.
- **Trigger**: An event or condition that activates an agent to perform its designated function.
- **Version Control**: The system for tracking and managing changes to all data and content over time using git. 