---
title: Write Claude Code Slash Command
type: guideline
description: >-
  Guidelines for creating custom slash commands for Claude Code to automate common development
  workflows
created_at: '2025-06-06T16:51:43.604Z'
entity_id: d8071403-69de-49c3-87d4-2633ad8c20a8
globs:
  - .claude/commands/**/*.md
  - ~/.claude/commands/**/*.md
guideline_status: Approved
observations:
  - '[pattern] XML tags provide clear structure for command prompts'
  - '[practice] $ARGUMENTS placeholder enables flexible command invocation'
  - '[organization] Nested directories support command namespacing'
relations:
  - related_to [[sys:guideline/write-entity.md]]
  - implements [[sys:text/system-design.md]]
  - follows [[sys:guideline/write-workflow.md]]
updated_at: '2025-06-06T16:51:43.604Z'
user_id: 00000000-0000-0000-0000-000000000000
---

# Write Claude Code Slash Command

Claude Code slash commands are specialized workflows that follow the general workflow guidelines defined in [[sys:guideline/write-workflow.md]]. This document covers the Claude Code specific requirements and conventions.

## Command Structure

### File Location and Naming

- Project-specific commands MUST be stored in `.claude/commands/` directory
- Personal commands MUST be stored in `~/.claude/commands/` directory
- Command names MUST follow kebab-case format (e.g., `fix-issue.md`, `deploy-staging.md`)
- Nested commands SHOULD use subdirectories (e.g., `.claude/commands/deploy/staging.md`)
- File extension MUST be `.md` (Markdown)

### Command Invocation

- Project commands: `/project:command-name` or `/project:folder:command-name`
- Personal commands: `/user:command-name`
- Arguments passed using: `/project:command-name argument-text`

## Claude Code Specific Requirements

### Command File Structure

- The entire command file becomes the prompt sent to Claude
- Commands MUST follow the XML tag structure defined in [[sys:guideline/write-workflow.md]]
- Commands MUST use the standard workflow XML tags:
  ```markdown
  <task>Primary objective</task>
  <context>Background information and project context</context>
  <instructions>Step-by-step guidance</instructions>
  <output_format>Expected response format</output_format>
  ```

### Argument Handling

- Commands MUST use `$ARGUMENTS` placeholder for dynamic input
- `$ARGUMENTS` is replaced literally throughout the entire file
- Commands SHOULD handle empty arguments gracefully
- Example usage:

  ```markdown
  <task>Fix issue #$ARGUMENTS</task>
  <instructions>

  1. Fetch issue details for issue #$ARGUMENTS
  2. Analyze the problem described
  3. Implement a solution
     </instructions>
  ```

## Claude Code Best Practices

### Command Design

- Commands MUST NOT include direct CLI commands (use MCP tools instead)
- Commands SHOULD include a clear description comment at the beginning:
  ```markdown
  <!-- Fix GitHub issue by issue number -->
  <!-- Usage: /project:fix-issue 123 -->
  <!-- Prerequisites: GitHub integration configured -->
  ```

### Documentation Requirements

- Commands SHOULD specify expected argument format in comments
- Commands SHOULD document any prerequisites or assumptions
- Commands SHOULD include usage examples in comments

## Example Command

```markdown
<!-- Deploy application to staging environment -->
<!-- Usage: /project:deploy:staging [branch-name] -->

<task>Deploy the application to the staging environment</task>

<context>
This command deploys the current branch (or specified branch) to our staging environment.
The deployment includes running tests, building the application, and updating the staging server.
</context>

<instructions>
1. Determine the branch to deploy (use $ARGUMENTS if provided, otherwise current branch)
2. Run the test suite using `yarn test`
3. If tests pass, build the application with `yarn build`
4. Create a deployment commit with changes
5. Push to the staging branch
6. Notify the team of the deployment status
</instructions>

<output_format>
Provide a summary of:

- Branch deployed
- Test results
- Build status
- Deployment outcome
- Any issues encountered
  </output_format>
```
