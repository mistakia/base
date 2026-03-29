import { create_api_action_types, create_api_actions } from '@core/utils'

const PATCH_ENTITY = 'PATCH_ENTITY'

export const entity_action_types = {
  ...create_api_action_types(PATCH_ENTITY),

  UPDATE_ENTITY_PROPERTY: 'UPDATE_ENTITY_PROPERTY',
  REVERT_ENTITY_UPDATE: 'REVERT_ENTITY_UPDATE'
}

export const patch_entity_actions = create_api_actions(PATCH_ENTITY)

export const entity_actions = {
  update_entity_property: ({
    base_uri,
    property_name,
    value,
    previous_value
  }) => ({
    type: entity_action_types.UPDATE_ENTITY_PROPERTY,
    payload: { base_uri, property_name, value, previous_value }
  }),

  revert_entity_update: ({ base_uri, property_name, previous_value }) => ({
    type: entity_action_types.REVERT_ENTITY_UPDATE,
    payload: { base_uri, property_name, previous_value }
  })
}
