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
  - related_to [[system/guideline/write-entity.md]]
  - implements [[system/text/system-design.md]]
updated_at: '2025-06-06T16:51:43.604Z'
user_id: 00000000-0000-0000-0000-000000000000
---

# Write Claude Code Slash Command

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

## Content Requirements

### Command File Structure
- The entire command file becomes the prompt sent to Claude
- Commands MUST use clear XML tags to structure the prompt:
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

## Best Practices

### Command Design
- Commands SHOULD be focused on a single workflow or task type
- Commands SHOULD include examples of expected input/output
- Commands SHOULD reference relevant project documentation
- Commands MUST NOT include direct CLI commands (use MCP tools instead)
- Commands SHOULD specify when to update task states or create todos

### Documentation
- Commands SHOULD include a clear description at the beginning
- Commands SHOULD specify expected argument format
- Commands SHOULD document any prerequisites or assumptions
- Example header:
  ```markdown
  <!-- Fix GitHub issue by issue number -->
  <!-- Usage: /project:fix-issue 123 -->
  <!-- Prerequisites: GitHub integration configured -->
  ```

### Error Handling
- Commands SHOULD provide guidance for common error scenarios
- Commands SHOULD specify fallback behavior when arguments are missing
- Commands SHOULD include validation steps for critical operations

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
</markdown>
```
