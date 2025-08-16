---
type: type_definition
description: Physical items represent tangible objects, equipment, or materials
created_at: '2025-08-16T17:56:08.204Z'
entity_id: 0eb4ada8-d30f-40a8-ad31-e60a3110a8d4
extends: entity
properties:
  # Standard physical item properties
  - name: manufacturer
    type: string
    required: false
    description: Manufacturer of the item
  - name: model_number
    type: string
    required: false
    description: Model number or identifier
  - name: serial_number
    type: string
    required: false
    description: Unique serial number
  - name: storage_location
    type: string
    required: false
    description: Where the item is stored
  - name: acquisition_date
    type: date
    required: false
    description: When the item was acquired

  # Additional location properties
  - name: target_location
    type: string
    required: false
    description: Where the item should be stored
  - name: current_location
    type: string
    required: false
    description: Where the item currently is
  - name: home_areas
    type: array
    items:
      type: string
    required: false
    description: Areas where this item belongs
  - name: home_attribute
    type: array
    items:
      type: string
    required: false
    description: Attributes of ideal storage location

  # Physical characteristics
  - name: height_inches
    type: number
    required: false
    description: Height in inches
  - name: width_inches
    type: number
    required: false
    description: Width in inches
  - name: depth_inches
    type: number
    required: false
    description: Depth in inches
  - name: weight_ounces
    type: number
    required: false
    description: Weight in ounces
  - name: volume_cubic_inches
    type: number
    required: false
    description: Volume in cubic inches

  # Technical specifications
  - name: voltage
    type: string
    required: false
    description: Voltage requirements
  - name: wattage
    type: number
    required: false
    description: Wattage consumption
  - name: outlets_used
    type: number
    required: false
    description: Number of electrical outlets used
  - name: water_connection
    type: boolean
    required: false
    description: Requires water connection
  - name: drain_connection
    type: boolean
    required: false
    description: Requires drain connection
  - name: ethernet_connected
    type: boolean
    required: false
    description: Requires ethernet connection
  - name: min_storage_temperature_celsius
    type: number
    required: false
    description: Minimum storage temperature
  - name: max_storage_temperature_celsius
    type: number
    required: false
    description: Maximum storage temperature
  - name: min_storage_humidity_percent
    type: number
    required: false
    description: Minimum storage humidity
  - name: max_storage_humidity_percent
    type: number
    required: false
    description: Maximum storage humidity

  # Inventory information
  - name: exist
    type: boolean
    required: false
    description: Whether the item exists or is planned
  - name: current_quantity
    type: number
    required: false
    description: Quantity currently in possession
  - name: target_quantity
    type: number
    required: false
    description: Desired quantity
  - name: importance
    type: string
    enum:
      - Core
      - Standard
      - Premium
      - Potential
    required: false
    description: Importance classification
  - name: frequency_of_use
    type: string
    enum:
      - Daily
      - Weekly
      - Infrequent
    required: false
    description: How often the item is used
  - name: consumable
    type: boolean
    required: false
    description: Whether the item is depleted with use
  - name: perishable
    type: boolean
    required: false
    description: Whether the item expires

  # Organizational properties
  - name: kit_name
    type: string
    required: false
    description: Name of kit this item belongs to
  - name: kit_items
    type: array
    items:
      type: string
    required: false
    description: Items in this kit
  - name: large_drawer_units
    type: number
    required: false
    description: Large drawer units required
  - name: standard_drawer_units
    type: number
    required: false
    description: Standard drawer units required

  # Additional information
  - name: storage_notes
    type: string
    required: false
    description: Notes about storing this item
  - name: misc_notes
    type: string
    required: false
    description: Miscellaneous notes
type_name: physical_item
updated_at: '2025-08-16T17:56:09.132Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Physical Item

Physical items represent tangible objects, equipment, or materials that exist in the real world. They can be tracked for inventory, maintenance, and usage purposes.

## Relations

Physical items commonly use these relation types:

- `part_of`: Items this is a component of
- `contains`: Components that make up this item
- `requires`: Resources needed for this item
- `used_in`: A project, activity, or event this item is used for

Example:

```yaml
relations:
  - 'part_of [[sys:physical_item/parent-item]]'
  - 'contains [[sys:physical_item/component-item]]'
  - 'requires [[sys:physical_item/resource-item]]'
  - 'used_in [[sys:activities/activity-name]]'
```
