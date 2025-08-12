---
title: 'Take Notes'
type: 'workflow'
description: |
  Receive an external note, extract structured information, and store it in the knowledge base.
created_at: '2025-05-27T18:10:20.234Z'
entity_id: '71424c3c-27b2-48da-90b4-7f95c7f40357'
prompt_properties:
  - {
      'name': 'note_text',
      'type': 'string',
      'required': true,
      'description': 'The full text of the note to process'
    }
  - {
      'name': 'note_source',
      'type': 'string',
      'required': false,
      'description': 'The source of the note (e.g., Apple Notes, email)'
    }
  - {
      'name': 'note_metadata',
      'type': 'object',
      'required': false,
      'description': 'Additional metadata about the note (e.g., date, tags, folder)'
    }
updated_at: '2025-05-27T18:10:20.234Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Take Notes Workflow

This workflow receives a note, extracts structured information (such as tasks, contacts, or facts), and stores it in the appropriate entity in the knowledge base. It may delegate to sub-workflows for extraction, storage location determination, and entity creation or update.
