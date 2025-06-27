import webpack from 'webpack'
import WebpackDevServer from 'webpack-dev-server'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webpackConfigPath = path.resolve(
  __dirname,
  '../webpack/webpack.dev.babel.mjs'
)

async function startServer() {
  try {
    // Dynamically import webpack config
    const { default: webpackConfig } = await import(webpackConfigPath)

    // Create compiler instance
    const compiler = webpack(webpackConfig)

    // Configure server
    const devServerOptions = {
      hot: true,
      host: 'localhost',
      port: 8081,
      historyApiFallback: {
        rewrites: [{ from: /./, to: '/index.html' }]
      },
      static: {
        directory: path.join(process.cwd(), 'static')
      },
      client: {
        logging: 'info'
      }
    }

    const server = new WebpackDevServer(devServerOptions, compiler)

    // Start server
    await server.start()
    console.log('Dev server is running on port 8081')
  } catch (error) {
    console.error('Failed to start dev server:', error)
    process.exit(1)
  }
}

startServer()
