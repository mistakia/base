# Directory Structure

This document outlines the directory structure for the human-in-the-loop agent system, providing a clear organization of code and resources.

## Overview

The system is organized into the following top-level directories:

```
├── common/             # Shared code between client and server
├── libs-server/        # Server-specific code
├── static/             # Static resources (images, styles, etc.)
├── scripts/            # Executable command-line scripts
├── docs/               # Documentation
├── config/             # Configuration
└── tests/              # Test files
```

## Detailed Structure

### Common

### Server Libraries

The `libs-server/` directory contains server-specific code organized by the system components:

### Static Resources

### Scripts

The `scripts/` directory contains executable command-line scripts:

### Documentation

The `docs/` directory contains system documentation:

```
└── docs/
    ├── agent-system-design.md
    ├── system-workflow.md
    ├── activity-guideline-system.md
    ├── multi-model-inference.md
    ├── self-improvement-system.md
    ├── directory-structure.md
    ├── configuration-system.md
    ├── api/            # API documentation
    ├── guides/         # User and developer guides
    └── examples/       # Example configurations and usage
```

### Configuration

### Tests

The `tests/` directory contains test files organized by component:

```
└── tests/
    ├── unit/           # Unit tests
    ├── integration/    # Integration tests
    └── e2e/            # End-to-end tests
```

## Data Storage

The system uses the following directories for data storage:

```
└── data/
    ├── git/            # Git repositories for version control
    ├── models/         # Stored model data
    ├── activities/     # Activity definitions
    ├── guidelines/     # Guideline definitions
    ├── tasks/          # Task data
    ├── inference/      # Inference request history
    └── logs/           # System logs
```

## Implementation Notes

1. **Module System**: The system uses ES modules with the `.mjs` extension for clarity.
2. **Path Aliases**: Configure path aliases in build tools to simplify imports.