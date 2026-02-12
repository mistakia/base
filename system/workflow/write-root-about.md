---
title: Generate Root ABOUT.md
type: workflow
description: >-
  Generate an updated ABOUT.md file for the root of the user-base directory by analyzing recent
  threads, tasks, and repository activity to summarize current active projects
created_at: '2025-08-19T14:36:38.853Z'
entity_id: 0f47d007-898e-4268-89ab-733e59912ae4
updated_at: '2025-08-19T14:36:38.853Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Generate Root ABOUT.md

<task>Generate an updated ABOUT.md file for the root of the user-base directory by analyzing recent threads, tasks, and repository activity to summarize current active projects and recent work</task>

<context>The root ABOUT.md file serves as the primary landing page for the user-base directory, providing an overview of active projects and current work. This workflow systematically gathers data from the filesystem to create consistent, up-to-date content.</context>

<instructions>
## Data Collection

1. **Gather Recent Thread Activity**

   - Use `node repository/active/base/libs-server/threads/list-threads.mjs` to get recent threads
   - Filter for threads updated in the last 30 days using `--updated_since` parameter
   - Limit to 20 most recent threads for analysis
   - Extract thread titles, descriptions, and activity patterns

2. **Collect Active Task Information**

   - Use `node repository/active/base/libs-server/task/filesystem/list-tasks-from-filesystem.mjs` to get active tasks
   - Exclude completed tasks using `--exclude_status Completed`
   - Group tasks by directory structure (base/, league/, nano-community/, etc.)
   - Identify high-priority and recently created tasks

3. **Analyze Repository Activity**
   - Check git log for recent commits in major active repositories
   - Identify most active repositories based on recent commit activity
   - Extract recent commit messages to understand current development focus

## Content Analysis and Organization

4. **Categorize Active Projects**

   - Group findings into major project categories based on directory structure and activity
   - Identify primary focus areas from task and thread patterns
   - Determine project status and recent developments

5. **Extract Project Descriptions**
   - Use existing task descriptions and thread summaries
   - Identify project paths and repository locations
   - Summarize recent related threads and activity

## Content Generation

6. **Apply ABOUT.md Template**

   - Use the template below to generate consistent structure
   - Populate dynamic content sections with gathered data
   - Maintain static introductory content

7. **Update Root ABOUT.md File**
   - Write the generated content to `/Users/trashman/user-base/ABOUT.md`
   - Preserve existing YAML frontmatter structure
   - Update the content section only

## ABOUT.md Content Template

```markdown
---
title: Root Base Directory
type: text
description: Root base directory for the Human-in-the-Loop System
base_uri: user:ABOUT.md
created_at: '2025-08-16T17:56:07.627Z'
entity_id: b257069e-6a7a-4d7d-b517-a43199a304d2
relations:
  - implements [[sys:system/text/system-design.md]]
  - relates [[sys:system/text/directory-structure.md]]
  - follows [[sys:system/guideline/write-text.md]]
updated_at: '{CURRENT_TIMESTAMP}'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

Welcome to the root of my [base directory](/repository/active/base), a Human-in-the-Loop system that manages a filesystem, executes workflows, and serves as my personal knowledge base & data archive.

**What I'm actively working on**
{ACTIVE_PROJECTS_SECTION}

**What I want to be working on**

- [Record](/repository/active/record-app) [short description of project]
- [nano.community](/repository/active/nano-community) [short description of project]
- [nano-node-light](/repository/active/nano-node-light) [short description of project]

{PASSIVE_PROJECTS_SECTION}
```

## Dynamic Content Generation Rules

### Active Projects Section

- Include projects with recent thread activity or active tasks
- Format: ` - [project name](/path) [description]`
- Add sub-bullet with brief summary of recent related threads
- Limit to top 5-7 most active projects

### Project Selection Criteria

- Recent thread activity (last 30 days)
- Active tasks (non-completed status)
- Recent git commits (last 30 days)
- Task priority levels (High/Medium priority preferred)

### Content Formatting

- Use relative paths for local repositories (e.g., `/repository/active/base`)
- Keep descriptions concise (1-2 lines maximum)
- Use consistent bullet point formatting
- Include thread activity summaries where relevant
  </instructions>

<output_format>
After successful completion, display:

**ABOUT.md Generated Successfully**

Updated: `/Users/trashman/user-base/ABOUT.md`

Active Projects Found: [number]

Recent Threads Analyzed: [number]

Active Tasks Processed: [number]
</output_format>
