# Human-in-the-Loop System

A collaborative environment where LLMs and humans work together on tasks and knowledge management, with version control for everything and a focus on continuous improvement.

## Overview

This system creates a framework for LLMs and humans to collaborate effectively, with the following key features:

- **Version Controlled**: All data changes (prompts, tasks, guidelines, etc.) are tracked with git
- **File-First Architecture**: Files are the source of truth for all knowledge
- **Markdown Storage**: All knowledge items are stored as plain markdown files with YAML frontmatter
- **Pull Request Style Workflow**: Allows for review and approval of changes, a record of changes, progress tracking, comparison of changes, etc.
- **Activity-Based Organization**: Actions are classified by activity types for better context management
- **Multi-Model Support**: Different models can process the same inference requests
- **Guidelines-Driven**: Evolving guidelines shape the system's behavior based on user preferences
- **Granular Action Control**: System actions have configurable permission levels to control autonomy
- **Async Collaboration**: Support for asynchronous human-system interaction
- **Knowledge Graph**: Builds and traverses relationships between knowledge items
- **Block-Based Content**: All content is broken down into uniquely identifiable blocks with granular access control.
- **Self-Improvement**: The system can evaluate and improve itself through a built-in feedback loop

## Documentation

- [System Design](system/system-design.md): Overall system architecture and components
- [Directory Structure](system/directory-structure.md): Organization of code and resources
- [Configuration System](system/configuration-system.md): How configuration works

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

3. Run the setup script:
   ```
   yarn setup
   ```

### Running the System

Start the development server:

```
export CONFIG_ENCRYPTION_KEY=your_secret_encryption_key
yarn dev
```

See the [Configuration System](docs/configuration.md) document for more details on configuration.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
