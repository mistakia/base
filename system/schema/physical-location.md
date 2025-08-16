---
type: type_definition
type_name: physical_location
title: Physical Location
extends: entity
description: Physical locations represent places, addresses, or geographical points
properties:
  - name: latitude
    type: number
    required: false
    description: Decimal latitude coordinate
  - name: longitude
    type: number
    required: false
    description: Decimal longitude coordinate
  - name: mail_address
    type: string
    required: false
    description: Complete street address
  - name: mail_address2
    type: string
    required: false
    description: Additional address information
  - name: mail_careof
    type: string
    required: false
    description: Care of recipient
  - name: mail_street_number
    type: number
    required: false
    description: Street number
  - name: mail_street_prefix
    type: string
    required: false
    description: Street prefix
  - name: mail_street_name
    type: string
    required: false
    description: Street name
  - name: mail_street_type
    type: string
    required: false
    description: Street type
  - name: mail_street_suffix
    type: string
    required: false
    description: Street suffix
  - name: mail_unit_number
    type: string
    required: false
    description: Unit number
  - name: mail_city
    type: string
    required: false
    description: City
  - name: mail_state
    type: string
    required: false
    description: State/Province
  - name: mail_zip
    type: number
    required: false
    description: ZIP/Postal code
  - name: mail_country
    type: string
    required: false
    description: Country
  - name: mail_urbanization
    type: string
    required: false
    description: Urbanization code
---

# Physical Location

Physical locations represent places, addresses, or geographical points in the real world. They can be referenced by tasks and other knowledge base items.

## Location Types

Physical locations can represent various places:

- Buildings
- Rooms
- Office spaces
- Geographical landmarks
- Waypoints
- Mailing addresses
- GPS coordinates

## Address Format

The schema supports both structured address components and complete address strings, allowing for flexible representation of location information.

## Relations

Physical locations commonly relate to:

- tasks (work performed at specific locations)
- physical_items (objects stored at these locations)
- organizations (groups that operate at these locations)
- persons (individuals who work at or visit these locations)
