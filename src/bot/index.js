import { join } from 'path'
import { readdirSync, readFileSync } from 'fs'

import { reduce, forEach, find, isNull } from 'lodash'
import ejs from 'ejs'
import cheerio from 'cheerio'
import request from 'request-promise'
import TelegramBot from 'node-telegram-bot-api'

import utils from './utils'

/**
 * Класс для работы с телеграммом
 */
export default class Bot {
  /**
   * @param  {Object} config
   * @param  {Object} logger
   * @return {undefined}
   */
  constructor(config, logger, db) {
    this.isProduction = config.get('isProduction')
    this.config = config.get('bot')
    this.log = logger.child({ component: 'bot' })
    this.bot = new TelegramBot(this.config.token, this.config.options)
    this.db = db
    // биндим контекст для utils
    this.utils = reduce(utils, (result, value, key) => {
      return {
        ...result,
        [key]: value.bind(this)
      }
    }, {})
    this.messageFormat = {
      htmlWithoutPreview: {
        disable_web_page_preview: true,
        parse_mode: 'HTML'
      }
    }

    this.loadTemplates()
    this.bindingMethods()
    this.addListeners()
  }

  loadTemplates() {
    const templatesPath = `${__dirname}/templates`
    const list = readdirSync(templatesPath)

    const templates = reduce(list, (result, value) => {
      const templateName = value.substr(0, value.lastIndexOf('.'))
      return {
        ...result,
        [templateName]: readFileSync(join(templatesPath, value)).toString()
      }
    }, {})

    this.templates = templates
  }

  /**
   * @return {undefined}
   */
  bindingMethods() {
    if (!this.isProduction) {
      this.sandbox = this.sandbox.bind(this)
    }

    this.logReceivedMessage = this.logReceivedMessage.bind(this)
    this.checkUserExist = this.checkUserExist.bind(this)
    this.sendChatsList = this.sendChatsList.bind(this)
    this.sendHelpInfo = this.sendHelpInfo.bind(this)
    this.sendCurrencyList = this.sendCurrencyList.bind(this)
    this.sendChangelog = this.sendChangelog.bind(this)
    this.sendUpworkStatus = this.sendUpworkStatus.bind(this)
    this.updateUserChatRate = this.updateUserChatRate.bind(this)
  }

  /**
   * @return {undefined}
   */
  addListeners() {
    if (!this.isProduction) {
      this.bot.onText(/.*/, this.sandbox)
    }

    // REVIEW: Нормально ли вешать пару методов на одно и тоже совпадение?
    this.bot.onText(/.*/, this.logReceivedMessage)
    this.bot.onText(/.*/, this.checkUserExist)
    this.bot.onText(/^\/chats(@\w+)?$/, this.sendChatsList)
    this.bot.onText(/^\/help(@\w+)?$/, this.sendHelpInfo)
    this.bot.onText(/^\/currency(@\w+)?$/, this.sendCurrencyList)
    this.bot.onText(/^\/changelog(@\w+)?$/, this.sendChangelog)
    this.bot.onText(/^\/upwork(@\w+)?$/, this.sendUpworkStatus)
    this.bot.onText(/^\/(up|down)(?:@\w+)?(?: +@(\w+))?$/, this.updateUserChatRate)
    this.bot.onText(/^([\+]{1,2}|[\-]{1,2})(?: +@(\w+))?$/, this.updateUserChatRate)
  }

  logReceivedMessage(message /* , match */) {
    this.utils.logReceivedMessage(message)
  }

  /**
   * Песочница.
   *
   * Работает только для development окружения.
   *
   * @param  {Object} message
   * @param  {Object} match
   * @return {undefined}
   */
  sandbox(message /* , match */) {

  }

  /**
   * Следит за актуальностью данных в коллекции участников.
   *
   * Если участника не существует то он будет добавлен.
   * Если существует – обновлен.
   *
   * @param  {Object} message
   * @param  {Object} match
   * @return {undefined}
   */
  checkUserExist(message /* , match */) {
    const user = this.utils.convertSenderToUserFromMessage(message)
    const query = { userId: user.userId }
    const update = { $set: user }
    const options = { upsert: true }
    const callback = this.utils.docUpdatedHandler(user)

    this.db.users.update(query, update, options, callback)
  }

