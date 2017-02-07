/**
 * Зависимости.
 */
import { Buffer } from 'buffer'

import {
  filter,
  find,
  includes,
  indexOf,
  isEqual,
  isNull,
  map,
  round
} from 'lodash'
import { Iconv } from 'iconv'
import { parseString } from 'xml2js'

/**
 * Помогает логировать действия участников.
 *
 * @param  {object} message
 * @return {undefined}
 */
function logReceivedMessage(recievedMessage) {
  const { log } = this
  const { from, chat, text } = recievedMessage
  const logMessage =
    `'${from.username}' (${from.id}) sent '${text}' ` +
    `to '${chat.title}' (${chat.id})`

  log.trace(logMessage)
}

/**
 * Преобразует автора сообщения в наш формат участника.
 *
 * Используется при сохранении участника в базу.
 *
 * @param  {Object} sender
 * @return {Object} user
 */
function convertSenderToUserFromMessage({ from: sender }) {
  return {
    userId: sender.id,
    firstName: sender.first_name,
    lastName: sender.last_name,
    username: sender.username,
  }
}

/**
 * Сообщает об обновлении документа в базе.
 *
 * @param  {object} data – документ который записывали
 * @return {function} mongo update callback function
 */
function docUpdatedHandler(data) {
  const { log } = this

  return (err, { result }) => {
    if (err) {
      log.error(err)
      return
    }

    if (result.nModified > 0) {
      log.trace('Document updated', data)
    }
  }
}

/**
 * Узнает используется ли используемый псевдоним для подъема рейтинга (кармы).
 *
 * @param  {String}  alias
 * @return {Boolean}
 */
function isRateUpAlias(alias) {
  const aliases = ['+', '++', 'up']

  return includes(aliases, alias)
}

/**
 * Конвертит бинарные данные в указанную кодировку.
 *
 * Используется для конвертации из windows-1251 -> utf8 данных от cbr.ru.
 *
 * @param  {Object} raw
 * @param  {String} inputEncoding
 * @param  {String} outputEncoding
 * @return {Promise}
 */
function convertBinaryToString(
  raw,
  inputEncoding = 'windows-1251',
  outputEncoding = 'utf8'
) {
  // TODO: Прочекай могут ли тут возникать ошибки (try catch?)
  const body = new Buffer(raw, 'binary')
  const conv = new Iconv(inputEncoding, outputEncoding)

  return conv.convert(body).toString()
}

/**
 * Возвращает обещание результатом которого
 * распарсенный xml в json.
 *
 * @param  {String} xml
 * @return {Promise}
 */
function parseXmlStringToJson(xml) {
  const handler = (resolve, reject) => {
    parseString(xml, (err, json) => {
      if (err) {
        reject(err)
        return
      }

      resolve(json)
    })
  }

  return new Promise(handler)
    .then(json => json)
    .catch(err => console.log.error(err))
}

function prepareCurrencyList(json) {
  const { config } = this
  const valutesData = json.ValCurs.Valute
  const valutesList = config.currency.list

  const valutesDataFromList = filter(valutesData, (vd) => {
    return find(valutesList, vl => vl === vd.$.ID)
  })

  return map(valutesDataFromList, (vd) => {
    return {
      name: vd.Name,
      value: vd.Value
    }
  })
}

function checkIsReply({ reply_to_message }) {
  return !!reply_to_message
}

function getVoter({
  template,
  format,
  queryGetVoter,
  queryGetPretender,
  chatId,
  isRateUp
}) {
  return new Promise((resolve, reject) => {
    this.db.users.findOne(queryGetVoter, (err, voter) => {
      if (err) {
        reject(err)
        return
      }

      if (!voter) {
        reject(new Error('VOTER_NOT_FOUND'))
      }

      resolve({
        template,
        format,
        voter,
        queryGetPretender,
        chatId,
        isRateUp
      })
    })
  })
}

function getPretender({
  template,
  format,
  voter,
  queryGetPretender,
  chatId,
  isRateUp
}) {
  return new Promise((resolve, reject) => {
    this.db.users.findOne(queryGetPretender, (err, pretender) => {
      if (err) {
        reject(err)
        return
      }

      if (!pretender) {
        reject(new Error('PRETENDER_NOT_FOUND'))
      }

      resolve({
        template,
        format,
        voter,
        pretender,
        chatId,
        isRateUp
      })
    })
  })
}

/**
 * Проверка на кармодрочество.
 *
 * @param  {Array} users
 * @return {Array}
 */

/**
 * Проверка на кармодрочество.
 *
 * @param  {Object|undefined} voter
 * @param  {Object|undefined} pretender
 * @param  {Boolean}          isRateUp
 * @return {Promise}
 */
