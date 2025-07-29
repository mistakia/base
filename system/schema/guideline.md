---
type: type_definition
type_name: guideline
title: Guideline
extends: base
description: Guidelines represent standards, procedures, or best practices
properties:
  - name: globs
    type: array
    items:
      type: string
    optional: true
    description: Glob patterns for files that this guideline applies to
  - name: always_apply
    type: boolean
    optional: true
    description: Whether this guideline should always be applied
  - name: prompt_properties
    type: array
    description: Defines input parameters for the guideline template
    optional: true
    items:
      type: object
      properties:
        - name: name
          type: string
          required: true
          description: Name of the property
        - name: type
          type: string
          required: true
          description: Data type of the property
        - name: required
          type: boolean
          required: false
          description: Whether the property is required
        - name: description
          type: string
          required: false
          description: Description of what the property is used for
        - name: default
          type: any
          required: false
          description: Default value for the property
---

# Guideline

Guidelines represent standards, procedures, or best practices that should be followed when performing executing workflows and completing tasks.

## Purpose

Guidelines serve to:

- Standardize processes
- Document best practices
- Shape system behavior based on user preferences
- Maintain quality standards
- Provide consistency across operations

## Template Support

Guidelines can now use Twig templating to create dynamic content based on input properties. This allows guidelines to be customized with specific examples, file paths, and other contextual information.

### Prompt Properties

Guidelines can define `prompt_properties` to specify what data they expect:

```yaml
prompt_properties:
  - name: task_example
    type: object
    required: false
    description: Example task data to populate templates
    default:
      issue_number: '123'
      task_description: 'example-task'
      project_path: 'example/project'
```

### Template Usage

Within the guideline content, use Twig syntax to reference properties:

```markdown
Branch naming: `fix/{{ task_example.issue_number }}-{{ task_example.task_description }}`
```

## Relations

Guidelines commonly relate to:

- workflows
- tasks

Example:

```yaml
relations:
  - 'used_by [[sys:system/workflow/workflow-name]]'
  - 'applies_to [[user:task/task-name]]'
```
