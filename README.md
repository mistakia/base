# Human-in-the-Loop System

A human-in-the-loop LLM system that works alongside a user to manage and build a knowledge base, manage data, complete tasks as the user would, and improve itself — designed for maximum flexibility, simplicity, and to operate as the user would unprompted.

## Overview

This system creates a framework for humans to collaborate effectively with LLMs, with the following key features:

- **File-First Architecture**: Files are the source of truth, stored as markdown files with YAML frontmatter
- **Version Controlled**: Everything is tracked with git
- **Change Tracking and Management**: Allows for review and approval of changes, a record of changes, progress tracking, comparison of changes, etc.
- **Composable Workflows**: Workflows can embed other workflows, enabling complex operations
- **Multi-Model Support**: Use the right model for each prompt and task
- **Guidelines-Driven**: Evolving guidelines shape the system's behavior based on user preferences
- **Granular Action Control**: Tool calls have configurable permission levels to control autonomy
- **Async Collaboration**: Support for asynchronous human-system interaction
- **Knowledge Graph**: Builds and traverses relationships between knowledge items
- **Block-Based Content**: All content is broken down into uniquely identifiable blocks with granular access control
- **Self-Improvement**: The system can evaluate and improve itself through feedback loops

## Documentation

- [System Design](system/text/system-design.md): Overall system architecture and components
- [Directory Structure](system/text/directory-structure.md): Organization of code and resources
- [Configuration System](system/text/configuration-system.md): How configuration works

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

See the [Configuration System](system/text/configuration-system.md) document for more details on configuration.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
