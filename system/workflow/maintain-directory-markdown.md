---
title: Maintain Directory Markdown
type: workflow
description: >-
  Audit and maintain directory-level markdown documentation (ABOUT.md, INDEX.md) for coverage,
  compliance, graph navigation quality, and currency
base_uri: sys:system/workflow/maintain-directory-markdown.md
created_at: '2026-01-21T18:21:37.527Z'
entity_id: 8ba3a348-63f0-4adb-98c6-f557647bf1ed
public_read: true
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/directory-markdown-standards.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
updated_at: '2026-02-23T00:00:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
visibility_analyzed_at: '2026-02-16T04:40:51.980Z'
---

<task>Audit and maintain directory markdown files to ensure coverage, compliance with standards, graph navigation quality, and current content</task>

<context>

Directory markdown files (ABOUT.md, INDEX.md) serve as navigable entry points to their domain, enabling agents to discover and load relevant context efficiently. This workflow identifies structural gaps, graph health issues, and quality problems, then addresses them.

**Key References:**
- [[sys:system/guideline/directory-markdown-standards.md]] -- structural standards and content requirements
- Graph navigation principles from the directory-markdown-standards guideline (context phrases, progressive disclosure, context cohesion)

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

### Check Graph Navigation Quality

```bash
# ABOUT.md files with wikilinks but no context phrases (bare link lists)
for f in $(find "$USER_BASE_DIRECTORY" -name "ABOUT.md" -not -path "*/thread/*" -not -path "*/repository/*"); do
  total_links=$(grep -c '\[\[' "$f" 2>/dev/null || echo 0)
  annotated=$(grep -cE '\[\[.*\]\].*--' "$f" 2>/dev/null || echo 0)
  if [ "$total_links" -gt 0 ] && [ "$annotated" -eq 0 ]; then
    echo "THIN MOC: $f ($total_links links, none annotated)"
  fi
done

# Entities with empty or missing description fields (progressive disclosure gap)
for f in $(find "$USER_BASE_DIRECTORY/guideline" "$USER_BASE_DIRECTORY/workflow" -name "*.md" 2>/dev/null); do
  desc=$(grep "^description:" "$f" 2>/dev/null | sed 's/^description:\s*//')
  if [ -z "$desc" ] || [ "$desc" = "''" ] || [ "$desc" = '""' ]; then
    echo "EMPTY DESC: $f"
  fi
done
```

## Phase 2: Triage

From discovery results, create a prioritized list:

1. **High priority**: Task directories with 10+ entities and no ABOUT.md
2. **Medium priority**: Existing ABOUT.md missing required sections; thin MOCs (links without context phrases)
3. **Lower priority**: Missing optional sections (Goals, Scope); empty description fields; readability improvements

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

### For Thin MOCs (Missing Context Phrases)

1. Read the existing ABOUT.md
2. For each wikilink reference, add a context phrase explaining what it covers and when an agent would need it
3. Use the format: `- [[entity]] -- brief explanation of relevance`

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
| ABOUT.md has links without context phrases | Add context phrases to each reference |
| Entity has empty description field    | Fill with 1-2 sentence summary |

</instructions>

<output_format>

**Discovery Results:**

- Directories missing ABOUT.md: [count]
- Files missing required sections: [count]
- Files missing optional sections: [count]
- Thin MOCs (links without context phrases): [count]
- Empty description fields: [count]

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
