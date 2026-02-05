// Important modules this config uses
import path from 'path'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import webpack from 'webpack'
import CompressionPlugin from 'compression-webpack-plugin'
import config from '#config'

import base from './webpack.base.babel.mjs'
import BundleManifestPlugin from './bundle-manifest-plugin.mjs'

export default base({
  mode: 'production',

  // In production, we skip all hot-reloading stuff
  entry: [path.join(process.cwd(), 'client/index.js')],

  // Utilize long-term caching by adding content hashes (not compilation hashes) to compiled assets
  output: {
    filename: '[name].[chunkhash].js',
    chunkFilename: '[name].[chunkhash].chunk.js'
  },

  optimization: {
    nodeEnv: 'production',
    sideEffects: true,
    concatenateModules: true,
    runtimeChunk: 'single',
    splitChunks: {
      chunks: 'all',
      maxInitialRequests: 10,
      minSize: 0,
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name(module) {
            const packageName = module.context.match(
              /[\\/]node_modules[\\/](.*?)([\\/]|$)/
            )[1]
            return `npm.${packageName.replace('@', '')}`
          }
        }
      }
    }
  },

  plugins: (() => {
    // Validate that paths are configured (no hardcoded fallbacks)
    const user_base_dir =
      process.env.USER_BASE_DIRECTORY || config.user_base_directory
    const system_base_dir =
      process.env.SYSTEM_BASE_DIRECTORY || config.system_base_directory

    if (!user_base_dir) {
      throw new Error(
        'user_base_directory must be set in config or USER_BASE_DIRECTORY env var'
      )
    }
    if (!system_base_dir) {
      throw new Error(
        'system_base_directory must be set in config or SYSTEM_BASE_DIRECTORY env var'
      )
    }

    return [
      // Minify and optimize the index.html
      new HtmlWebpackPlugin({
        template: 'client/index.html',
        favicon: 'static/favicon.ico',
        scriptLoading: 'defer',
        minify: {
          removeComments: true,
          collapseWhitespace: true,
          removeRedundantAttributes: true,
          useShortDoctype: true,
          removeEmptyAttributes: true,
          removeStyleLinkTypeAttributes: true,
          keepClosingSlash: true,
          minifyJS: true,
          minifyCSS: true,
          minifyURLs: true
        },
        inject: true
      }),

      new CompressionPlugin({
        algorithm: 'gzip',
        test: /\.js$|\.css$|\.html$/,
        threshold: 10240,
        minRatio: 0.8
      }),

      new webpack.DefinePlugin({
        IS_DEV: false,
        USER_BASE_DIRECTORY: JSON.stringify(user_base_dir),
        SYSTEM_BASE_DIRECTORY: JSON.stringify(system_base_dir)
      }),

      // Generate bundle manifest for server-side rendering
      new BundleManifestPlugin({
        filename: 'bundle-manifest.json'
      })
    ]
  })(),

  performance: {
    assetFilter: (assetFilename) =>
      !/(\.map$)|(^(main\.|favicon\.))/.test(assetFilename)
  }
})
