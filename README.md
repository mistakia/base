# Human-in-the-Loop Agent System

A collaborative environment where AI agents and humans work together on tasks and knowledge management, with version control for everything and a focus on continuous improvement.

## Overview

This system creates a framework for AI agents and humans to collaborate effectively, with the following key features:

- **Version Control for Everything**: All data changes (prompts, tasks, guidelines, etc.) are tracked with git
- **Activity-Based Organization**: Actions are classified by activity types for better context management
- **Multi-Model Support**: Different models can process the same inference requests
- **Self-Improvement**: System can recursively work on improving its own components
- **Guidelines-Driven**: Activities follow established guidelines that evolve over time
- **Human Oversight**: All significant changes require human approval

## Documentation

- [System Design](docs/agent-system-design.md): Overall system architecture and components
- [System Workflow](docs/system-workflow.md): High-level workflows and processes
- [Activity and Guideline System](docs/activity-guideline-system.md): How activities and guidelines work
- [Multi-Model Inference](docs/multi-model-inference.md): How multiple models process the same requests
- [Self-Improvement System](docs/self-improvement-system.md): How the system improves itself
- [Directory Structure](docs/directory-structure.md): Organization of code and resources
- [Configuration System](docs/configuration-system.md): How configuration works

## Directory Structure

The system is organized into the following top-level directories:

```
├── common/             # Shared code between client and server
├── libs-server/        # Server-specific code
├── static/             # Static resources (images, styles, etc.)
├── scripts/            # Executable command-line scripts
├── docs/               # Documentation
├── config/             # Non-sensitive configuration (tracked by git)
└── tests/              # Test files
```

See the [Directory Structure](docs/directory-structure.md) document for more details.

## Getting Started

### Prerequisites

- Node.js 18+
- Git

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/mistakia/base.git
   cd base
   ```

2. Install dependencies:
   ```
   yarn install
   ```

4. Run the setup script:
   ```
   yarn setup
   ```

### Running the System

Start the development server:
```
export CONFIG_ENCRYPTION_KEY=your_secret_encryption_key
yarn dev
```

See the [Configuration System](docs/configuration-system.md) document for more details on configuration.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 