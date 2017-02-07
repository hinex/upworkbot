'use strict'

// REVIEW: Не нашел как сделать лучше
Promise = require('bluebird')
Promise.longStackTraces()
global.Promise = Promise

const isProduction = process.env.NODE_ENV === 'production'
const nodePath = process.env.NODE_PATH
const entryPoint = `./${nodePath}/index`

if (!isProduction) {
  const PrettyError = require('pretty-error')
  const pe = new PrettyError()

  pe
    .skipNodeFiles()
    .skipPackage(
      'babylon',
      'babel-core',
      'babel-traverse'
    )
    .start()
}

module.exports = require(entryPoint)
