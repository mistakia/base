---
title: Write Documentation
type: guideline
description: >-
  Guidelines for creating lean, focused technical documentation that emphasizes unique design
  decisions and process flows
base_uri: sys:system/guideline/write-documentation.md
created_at: '2025-05-27T18:10:20.244Z'
entity_id: 12dc5b4c-365c-4e7f-b7f4-10c9851b1be2
globs:
  - text/**/*.md
  - '*.md'
observations:
  - '[clarity] Specific design choices provide more value than generic descriptions #design-decisions'
  - '[maintainability] Code examples become stale quickly and require frequent updates #maintenance'
  - '[focus] Unique architectural decisions distinguish systems from common patterns #architecture'
public_read: true
relations:
  - implements [[sys:system/text/system-design.md]]
updated_at: '2026-01-05T19:25:18.072Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:30:44.381Z'
---

### What to Include

- **Unique Design Decisions**: Document choices that distinguish your system from standard approaches
- **Process Flow**: Describe the high-level sequence of operations without implementation details
- **Architectural Trade-offs**: Explain why specific approaches were chosen over alternatives
- **Ossified Specifications**: Document stable implementation specifications
- **Data Structures**: Document custom formats, schemas, and storage patterns
- **Integration Points**: Describe how components interact and dependencies between systems
- **Error Handling Strategy**: Document how failures are detected, reported, and recovered from
- **Configuration Requirements**: Specify what must be configured for the system to function

### What to Exclude

- **Generic Information**: Avoid describing common patterns or widely-known concepts
- **Volatile Implementation Details**: Do not include code examples, variable names, or details that change frequently during development
- **Frequently Changing Information**: Exclude API endpoints, file paths, or configuration values that update regularly
- **Obvious Information**: Do not state self-evident facts or repeat information available elsewhere
- **Ambiguous Statements**: Avoid vague descriptions that could apply to any system
- **Future Plans**: Do not document intended features or potential improvements
- **Debugging Information**: Exclude temporary notes, TODO items, or troubleshooting steps
- **Completed Transitions**: Do not preserve migration histories, changelog narratives, or before/after mapping tables once a transition is finished. Git history records what changed; living documentation should describe the current design, not how it got there

### Structure and Style

- Content MUST be concise while maintaining sufficient detail for understanding
- Design choices SHOULD be explained with their rationale when not self-evident
- Process descriptions SHOULD use numbered steps or clear sequence indicators
- Documentation SHOULD be organized from high-level concepts to specific details
- Do not use emojis in documentation

### Maintenance Principles

- Documentation MUST remain accurate without frequent updates
- Content SHOULD focus on stable architectural decisions and ossified implementation specifications
- Examples SHOULD use abstract concepts rather than specific code or configuration
- References to external systems SHOULD use general terms rather than specific tools or versions

### Quality Criteria

- **Distinctiveness**: Information should be unique to your system or approach
- **Stability**: Content should remain accurate across multiple development cycles
- **Actionability**: Readers should understand what makes your system work
- **Clarity**: Complex concepts should be explained in clear, direct language
- **Completeness**: All significant design decisions should be documented with rationale
- **Maintenance Justification**: Content should only be included when its informational value justifies the ongoing cost of keeping it accurate
