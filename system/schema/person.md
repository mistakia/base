---
type: type_definition
type_name: person
title: Person
extends: base
description: Persons represent individual people
properties:
  - name: first_name
    type: string
    required: true
    description: First name of the person
  - name: last_name
    type: string
    required: true
    description: Last name of the person
  - name: email
    type: string
    required: false
    description: Email address
  - name: mobile_phone
    type: string
    required: false
    description: Mobile phone number
  - name: website_url
    type: string
    required: false
    description: Personal website
---

# Person

Persons represent individual people who may be involved in tasks, or organizations within the knowledge base.

## Person Attributes

The person schema captures:

- Basic identity information
- Contact details
- Organizational affiliations (through relations)

## Privacy Considerations

When creating person records, consider:

- Only include information that's relevant to the knowledge base
- Respect privacy preferences
- Limit personal identifiable information to what's necessary
- Follow applicable data protection regulations

## Relations

Persons commonly use these relation types:

- `member_of`: Organizations the person belongs to (formerly organizations)
- `assigned_to`: Tasks assigned to the person
- `follows`: Guidelines the person follows or creates
- `requires`: Physical or digital items the person uses or manages

Example:

```yaml
relations:
  - 'member_of [[sys:organization/org-name]]'
  - 'assigned_to [[user:tasks/task-name]]'
  - 'follows [[sys:guidelines/guideline-name]]'
  - 'requires [[sys:physical_item/item-name]]'
```
