export const app_actions = {
  APP_LOAD: 'APP_LOAD',
  APP_LOADED: 'APP_LOADED',

  LOAD_FROM_NEW_KEYPAIR: 'LOAD_FROM_NEW_KEYPAIR',
  LOAD_FROM_PRIVATE_KEY: 'LOAD_FROM_PRIVATE_KEY',
  LOAD_KEYS: 'LOAD_KEYS',

  load: () => ({
    type: app_actions.APP_LOAD
  }),

  loaded: () => ({
    type: app_actions.APP_LOADED
  }),

  load_keys: ({ public_key, private_key }) => ({
    type: app_actions.LOAD_KEYS,
    payload: {
      public_key,
      private_key
    }
  }),

  load_from_new_keypair: ({ public_key, private_key }) => ({
    type: app_actions.LOAD_FROM_NEW_KEYPAIR,
    payload: {
      public_key,
      private_key
    }
  }),

  load_from_private_key: ({ public_key, private_key }) => ({
    type: app_actions.LOAD_FROM_PRIVATE_KEY,
    payload: {
      public_key,
      private_key
    }
  })
}
