---
title: Person
type: type_definition
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
  - name: organizations
    type: array
    items:
      type: string
    required: false
    description: Organizations the person belongs to
---

# Person

Persons represent individual people who may be involved in tasks, activities, or organizations within the knowledge base.

## Person Attributes

The person schema captures:

- Basic identity information
- Contact details
- Organizational affiliations

## Privacy Considerations

When creating person records, consider:

- Only include information that's relevant to the knowledge base
- Respect privacy preferences
- Limit personal identifiable information to what's necessary
- Follow applicable data protection regulations

## Relations

Persons commonly relate to:

- tasks (work they're assigned to)
- activities (processes they participate in)
- organizations (groups they belong to)
- guidelines (procedures they follow or create)
- physical_items (objects they use or manage)
- digital_items (files they create or access)
