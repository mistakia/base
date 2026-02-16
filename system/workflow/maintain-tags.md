---
title: Maintain Tags
type: workflow
description: >-
  Execute tag maintenance to ensure proper entity tagging and maintain an essential, high-clarity
  tag set
base_uri: sys:system/workflow/maintain-tags.md
created_at: '2025-08-23T23:24:30.000Z'
entity_id: 2ce9fb34-eb2d-4d0c-a287-34aa23b6b80d
public_read: true
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
  - follows [[user:guideline/tag-standards.md]]
  - uses [[sys:cli/entity-list.mjs]]
  - uses [[sys:cli/manage-tags.mjs]]
  - uses [[sys:cli/move-entity.mjs]]
updated_at: '2025-08-23T23:24:30.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
visibility_analyzed_at: '2026-02-16T04:41:07.200Z'
---

<task>Execute tag maintenance to ensure entities are properly tagged and the tag set remains essential and high-clarity</task>

<context>Two goals: (1) ensure all entities are properly tagged for organization, search, and retrieval, and (2) maintain an essential set of tags with high clarity and high usage.</context>

<instructions>

Before starting, read [[user:guideline/tag-standards.md]] for current standards.

## CLI Tools

Three CLI tools support tag maintenance. Run with `--help` for full options.

| Tool              | Purpose                                    |
| ----------------- | ------------------------------------------ |
| `entity-list.mjs` | Query entities and tag statistics          |
| `manage-tags.mjs` | Batch add/remove tags from entities        |
| `move-entity.mjs` | Move/rename entities and update references |

Key commands:

```bash
# Tag statistics - show entity counts per tag
base tag stats
# or: node cli/entity-list.mjs --tag-stats

# Tags below minimum threshold (15 entities)
base tag stats --below-threshold 15

# Find untagged entities by type
base entity list -t task --without-tags

# Batch add/remove tags
base tag add -t <tag> -i "task/**/*.md" --dry-run
base tag remove -t <tag> -i "**/*.md"

# Rename a tag (updates all references)
base entity move tag/old-name.md tag/new-name.md --dry-run
```

## Entity Tagging Review

1. **Identify Untagged Entities**

   - Scan task, workflow, guideline, and text directories for entities without tags
   - Prioritize entities that would benefit from tag-based organization
   - Determine appropriate tags for untagged entities

2. **Verify Tag Application**

   - Review entities to ensure tags accurately reflect their domain/project
   - Identify entities with incorrect or outdated tag assignments
   - Plan migrations for entities needing tag updates

3. **Execute Tag Updates**
   - Use the CLI tool for batch tag operations across multiple entities
   - Apply tags to untagged entities based on directory patterns when appropriate
   - Migrate entities from incorrect tags to correct ones

## Tag Clarity Review

4. **Assess Tag Clarity**

   - Review each tag's description and scope definition
   - Identify tags with unclear or vague purpose
   - Update tag descriptions to improve clarity
   - Consult user for feedback on tag usefulness

## Tag Removal (Rare)

5. **Identify Removal Candidates**

   Tag removal is exceptional and applies only to:

   - **Mistaken creation**: Tags that should never have existed (too granular, unclear purpose)
   - **Duplicate tags**: Two tags created for the exact same concept (e.g., `home-lab` and `homelab`)
   - **Superseded domains**: Technology/project completely replaced (not just completed)

6. **Execute Removal** (only after user confirmation)
   - **Rename tag** (tag exists but needs new name): Use `move-entity.mjs` to rename and update all references in one command
   - **Merge duplicates** (two tags exist for same concept): Use `manage-tags.mjs` to reassign entities to the retained tag, then delete the duplicate tag file
   - Update any references in workflows/guidelines
   - Document removal rationale

## Validation

7. **Validate Changes**

   - Verify all entity tag references are correct
   - Check for broken references or orphaned tag assignments

</instructions>

<output_format>
**Review Date**: [Date]

**Entity Tagging**:

- **Entities reviewed**: [Count]
- **Tags applied**: [Count of entities that received new/updated tags]
- **Patterns used**: [CLI patterns applied for batch operations]

**Tag Clarity**:

- **Tags reviewed**: [Count and list]
- **Descriptions updated**: [Tags with updated descriptions]
- **Removals**: [If any, with rationale]
  </output_format>
