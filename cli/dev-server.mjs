import webpack from 'webpack'
import WebpackDevServer from 'webpack-dev-server'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webpackConfigPath = path.resolve(
  __dirname,
  '../webpack/webpack.dev.babel.mjs'
)

async function start_dev_server() {
  try {
    // Dynamically import webpack config
    const { default: webpackConfig } = await import(webpackConfigPath)

    // Create compiler instance
    const compiler = webpack(webpackConfig)

    // Configure server
    const devServerOptions = {
      hot: true,
      host: 'localhost',
      port: 8090,
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
    console.log('Dev server is running on port 8090')

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down dev server...')
      await server.stop()
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  } catch (error) {
    console.error('Failed to start dev server:', error)
    process.exit(1)
  }
}

start_dev_server()
