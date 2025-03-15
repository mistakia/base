# Human-in-the-Loop Agent System

This project implements a comprehensive system for human-agent collaboration, allowing for the effective integration of AI agents into workflows while maintaining human oversight and control.

## Core Features

- **Model Context Protocol (MCP)**: A flexible protocol for agent-model interactions with standardized resources, prompts, tools, and sampling parameters
- **Event-driven Architecture**: Agents can be triggered by events or scheduled to run at specific times
- **Pull Request Workflow**: Changes proposed by agents go through a human review process
- **Version Control**: All data is tracked with Git for full history and accountability
- **Multiple Data Sources**: Integration with file systems, Google Drive, Notion, and Apple Notes
- **Task Management**: Integration with GitHub Projects for task tracking with dependencies, hierarchy, and assignments
- **Human-Agent Interaction**: Rich interaction patterns including approvals, input requests, and asynchronous messaging
- **Access Controls**: Fine-grained permissions for agent tools and operations

## System Architecture

The system is organized into several key components:

1. **Core Engine**
   - MCP Handler
   - Agent System
   - Event System

2. **Data Layer**
   - Version Control System
   - Data Connectors
   - Task Management

3. **Human Interaction Layer**
   - Interaction Manager
   - Notification System
   - Access Control

For a detailed overview of the architecture, see [agent-system-design.md](agent-system-design.md).

## Getting Started

### Prerequisites

- Node.js 18+
- Git
- MySQL (for persistent storage)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/human-in-the-loop-agent-system.git
cd human-in-the-loop-agent-system
```

2. Install dependencies:
```bash
npm install
```

3. Configure the environment:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Set up the database:
```bash
npm run setup-db
```

5. Start the development server:
```bash
npm run dev
```

### Configuration

The system is configured through several files:

- `.env`: Environment variables
- `config.mjs`: Main configuration
- `conf/connectors/`: Connector-specific configurations
- `conf/agents/`: Agent definitions and configurations

## Usage Examples

### Creating a Simple Agent

```javascript
// Define an agent that monitors a directory for changes
import { BaseAgent } from './agents/types/base_agent.mjs';
import { task_manager } from './tasks/task_manager.mjs';

class FileMonitorAgent extends BaseAgent {
  constructor(config) {
    super({
      ...config,
      name: 'File Monitor Agent',
      description: 'Monitors directories for changes and creates tasks'
    });
  }
  
  async _build_context_from_event({ type, data }) {
    // Custom context building for file events
    const context = await super._build_context_from_event({ type, data });
    
    // Add additional file-specific context
    if (type === 'file_changed') {
      const file_content = await file_connector.read_file({
        resource_id: data.resource_id
      });
      
      context.file_content = file_content.content;
      context.file_metadata = file_content.metadata;
    }
    
    return context;
  }
}

// Register and activate the agent
const file_monitor = new FileMonitorAgent({
  agent_id: 'file-monitor-1',
  mcp_config: {
    resources: ['file_system_docs'],
    prompts: ['analyze_file_change'],
    tools: ['create_task', 'update_file'],
    sampling: { temperature: 0.2 },
    roots: ['file_monitor_instructions']
  },
  triggers: [
    {
      type: 'event',
      config: { event_type: 'file_changed', directory: 'workspace:/documents/' }
    }
  ]
});

file_monitor.activate();
```

### Creating a Task and Assigning it to an Agent

```javascript
import { task_manager } from './tasks/task_manager.mjs';

// Create a task
const task = await task_manager.create_task({
  title: 'Analyze quarterly reports',
  description: 'Review Q2 financial reports and summarize key findings',
  status: 'todo',
  priority: 2,
  labels: ['finance', 'quarterly-review'],
  assignee: {
    type: 'agent',
    id: 'financial-analyst-agent'
  },
  created_by: 'user-123',
  backend: 'github'
});

console.log(`Task created with ID: ${task.task_id}`);
```

### Requesting Human Approval

```javascript
import { interaction_manager } from './human_interaction/interaction_manager.mjs';

// Request approval for a change
const interaction_id = await interaction_manager.request_approval({
  title: 'Approve document update',
  description: 'Review and approve these changes to the quarterly report',
  data: {
    resource_id: 'workspace:/reports/q2-summary.md',
    changes: [
      {
        type: 'update',
        content: '# Q2 Financial Summary\n\nRevenue: $1.2M (up 15%)\nExpenses: $800K (up 5%)\n\n...'
      }
    ]
  },
  user_id: 'user-123',
  requested_by: 'financial-analyst-agent'
});

console.log(`Approval request sent with ID: ${interaction_id}`);
```

## Extending the System

### Adding a New Connector

1. Create a new connector file in `connectors/` that implements the connector interface
2. Register the connector in the connector registry
3. Implement the required methods for your data source

Example for a simple Notion connector:

```javascript
// connectors/notion_connector.mjs
import { Client } from '@notionhq/client';

class NotionConnector {
  constructor() {
    this.client = null;
    this.cache = new Map();
  }
  
  async initialize({ auth_token }) {
    this.client = new Client({ auth: auth_token });
    return true;
  }
  
  async read_page({ resource_id }) {
    // Implementation for reading a Notion page
  }
  
  async write_page({ resource_id, content }) {
    // Implementation for updating a Notion page
  }
  
  // Implement other required methods
}

const notion_connector = new NotionConnector();
export { notion_connector };
export default notion_connector;
```

### Creating a Custom Agent Type

1. Create a new class that extends `BaseAgent` in `agents/types/`
2. Override methods as needed for your specific agent type
3. Register your agent type in the agent registry

## API Reference

The system exposes several APIs for interacting with its components:

- **Agent API**: Create, manage, and trigger agents
- **Task API**: CRUD operations for tasks and task relationships
- **Connector API**: Interact with various data sources
- **Interaction API**: Request human input and process responses

Each API is documented in detail in the [API Reference](api-reference.md).

## Implementation Status

This project is under active development. Current implementation status:

- [x] Core architecture design
- [x] MCP protocol implementation
- [x] Base agent system
- [x] File system connector
- [x] Change request system
- [x] Task management
- [x] Human interaction manager
- [ ] Google Drive connector
- [ ] Notion connector
- [ ] Apple Notes connector
- [ ] Web UI for human interactions
- [ ] Authentication and user management
- [ ] Agent marketplace

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please see the [Contributing Guide](CONTRIBUTING.md) for more information. 