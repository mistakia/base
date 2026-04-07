---
title: Write Claude Code Skill
type: guideline
description: >-
  Guidelines for creating custom skills for Claude Code that wrap workflows and reference guidelines
  to automate common development tasks
base_uri: sys:system/guideline/write-claude-code-skill.md
created_at: '2025-06-06T16:51:43.604Z'
entity_id: d8071403-69de-49c3-87d4-2633ad8c20a8
globs:
  - .claude/skills/**/SKILL.md
  - ~/.claude/skills/**/SKILL.md
observations:
  - '[pattern] XML tags provide clear structure for skill prompts'
  - '[practice] $ARGUMENTS placeholder enables flexible skill invocation'
  - '[organization] Skill directories support bundled supporting files'
  - '[architecture] Skills should wrap workflows rather than contain implementation logic'
  - '[principle] Guidelines provide standards that skills should reference'
  - '[migration] Skills replaced .claude/commands/ as the preferred slash command format'
relations:
  - related_to [[sys:system/guideline/write-entity.md]]
  - implements [[sys:system/text/system-design.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
  - follows [[sys:system/guideline/write-guideline.md]]
  - uses [[sys:system/text/workflow.md]]
  - uses [[sys:system/schema/workflow.md]]
  - uses [[sys:system/schema/guideline.md]]
updated_at: '2026-03-13T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Write Claude Code Skill

Claude Code skills are the preferred way to create custom slash commands. Skills are lightweight wrappers that invoke workflows and reference guidelines to automate development tasks. Skills MUST NOT contain the main implementation logic but should delegate to appropriate workflows and guidelines as defined in the system architecture.

Skills follow the [Agent Skills](https://agentskills.io) open standard and replace the legacy `.claude/commands/` format. Existing command files continue to work but new commands MUST use the skills format.

## Architecture Principles

### Separation of Concerns

- **Workflows** contain the main implementation logic and step-by-step instructions
- **Guidelines** define standards, best practices, and quality requirements
- **Skills** serve as convenient entry points that:
  - Accept user arguments via `$ARGUMENTS`
  - Reference appropriate workflows for execution
  - Apply relevant guidelines for quality standards
  - Provide user-friendly interfaces to complex workflows
  - Support bundled supporting files (templates, scripts, examples)

### Skill Design Pattern

Skills SHOULD follow this pattern:

1. Reference relevant guidelines for standards
2. Invoke appropriate workflow(s) for execution
3. Apply guidelines for quality assurance

## Skill Structure

### File Location and Naming

- Each skill lives in its own directory with a `SKILL.md` entrypoint
- Project-specific skills MUST be stored in `.claude/skills/<skill-name>/SKILL.md`
- Personal skills MUST be stored in `~/.claude/skills/<skill-name>/SKILL.md`
- Skill directory names MUST follow kebab-case format (e.g., `fix-issue/`, `deploy-staging/`)
- Nested `.claude/skills/` directories in subdirectories are auto-discovered (monorepo support)

### Directory Structure

```
.claude/skills/
  my-skill/
    SKILL.md           # Main instructions (required)
    template.md        # Template for Claude to fill in (optional)
    examples/          # Example outputs (optional)
    scripts/           # Utility scripts (optional)
```

### Skill Invocation

- Skills are invoked with: `/skill-name` or `/skill-name argument-text`
- Claude can auto-invoke skills when their description matches user intent (unless disabled)
- Skills with `disable-model-invocation: true` can only be invoked manually
- Skills with `user-invocable: false` can only be invoked by Claude

### Priority Order

When skills share the same name across levels: enterprise > personal > project. Skills take precedence over legacy commands with the same name.

## SKILL.md File Structure

### Frontmatter

Skills use YAML frontmatter between `---` markers for configuration:

```yaml
---
name: my-skill
description: What this skill does and when to use it
disable-model-invocation: true
argument-hint: '[issue-number]'
allowed-tools: Read, Grep, Glob
context: fork
agent: Explore
model: sonnet
---
```

All fields are optional. Only `description` is recommended.

| Field                      | Required    | Description                                                            |
| :------------------------- | :---------- | :--------------------------------------------------------------------- |
| `name`                     | No          | Display name. Defaults to directory name. Lowercase, numbers, hyphens. |
| `description`              | Recommended | What the skill does. Claude uses this to decide when to load it.       |
| `argument-hint`            | No          | Hint shown during autocomplete (e.g., `[issue-number]`).               |
| `disable-model-invocation` | No          | Set `true` to prevent Claude from auto-loading. Default: `false`.      |
| `user-invocable`           | No          | Set `false` to hide from `/` menu. Default: `true`.                    |
| `allowed-tools`            | No          | Tools Claude can use without permission when skill is active.          |
| `model`                    | No          | Model override when skill is active.                                   |
| `context`                  | No          | Set `fork` to run in an isolated subagent context.                     |
| `agent`                    | No          | Subagent type when `context: fork` (e.g., `Explore`, `Plan`).          |

### Content

The markdown content after frontmatter becomes the prompt sent to Claude. Skills SHOULD use the standard XML tag structure:

```markdown
<task>Primary objective</task>
<context>Background information and project context</context>
<instructions>Step-by-step guidance that references workflows and guidelines</instructions>
<output_format>Expected response format</output_format>
```

### Available Substitutions

| Variable               | Description                                  |
| :--------------------- | :------------------------------------------- |
| `$ARGUMENTS`           | All arguments passed when invoking the skill |
| `$ARGUMENTS[N]`        | Specific argument by 0-based index           |
| `$N`                   | Shorthand for `$ARGUMENTS[N]`                |
| `${CLAUDE_SESSION_ID}` | Current session ID                           |
| `${CLAUDE_SKILL_DIR}`  | Directory containing the SKILL.md file       |

### Dynamic Context Injection

Use `!`command`` to run shell commands before skill content is sent to Claude:

```markdown
## Current state

- PR diff: !`gh pr diff`
- Changed files: !`gh pr diff --name-only`
```

## Workflow Integration

- Skills MUST reference specific workflows using wikilink format: `[[workflow-base-uri]]`
- Skills SHOULD NOT duplicate workflow logic but delegate to workflows
- Skills MAY provide workflow-specific context or arguments
- Example workflow reference:
  ```markdown
  <instructions>
  1. Follow the workflow defined in [[sys:system/workflow/fix-github-issue.md]]
  2. Use issue number: $ARGUMENTS
  3. Apply coding standards from [[sys:system/guideline/write-javascript.md]]
  </instructions>
  ```

## Guideline Integration

- Skills MUST reference relevant guidelines for quality standards
- Skills SHOULD specify which guidelines apply to the task
- Guidelines SHOULD be referenced using wikilink format: `[[guideline-base-uri]]`

## Invocation Control

Use these frontmatter fields to control who can invoke a skill:

| Frontmatter                      | You can invoke | Claude can invoke | Use case                         |
| :------------------------------- | :------------- | :---------------- | :------------------------------- |
| (default)                        | Yes            | Yes               | Reference knowledge, conventions |
| `disable-model-invocation: true` | Yes            | No                | Actions with side effects        |
| `user-invocable: false`          | No             | Yes               | Background knowledge for Claude  |

Action-oriented skills (deploy, merge, create issues, archive) SHOULD use `disable-model-invocation: true`.

## Best Practices

### Skill Design

- Skills MUST NOT contain detailed implementation steps (delegate to workflows)
- Skills SHOULD focus on argument handling and workflow orchestration
- Skills SHOULD include HTML comment documentation at the top:
  ```markdown
  <!-- Fix GitHub issue by delegating to issue resolution workflow -->
  <!-- Usage: /fix-issue 123 -->
  <!-- Prerequisites: GitHub integration configured -->
  <!-- Workflow: [[sys:system/workflow/fix-github-issue.md]] -->
  <!-- Guidelines: [[sys:system/guideline/write-javascript.md]] -->
  ```

### Supporting Files

- Keep `SKILL.md` under 500 lines; move detailed reference to separate files
- Reference supporting files from `SKILL.md` so Claude knows when to load them
- Use the `${CLAUDE_SKILL_DIR}` substitution to reference bundled scripts

### Documentation

- Skills SHOULD specify expected argument format via `argument-hint` and comments
- Skills SHOULD document referenced workflows and guidelines
- Skills SHOULD document any prerequisites or assumptions

## Example Skill

```
.claude/skills/deploy-staging/SKILL.md
```

```markdown
---
name: deploy-staging
description: Deploy the application to staging environment following established workflow and standards.
disable-model-invocation: true
argument-hint: '[branch-name]'
---

<!-- Deploy application to staging environment using deployment workflow -->
<!-- Usage: /deploy-staging [branch-name] -->
<!-- Workflow: [[sys:system/workflow/deploy-to-staging.md]] -->
<!-- Guidelines: [[sys:system/guideline/deployment-standards.md]] -->

<task>Deploy the application to staging environment following established workflow and standards</task>

<context>
This skill wraps the deployment workflow defined in [[sys:system/workflow/deploy-to-staging.md]]
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
