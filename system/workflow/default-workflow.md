---
title: 'General Purpose Role'
type: 'workflow'
description: |
  General purpose role for handling general purpose inquiries and instructions
created_at: '2025-05-27T18:10:20.232Z'
entity_id: 'f07d39b2-260c-4d9a-b961-2fe728864eb9'
guidelines:
observations:
  - '[workflow] General purpose role handles general purpose inquiries and instructions #core'
relations:
  - 'implements [[sys:system/text/system-design.md]]'
prompt_properties:
  - name: main_request
    type: string
    description: The main request to be completed
    required: true
tags:
updated_at: '2025-05-27T18:10:20.232Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

- understand the request, gather information, and clear up ambiguity
  - use available tools and workflows to gather information
  - if at any point something is not clear, never guess, instead seek clarification before proceeding
- build a plan for how to complete the request
  - update the plan as you gather more information and as you make progress
  - rebuild the plan if there has been significant deviation from the original plan
- seek confirmation of the plan before proceeding
- execute the plan

<main_request>
{{ main_request }}
</main_request>

{% if timeline and timeline|length > 0 %}
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
{{ entry.timestamp|date('H:i') }} {{ entry.role|upper }}: {% if entry.content.message is defined %}{{ entry.content.message|slice(0, 120) }}{% if entry.content.message|length > 120 %}...{% endif %}{% endif %}

{% elseif entry.type == 'tool_call' %}
{{ entry.timestamp|date('H:i') }} TOOL: {{ entry.content.tool_name }}{% if entry.content.tool_parameters is defined %}({{ entry.content.tool_parameters|json_encode }}){% endif %}

{% elseif entry.type == 'tool_result' %}
{{ entry.timestamp|date('H:i') }} RESULT: {% if entry.content.result.success is defined and entry.content.result.success %}✓{% else %}✗{% endif %} {{ entry.content.tool_name }}: {% if entry.content.result.message is defined %}{{ entry.content.result.message }}{% elseif entry.content.result.data is defined %}{% if entry.content.result.data is string %}{{ entry.content.result.data }}{% else %}{{ entry.content.result.data|json_encode }}{% endif %}{% else %}{{ entry.content.result|json_encode }}{% endif %}

{% elseif entry.type == 'state_change' %}
{{ entry.timestamp|date('H:i') }} STATE: {{ entry.content.from_state is defined ? entry.content.from_state : 'unknown' }} → {{ entry.content.to_state is defined ? entry.content.to_state : 'unknown' }}

{% elseif entry.type == 'error' %}
{{ entry.timestamp|date('H:i') }} ERROR: {{ entry.message is defined ? entry.message|slice(0, 100) : 'Unknown error' }}

{% elseif entry.type == 'notification' %}
{{ entry.timestamp|date('H:i') }} {{ entry.content.level is defined ? entry.content.level|upper : 'INFO' }}: {{ entry.content.message is defined ? entry.content.message|slice(0, 100) : 'No message' }}

{% endif %}
{% endfor %}
</recent_activity>
{% endif %}
{% endif %}
