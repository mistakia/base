---
title: Write Claude Code Slash Command
type: guideline
description: >-
  Guidelines for creating custom slash commands for Claude Code that wrap workflows and
  reference guidelines to automate common development tasks
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
  - '[architecture] Commands should wrap workflows rather than contain implementation logic'
  - '[principle] Guidelines provide standards that commands should reference'
relations:
  - related_to [[sys:system/guideline/write-entity.md]]
  - implements [[sys:system/text/system-design.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
  - follows [[sys:system/guideline/write-guideline.md]]
  - uses [[sys:system/text/workflow.md]]
  - uses [[sys:system/schema/workflow.md]]
  - uses [[sys:system/schema/guideline.md]]
updated_at: '2025-06-06T16:51:43.604Z'
user_id: 00000000-0000-0000-0000-000000000000
---

# Write Claude Code Slash Command

Claude Code slash commands are lightweight wrappers that invoke workflows and reference guidelines to automate development tasks. Commands MUST NOT contain the main implementation logic but should delegate to appropriate workflows and guidelines as defined in the system architecture.

## Architecture Principles

### Separation of Concerns

- **Workflows** contain the main implementation logic and step-by-step instructions
- **Guidelines** define standards, best practices, and quality requirements
- **Slash Commands** serve as convenient entry points that:
  - Accept user arguments via `$ARGUMENTS`
  - Reference appropriate workflows for execution
  - Apply relevant guidelines for quality standards
  - Provide user-friendly interfaces to complex workflows

### Command Design Pattern

Commands SHOULD follow this pattern:
1. Reference relevant guidelines for standards
2. Invoke appropriate workflow(s) for execution
3. Apply guidelines for quality assurance

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
- Commands MUST follow the XML tag structure defined in [[sys:system/guideline/write-workflow.md]]
- Commands MUST use the standard workflow XML tags:
  ```markdown
  <task>Primary objective</task>
  <context>Background information and project context</context>
  <instructions>Step-by-step guidance that references workflows and guidelines</instructions>
  <output_format>Expected response format</output_format>
  ```

### Workflow Integration

- Commands MUST reference specific workflows using wikilink format: `[[workflow-base-uri]]`
- Commands SHOULD NOT duplicate workflow logic but delegate to workflows
- Commands MAY provide workflow-specific context or arguments
- Example workflow reference:
  ```markdown
  <instructions>
  1. Follow the workflow defined in [[sys:system/workflow/fix-github-issue.md]]
  2. Use issue number: $ARGUMENTS
  3. Apply coding standards from [[sys:system/guideline/write-javascript.md]]
  </instructions>
  ```

### Guideline Integration

- Commands MUST reference relevant guidelines for quality standards
- Commands SHOULD specify which guidelines apply to the task
- Guidelines SHOULD be referenced using wikilink format: `[[guideline-base-uri]]`
- Example guideline reference:
  ```markdown
  <context>
  This command follows the standards defined in:
  - [[sys:system/guideline/write-software-tests.md]] for test quality
  - [[sys:system/guideline/write-javascript.md]] for code style
  </context>
  ```

### Argument Handling

- Commands MUST use `$ARGUMENTS` placeholder for dynamic input
- `$ARGUMENTS` is replaced literally throughout the entire file
- Commands SHOULD handle empty arguments gracefully
- Commands SHOULD pass arguments to referenced workflows appropriately

## Claude Code Best Practices

### Command Design

- Commands MUST NOT include direct CLI commands (use MCP tools instead)
- Commands MUST NOT contain detailed implementation steps (delegate to workflows)
- Commands SHOULD focus on argument handling and workflow orchestration
- Commands SHOULD include a clear description comment at the beginning:
  ```markdown
  <!-- Fix GitHub issue by delegating to issue resolution workflow -->
  <!-- Usage: /project:fix-issue 123 -->
  <!-- Prerequisites: GitHub integration configured -->
  <!-- Workflow: [[sys:system/workflow/fix-github-issue.md]] -->
  <!-- Guidelines: [[sys:system/guideline/write-javascript.md]] -->
  ```

### Documentation Requirements

- Commands SHOULD specify expected argument format in comments
- Commands SHOULD document referenced workflows and guidelines
- Commands SHOULD document any prerequisites or assumptions
- Commands SHOULD include usage examples in comments

### Workflow and Guideline References

- Commands MUST clearly identify which workflows they invoke
- Commands MUST specify which guidelines apply to the task
- Commands SHOULD provide context on how workflows and guidelines interact
- Commands MAY customize workflow behavior through context or arguments

## Example Command

```markdown
<!-- Deploy application to staging environment using deployment workflow -->
<!-- Usage: /project:deploy:staging [branch-name] -->
<!-- Workflow: [[sys:system/workflow/deploy-to-staging.md]] -->
<!-- Guidelines: [[sys:system/guideline/deployment-standards.md]] -->

<task>Deploy the application to staging environment following established workflow and standards</task>

<context>
This command wraps the deployment workflow defined in [[sys:system/workflow/deploy-to-staging.md]]
and applies the standards from [[sys:system/guideline/deployment-standards.md]].

Branch to deploy: $ARGUMENTS (if provided, otherwise current branch)
</context>

<instructions>
1. Execute the deployment workflow: [[sys:system/workflow/deploy-to-staging.md]]
   - Pass branch argument: $ARGUMENTS
   - Follow all workflow steps for staging deployment

2. Apply deployment standards from: [[sys:system/guideline/deployment-standards.md]]
   - Ensure proper testing before deployment
   - Follow rollback procedures if issues occur
   - Document deployment status and outcomes

3. Provide deployment summary following the output format below
</instructions>

<output_format>
Provide a summary of:

- Branch deployed
- Workflow execution status
- Guideline compliance verification
- Deployment outcome
- Any issues encountered
</output_format>
```

## Migration from Legacy Commands

Existing commands that contain implementation logic SHOULD be refactored to:

1. Extract implementation steps into appropriate workflows
2. Extract standards and practices into guidelines
3. Update command to reference workflows and guidelines
4. Maintain backward compatibility for argument handling
