import Bottle from 'bottlejs'

import config from './config'
import Logger from './logger'
import Db from './db'
import Bot from './bot'

const bottle = new Bottle()

bottle.service('Config', config)
bottle.service('Logger', Logger, 'Config')
bottle.service('Db', Db, 'Config')
bottle.service('Bot', Bot, 'Config', 'Logger', 'Db')

const {
  Logger: log,
  Db: db,
  Bot: bot // eslint-disable-line no-unused-vars
} = bottle.container

process.on('SIGINT', () => {
  log.info('Recieve SIGINT')

  db.close(() => {
    log.info('Database has closed')
  })
})
