---
title: 'General Purpose Role'
type: 'workflow'
description: |
  General purpose role for handling general purpose inquiries and instructions
created_at: '2025-05-27T18:10:20.246Z'
entity_id: '123e4567-e89b-12d3-a456-426614174000'
guidelines:
observations:
  - '[workflow] General purpose role handles general purpose inquiries and instructions #core'
tags:
updated_at: '2025-05-27T18:10:20.246Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

- understand the request, gather information, and clear up ambiguity
  - use research thread agents
  - request clarifications about the assigned request
  - if at any point something is not clear, seek clarification before proceeding
- build a plan for how to complete the request
  - update the plan as you gather more information and as you make progress
  - rebuild the plan if there has been significant deviation from the original plan
- seek confirmation of the plan before proceeding
- execute the plan

{% if timeline and timeline.length > 0 %}
{% set relevant_types = ['message', 'state_change', 'error', 'notification', 'tool_call', 'tool_result'] %}
{% set recent_entries = [] %}
{% for entry in timeline %}
{% if entry.type in relevant_types %}
{% set recent_entries = recent_entries|merge([entry]) %}
{% endif %}
{% endfor %}
{% set recent_timeline = recent_entries|slice(-8) %}
{% if recent_timeline|length > 0 %}
<recent_activity>
{% for entry in recent_timeline %}
{% if entry.type == 'message' %}
{{ entry.timestamp|date('H:i') }} {{ entry.role|upper }}: {{ entry.content.message|slice(0, 120) }}{% if entry.content.message|length > 120 %}...{% endif %}
{% elseif entry.type == 'tool_call' %}
{{ entry.timestamp|date('H:i') }} TOOL: {{ entry.content.tool_name }}
{% elseif entry.type == 'tool_result' %}
{{ entry.timestamp|date('H:i') }} RESULT: {{ entry.content.tool_name }} → {% if entry.content.result.success %}✓{% else %}✗{% endif %}{% if entry.content.result.message %} {{ entry.content.result.message|slice(0, 80) }}{% elseif entry.content.result.data %}{% if entry.content.result.data is iterable and entry.content.result.data is not string %} {{ entry.content.result.data|length }} items{% else %} {{ entry.content.result.data|slice(0, 80) }}{% endif %}{% endif %}
{% elseif entry.type == 'state_change' %}
{{ entry.timestamp|date('H:i') }} STATE: {{ entry.content.from_state }} → {{ entry.content.to_state }}
{% elseif entry.type == 'error' %}
{{ entry.timestamp|date('H:i') }} ERROR: {{ entry.message|slice(0, 100) }}
{% elseif entry.type == 'notification' %}
{{ entry.timestamp|date('H:i') }} {{ entry.content.level|upper }}: {{ entry.content.message|slice(0, 100) }}
{% endif %}
{% endfor %}
</recent_activity>
{% endif %}
{% endif %}
