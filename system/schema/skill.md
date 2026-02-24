---
title: Skill Schema
type: type_definition
description: Agent skill entity -- workflow-format markdown discoverable by the extension system
created_at: '2026-02-24T01:51:16.411Z'
entity_id: 018fe375-92ee-4d58-8d4b-a11e2bdc28bf
extends: entity
properties:
  - name: extension
    type: string
    description: Source extension name if skill belongs to an extension
    optional: true
public_read: false
type_name: skill
updated_at: '2026-02-24T01:51:16.411Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Skill

Skills are agent-readable behavior definitions using the same format as workflows: markdown files with YAML frontmatter and task/context/instructions XML structure. The difference is naming convention -- \"workflow\" is the Base standard term, while \"skill\" and \"SKILL.md\" reflect the broader agent ecosystem consensus (agentskills.io, Claude Code plugins).

## Relationship to Workflows

Skills and workflows are interchangeable formats. An existing workflow can become a skill by changing its type field -- no structural changes needed. The extension system discovers both type: skill and type: workflow entities.

## Discovery Patterns

Skills are discovered from multiple locations:

1. **Extension skill/ directories**: Markdown files in an extension's skill/ subdirectory
2. **Extension SKILL.md**: A single skill file at an extension's root (consensus spec format)
3. **Workflow directories**: User and system workflow directories (type: skill or type: workflow)

## SKILL.md Consensus Spec Mapping

The SKILL.md consensus format (agentskills.io) maps to Base entities:

- SKILL.md \`name\` = Base \`title\`
- SKILL.md \`allowed-tools\` = informational only in Base (not enforced)
- SKILL.md \`task/context/instructions\` XML = identical to Base workflow format

## Creating a Skill

Skills can be placed in:

- An extension's \`skill/\` directory for extension-scoped skills
- An extension root as \`SKILL.md\` for the consensus format
- The user \`workflow/\` directory as standalone skills
