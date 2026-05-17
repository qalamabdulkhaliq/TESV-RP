const path = require('path')
const { signFile } = require('../sign-gamemode')

class SignGamemodePlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tapAsync('SignGamemodePlugin', (compilation, callback) => {
      const outputPath = path.resolve(__dirname, '..', 'gamemode.js')
      if (require('fs').existsSync(outputPath)) {
        signFile(outputPath)
      }
      callback()
    })
  }
}

module.exports = {
  mode: 'development',
  target: 'node',
  entry: './index.js',
  output: {
    path: path.resolve(__dirname, '..'),
    filename: 'gamemode.js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    fs: 'commonjs fs',
    path: 'commonjs path',
  },
  devtool: 'source-map',
  plugins: [new SignGamemodePlugin()],
}