function detectRateBooster({
  template,
  format,
  voter,
  pretender,
  chatId,
  isRateUp
}) {
  // КАРМАДРОЧЕСТВО ДЕТЕКТЕД!11 ЛОВИТЕ ПИДАРАСА!11
  if (isEqual(voter, pretender)) {
    throw new Error('WANNA_SELF_UP')
  }

  return {
    template,
    format,
    voter,
    pretender,
    chatId,
    isRateUp
  }
}

function prepareUserChatRate({
  template,
  format,
  voter,
  pretender,
  chatId,
  isRateUp
}) {
  const voterChatRate = find(voter.chatsRate, (chr) => {
    return chr.chatId === chatId
  })
  let prevPretenderChatRate = find(pretender.chatsRate, (chr) => {
    return chr.chatId === chatId
  })

  const voterChatRateValue = voterChatRate ?
    voterChatRate.value :
    1
  const prevPretenderChatRateValue = prevPretenderChatRate ?
    prevPretenderChatRate.value :
    1

  if (voterChatRateValue <= 0) {
    throw new Error('VOTER_HAS_NEGATIVE_RATE')
  }

  if (!prevPretenderChatRate) {
    prevPretenderChatRate = {
      chatId,
      value: prevPretenderChatRateValue
    }

    pretender.chatsRate = pretender.chatsRate || []
    pretender.chatsRate.push(prevPretenderChatRate)
  }

  const sign = isRateUp ? 1 : -1
  const voterVoteRatio = Math.pow(voterChatRateValue, 0.5)
  // TODO: -1??? Проверить!11
  const chatRateIndexOf = indexOf(pretender.chatsRate, prevPretenderChatRate)
  const newPretenderChatRateValue = round(
    prevPretenderChatRateValue + ( sign * voterVoteRatio ),
    2
  )

  pretender.chatsRate[chatRateIndexOf].value = newPretenderChatRateValue

  return {
    template,
    format,
    voter,
    pretender,
    chatId,
    isRateUp
  }
}

function updateUserChatRate({
  template,
  format,
  voter,
  pretender,
  chatId,
  isRateUp
}) {
  return new Promise((resolve, reject) => {
    const query = { userId: pretender.userId }
    const update = { $set: { chatsRate: pretender.chatsRate } }
    const options = {}
    const callback = (err, { result }) => {
      if (err) {
        reject(err)
        return
      }

      if (result.nModified > 0) {
        resolve({
          template,
          format,
          voter,
          pretender,
          chatId,
          isRateUp
        })
        return
      }

      // TODO: Придумай что нибудь!
      reject(new Error('SOMETHING_WRONG'))
    }

    this.db.users.update(query, update, options, callback)
  })
}

function sendUpdatedChatRate({
  template,
  format,
  voter,
  pretender,
  chatId,
  isRateUp
}) {
  const voterRate = find(voter.chatsRate, chr => {
    return chr.chatId === chatId
  })
  const pretenderRate = find(pretender.chatsRate, chr => {
    return chr.chatId === chatId
  })
  const event = isRateUp ? 'rateUp' : 'rateDown'
  const data = {
    event,
    voter: {
      name: !isNull(voter.username) ?
        `@${voter.username}` :
        `<b>${(voter.firstName || 'NoName')}</b>`,
      rate: voterRate ? voterRate.value : 1
    },
    pretender: {
      name: !isNull(pretender.username) ?
        `@${pretender.username}` :
        `<b>${(pretender.firstName || 'NoName')}</b>`,
      rate: pretenderRate ? pretenderRate.value : 1
    }
  }
  const text = template(data)
  this.bot.sendMessage(chatId, text, format)
}

function catchUpdateUserChatRateErrors({
  err,
  chatId,
  template,
  format
}) {
  let data, text

  switch(err.message) {
    case 'PRETENDER_NOT_FOUND':
      data = { event: 'pretenderNotFound' }
      text = template(data)
      this.bot.sendMessage(chatId, text, format)
      break

    case 'VOTER_HAS_NEGATIVE_RATE':
      data = { event: 'voterHasNetativeRate' }
      text = template(data)
      this.bot.sendMessage(chatId, text, format)
      break

    case 'WANNA_SELF_UP':
      data = { event: 'selfUp' }
      text = template(data)
      this.bot.sendMessage(chatId, text, format)
      break

    case 'SOMETHING_WRONG':
    default:
      data = { event: 'wrong' }
      text = template(data)
      this.bot.sendMessage(chatId, text, format)
  }

  this.log.error(err)
}

function checkUpworkIsAlive($) {
  const statusText = $('#statusbar_text').text()

  return statusText === 'Upwork is UP';
}

export default {
  logReceivedMessage,
  convertSenderToUserFromMessage,
  docUpdatedHandler,
  isRateUpAlias,
  convertBinaryToString,
  parseXmlStringToJson,
  prepareCurrencyList,
  checkIsReply,
  getVoter,
  getPretender,
  detectRateBooster,
  prepareUserChatRate,
  updateUserChatRate,
  sendUpdatedChatRate,
  catchUpdateUserChatRateErrors,
  checkUpworkIsAlive
}
