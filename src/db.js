import Promise from 'bluebird'
import mongoskin from 'mongoskin'
import {
  keys,
  isFunction
} from 'lodash'

keys(mongoskin).forEach(key => {
  const value = mongoskin[key]

  if (isFunction(value)) {
    Promise.promisifyAll(value)
    Promise.promisifyAll(value.prototype)
  }
})

Promise.promisifyAll(mongoskin)

export default function (config) {
  const { url, options } = config.get('db')
  const db = mongoskin.db(url, options)

  db.bind('users')

  db.users.createIndex({ userId: 1, username: 1 }, { unique: true })

  return db
}