  /**
   * Отдает список чатов.
   *
   * @param  {Object} message
   * @param  {Array}  match
   * @return {undefined}
   */
  sendChatsList(message /* , match */) {
    const chatId = message.chat.id
    const text = ejs.render(this.templates.chatsList)
    const format = this.messageFormat.htmlWithoutPreview

    this.bot.sendMessage(chatId, text, format)
  }

  /**
   * Отправлет список всех команд бота.
   *
   * @param  {Object} message
   * @param  {Array}  match
   * @return {undefined}
   */
  sendHelpInfo(message /* , match */) {
    const chatId = message.chat.id
    const text = ejs.render(this.templates.helpInfo)
    const format = this.messageFormat.htmlWithoutPreview

    this.bot.sendMessage(chatId, text, format)
  }

  /**
   * Отправлет текущий changelog проекта
   *
   * @param  {Object} message
   * @param  {Array}  match
   * @return {undefined}
   */
  sendChangelog(message /* , match */) {
    const chatId = message.chat.id
    const text = ejs.render(this.templates.changelog)
    const format = this.messageFormat.htmlWithoutPreview

    this.bot.sendMessage(chatId, text, format)
  }

  // TODO: Добавь описание метода.
  sendCurrencyList(message /* , match */) {
    const chatId = message.chat.id
    const template = ejs.compile(this.templates.currencyList)
    const format = this.messageFormat.htmlWithoutPreview

    const requestOptions = {
      uri: this.config.currency.uri,
      encoding: 'binary'
    }

    request(requestOptions)
      .then(this.utils.convertBinaryToString)
      .then(this.utils.parseXmlStringToJson)
      .then(this.utils.prepareCurrencyList)
      .then((valutes) => {
        const text = template({ valutes })
        this.bot.sendMessage(chatId, text, format)
      })
      .catch(err => this.log.error(err))
  }

  sendUpworkStatus(message, /* , match */) {
    const chatId = message.chat.id
    const template = ejs.compile(this.templates.upworkStatus)
    const format = this.messageFormat.htmlWithoutPreview
    const upworkStatusUri = this.config.upwork.statusUri

    const requestOptions = {
      uri: upworkStatusUri,
      transform: body => cheerio.load(body)
    }

    request(requestOptions)
      .then(this.utils.checkUpworkIsAlive)
      .then((upworkIsAlive) => {
        const text = template({ upworkIsAlive, upworkStatusUri })
        this.bot.sendMessage(chatId, text, format)
      })
      .catch(err => {
        console.log('AAAA');
        this.log.error(err)
      })
  }

  /**
   * Изменяет значение кармы участника.
   *
   * @param  {Object} message
   * @param  {Array}  match
   * @return {undefined}
   */
  updateUserChatRate(message, match) {
    const template = ejs.compile(this.templates.updateUserChatRate)
    const format = this.messageFormat.htmlWithoutPreview

    const isReply = this.utils.checkIsReply(message)

    const chatId = message.chat.id
    const voterId = message.from.id
    const direction = match[1]
    const pretenderId = isReply ? message.reply_to_message.from.id : null
    const pretenderUsername = !isReply ? match[2] : null

    if (!isReply && !pretenderUsername) {
      return
    }

    const isRateUp = this.utils.isRateUpAlias(direction)
    const sign = isRateUp ? 1 : -1

    const queryGetVoter = { userId: voterId }
    const queryGetPretender = !isNull(pretenderId) ?
      { userId: pretenderId } :
      { username: pretenderUsername }

    const promiseInputData = {
      template,
      format,
      queryGetVoter,
      queryGetPretender,
      isRateUp,
      chatId
    }

    Promise.resolve(promiseInputData)
      .then(this.utils.getVoter)
      .then(this.utils.getPretender)
      .then(this.utils.detectRateBooster)
      .then(this.utils.prepareUserChatRate)
      .then(this.utils.updateUserChatRate)
      .then(this.utils.sendUpdatedChatRate)
      .catch((err) => {
        return this.utils.catchUpdateUserChatRateErrors({
          err,
          chatId,
          template,
          format
        })
      })
  }
}
