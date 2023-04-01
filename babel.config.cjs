module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        modules: false
      }
    ],
    '@babel/preset-react'
  ],
  plugins: [
    // aliases
    [
      require('babel-plugin-module-resolver'),
      {
        root: ['./'],
        alias: {
          '@views': './client/views',
          '@pages': './client/views/pages',
          '@core': './client/core',
          '@components': './client/views/components',
          '@styles': './client/styles',
          '@config': './config.mjs',
          '@common': './common'
        }
      }
    ],
    ['@babel/plugin-proposal-class-properties']
  ]
}
