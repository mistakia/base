# Human-in-the-Loop LLM System

A file system and workflow loop where a human and LLMs work in a tight loop to manage and build a knowledge base and complete tasks in an opinionated way.

## Prerequisites

- Node.js 18+
- Yarn
- Redis (for BullMQ job queues)
- `ripgrep` (`rg`) -- the search engine uses ripgrep for file enumeration and content search

## Documentation

- [System Design](system/text/system-design.md): Overall system architecture and components
- [Directory Structure](system/text/directory-structure.md): Organization of code and resources

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
