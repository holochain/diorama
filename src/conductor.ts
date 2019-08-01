const child_process = require('child_process')
const del = require('del')
const fs = require('fs')
const os = require('os')
const path = require('path')
const getPort = require('get-port')

const colors = require('colors/safe')

import {Signal} from '@holochain/hachiko'
import {promiseSerial, delay} from './util'
import {InstanceConfig} from './types'
import {Config} from './config'
import {DnaInstance} from './instance'
import logger from './logger'

/// //////////////////////////////////////////////////////////

// these should be already set when the conductor is started by `hc test`
const wsUrl = port => `ws://localhost:${port}`
const ADMIN_INTERFACE_ID = 'admin-interface'

const DEFAULT_ZOME_CALL_TIMEOUT = 60000

type ConductorOpts = {
  onSignal: (Signal) => void,
  debugLog: boolean,
  zomeCallTimeout?: number,
}

const storagePath = () => process.env.DIORAMA_STORAGE || fs.mkdtempSync(path.join(os.tmpdir(), 'hc-diorama-'))

/**
 * Represents a conductor process to which calls can be made via RPC
 *
 * @class      Conductor (name)
 */
export class Conductor {

  webClientConnect: any
  agentIds: Set<string>
  dnaIds: Set<string>
  instanceMap: {[name: string]: DnaInstance}
  opts: any
  callAdmin: any
  handle: any
  dnaNonce: number
  onSignal: (any) => void

  runningInstances: Array<InstanceConfig>
  callZome: any
  interfacePort: number

  isInitialized: boolean

  constructor (connect, opts: ConductorOpts) {
    this.webClientConnect = connect
    this.agentIds = new Set()
    this.dnaIds = new Set()
    this.instanceMap = {}
    this.opts = opts
    this.handle = null
    this.onSignal = opts.onSignal
  }

  testInterfaceUrl = () => `ws://localhost:${this.interfacePort}`
  testInterfaceId = 'diorama-interface'

  connectClient = async () => {
    const url = this.testInterfaceUrl()
    const { callZome, onSignal } = await this.webClientConnect({url})
    this.callZome = (...args) => params => new Promise((resolve, reject) => {
      logger.debug(colors.cyan.underline("calling"), ...args)
      logger.debug(params)
      const timeout = this.opts.zomeCallTimeout || DEFAULT_ZOME_CALL_TIMEOUT
      const timer = setTimeout(() => reject(`zome call timed out after ${timeout / 1000} seconds: ${args.join('/')}`), timeout)
      const promise = callZome(...args)(params).then(result => {
        clearTimeout(timer)
        logger.debug(colors.cyan.bold('->'), result)
        resolve(result)
      })
    })

    onSignal((msg: {signal, instance_id: string}) => {
      const instances = Object.keys(this.instanceMap).map(key => this.instanceMap[key])
      const instance = instances.find(instance => instance.id == msg.instance_id)
      if(instance) {
        instance.signals.push(msg.signal)
      }
    })
  }

  initialize = async ({instanceConfigs, bridgeConfigs, dpkiConfig}) => {
    if (!this.isInitialized) {
      await this.spawn({instanceConfigs, bridgeConfigs, dpkiConfig})
      this.interfacePort = await getPort()
      await this.connectClient()
      this.isInitialized = true
    }
  }

  teardown = () => {
    logger.warn("no teardown")
  }

  cleanupStorage = async () => await del([
    path.join(storagePath(), 'storage'),
    path.join(storagePath(), 'dna'),
  ])

  run = async ({instanceConfigs, bridgeConfigs, dpkiConfig}, fn) => {
    logger.debug('')
    logger.debug('')
    logger.debug("---------------------------------------------------------")
    logger.debug("---------------------------------------------------------")
    logger.debug("-------  starting")
    logger.debug('')
    logger.debug('')
    try {
      await this.initialize({instanceConfigs, bridgeConfigs, dpkiConfig})
    } catch (e) {
      this.abort(e)
    }
    logger.debug("Instances all set up, running test...")
    try {
      await fn(this.instanceMap)
    } catch (e) {
      this.failTest(e)
    }

    try {
      await this.teardown()
      // await this.cleanupStorage()
    } catch (e) {
      this.abort(e)
    }
    logger.debug("Test done.")
  }

  spawn ({instanceConfigs, bridgeConfigs, dpkiConfig}) {
    const tmpPath = storagePath()
    const configPath = path.join(tmpPath, 'conductor-config.toml')
    const persistencePath = tmpPath
    const config = Config.genConfig({
      persistencePath,
      instanceConfigs,
      bridgeConfigs,
      dpkiConfig,
      debugLog: this.opts.debugLog,
    })
    fs.writeFileSync(configPath, config)
    logger.info(`Using config file at ${configPath}`)
    try {
      const which = child_process.execSync('which holochain')
      logger.info(`Using holochain binary at ${which.toString('utf8')}`)
    } catch (e) {}

    const handle = child_process.spawn(`holochain`, ['-c', configPath])

    handle.stdout.on('data', data => {
      const line = data.toString('utf8')
      logger.info(`[C] %s`, line)
    })
    handle.stderr.on('data', data => logger.error(`!C! %s`, data.toString('utf8')))
    handle.on('close', code => logger.info(`conductor exited with code ${code}`))
    this.handle = handle
  }

  kill () {
    this.handle.kill()
  }

  abort (msg) {
    logger.error(`Test conductor aborted: %j`, msg)
    this.kill()
    process.exit(-1)
  }

  failTest (e) {
    logger.error("Test failed while running: %j", e)
    throw e
  }

}
