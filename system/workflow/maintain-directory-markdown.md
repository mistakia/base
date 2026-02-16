---
title: Maintain Directory Markdown
type: workflow
description: >-
  Audit and maintain directory-level markdown documentation (ABOUT.md, INDEX.md) for coverage,
  compliance, and currency
base_uri: sys:system/workflow/maintain-directory-markdown.md
created_at: '2026-01-21T18:21:37.527Z'
entity_id: 8ba3a348-63f0-4adb-98c6-f557647bf1ed
public_read: true
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/directory-markdown-standards.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
updated_at: '2026-01-21T18:45:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
visibility_analyzed_at: '2026-02-16T04:40:51.980Z'
---

<task>Audit and maintain directory markdown files to ensure coverage, compliance with standards, and current content</task>

<context>

Directory markdown files (ABOUT.md, INDEX.md) provide essential context for navigating and understanding directory contents. This workflow identifies gaps and issues, then addresses them efficiently.

**Key Reference:** [[sys:system/guideline/directory-markdown-standards.md]]

**Scope:** User-base directories at depth 1-2, excluding system directories (thread, repository, node_modules, files, embedded-\*).

</context>

<instructions>

## Phase 1: Discovery

Run these commands to identify issues. Do not read file contents yet.

### Find Missing Documentation

```bash
# Directories missing ABOUT.md (task subdirectories)
find "$USER_BASE_DIRECTORY/task" -mindepth 1 -maxdepth 1 -type d \
  ! -exec test -f '{}/ABOUT.md' \; -print

# Directories missing ABOUT.md (text subdirectories)
find "$USER_BASE_DIRECTORY/text" -mindepth 1 -maxdepth 1 -type d \
  ! -exec test -f '{}/ABOUT.md' \; -print

# Count entities per directory (prioritize by volume)
# Note: Uses temp file due to shell piping limitations with sort
output=""
for d in "$USER_BASE_DIRECTORY/task"/*/; do
  name=$(basename "$d")
  count=$(cd "$d" && files=(*.md) && echo ${#files[@]})
  output="${output}${count} task/${name}
"
done
for d in "$USER_BASE_DIRECTORY/text"/*/; do
  name=$(basename "$d")
  count=$(cd "$d" && files=(*.md) && echo ${#files[@]})
  output="${output}${count} text/${name}
"
done
echo "$output" > /tmp/dir-counts.txt && sort -rn /tmp/dir-counts.txt
```

### Check Structural Compliance

```bash
# ABOUT.md files missing required sections
for f in $(find "$USER_BASE_DIRECTORY" -name "ABOUT.md" -not -path "*/thread/*" -not -path "*/repository/*"); do
  missing=""
  grep -q "^## Purpose" "$f" || missing="${missing} Purpose"
  grep -q "^## Context" "$f" || missing="${missing} Context"
  grep -q "^## Standards" "$f" || missing="${missing} Standards"
  [ -n "$missing" ] && echo "$f:${missing}"
done
```

### Identify Candidates for Optional Sections

```bash
# Task ABOUT.md files missing Goals or Scope sections
for f in $(find "$USER_BASE_DIRECTORY/task" -name "ABOUT.md"); do
  missing=""
  grep -q "^## Goals" "$f" || missing="${missing} Goals"
  grep -q "^## Scope" "$f" || missing="${missing} Scope"
  [ -n "$missing" ] && echo "$f:${missing}"
done
```

## Phase 2: Triage

From discovery results, create a prioritized list:

1. **High priority**: Task directories with 10+ entities and no ABOUT.md
2. **Medium priority**: Existing ABOUT.md missing required sections
3. **Lower priority**: Missing optional sections (Goals, Scope)

Present the triage list to the user and confirm which items to address.

## Phase 3: Address Issues

Process one directory at a time to minimize context usage. Read [[sys:system/guideline/directory-markdown-standards.md]] before creating content.

### For Missing ABOUT.md

1. List directory contents: `ls <directory>/*.md | head -10`
2. Read 2-3 entity files to understand the directory's scope
3. Check for related directories that might have overlapping scope
4. Create ABOUT.md with required sections (Purpose, Context, Standards)
5. Add optional sections only if clearly needed:
   - Goals - if task directory has a defined endpoint
   - Scope - if overlap with other directories exists
   - Notable Context - if specific tags or guidelines apply

### For Missing Sections

1. Read the existing file
2. Add missing required sections
3. Consider if optional sections would add value

### For Stale Content

1. Read current file
2. Check if Purpose/Goals still accurate
3. Update Context if relationships changed
4. Update Notable Context if new tags/guidelines apply

## Phase 4: Validate

Re-run the "Find Missing Documentation" and "Check Structural Compliance" commands from Phase 1 to confirm issues are resolved.

## Decision Standards

| Scenario                              | Action                        |
| ------------------------------------- | ----------------------------- |
| Directory has <5 entities             | Skip unless high-value domain |
| Directory is temporary/transient      | Skip documentation            |
| Overlap with another directory exists | Add Scope section to both     |
| Task directory has defined endpoint   | Add Goals section             |
| Directory contents use specific tag   | Document in Notable Context   |

</instructions>

<output_format>

**Discovery Results:**

- Directories missing ABOUT.md: [count]
- Files missing required sections: [count]
- Files missing optional sections: [count]

**Triage (prioritized):**

1. [directory] - [issue] - [entity count]
2. ...

**Changes Made:**
| Directory | Action | Sections Added |
|-----------|--------|----------------|
| task/league/ | Created ABOUT.md | Purpose, Context, Standards, Goals, Scope |
| text/homelab/ABOUT.md | Updated | Added Context section |

**Remaining Issues:** (if any, with reason deferred)

</output_format>
