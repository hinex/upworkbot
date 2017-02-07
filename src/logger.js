import bunyan from 'bunyan'

export default function (config) {
  return bunyan.createLogger(config.get('logger'))
}
