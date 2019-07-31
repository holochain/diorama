const tape = require('tape')
const colors = require('colors/safe')

import * as _ from 'lodash'

import {connect} from '@holochain/hc-web-client'
import {Waiter, FullSyncNetwork, NodeId, NetworkMap, Signal} from '@holochain/hachiko'
import {InstanceConfig, BridgeConfig} from './types'
import {Conductor} from './conductor'
import {DpkiConfig, Config} from './config'
import {ScenarioApi} from './api'
import {simpleExecutor} from './executors'
import {identity} from './util'
import logger from './logger'

const MAX_RUNS_PER_CONDUCTOR = 1
const MIN_POOL_SIZE = 1

/////////////////////////////////////////////////////////////

type DioramaConstructorParams = {
  instances?: any,
  bridges?: Array<BridgeConfig>,
  dpki?: DpkiConfig,
  middleware?: any,
  executor?: any,
  debugLog?: boolean,
}

export const DioramaClass = Conductor => class Diorama {
  instanceConfigs: Array<InstanceConfig>
  bridgeConfigs: Array<BridgeConfig>
  conductor: Conductor
  dpkiConfig?: DpkiConfig
  scenarios: Array<any>
  middleware?: any
  executor?: any
  conductorOpts?: any
  waiter: Waiter

  // config public interface, defined outside of this class
  static dna: any
  static dpki: any
  static bridge: any

  constructor ({bridges = [], instances = {}, dpki, middleware = identity, executor = simpleExecutor, debugLog = false}: DioramaConstructorParams) {
    this.bridgeConfigs = bridges
    this.dpkiConfig = dpki
    this.middleware = middleware
    this.executor = executor
    this.conductorOpts = {debugLog}

    this.scenarios = []
    this.instanceConfigs = []

    Object.entries(instances).forEach(([agentId, dnaConfig]) => {
      logger.debug('agentId', agentId)
      logger.debug('dnaConfig', dnaConfig)
      const instanceConfig = makeInstanceConfig(agentId, dnaConfig)
      const id = instanceConfig.id
      this.instanceConfigs.push(instanceConfig)
    })

    this.registerScenario.only = this.registerScenarioOnly.bind(this)

    this.refreshWaiter()
  }

  onSignal (msg: {signal, instance_id: string}) {
    if (msg.signal.signal_type === 'Consistency') {
      // XXX, NB, this '-' magic is because of the nonced instance IDs
      // TODO: deal with this more reasonably
      const ix = msg.instance_id.lastIndexOf('-')
      const node = msg.instance_id.substring(0, ix)
      const signal = stringifySignal(msg.signal)
      const instanceConfig = this.instanceConfigs.find(c => c.id === node)
      if (!instanceConfig) {
        throw new Error(`Got a signal from a not-configured instance! id: ${node}`)
      }
      const dnaId = instanceConfig.dna.id
      this.waiter.handleObservation({node, signal, dna: dnaId})
    }
  }

  _newConductor (): Conductor {
    return new Conductor(connect, {onSignal: this.onSignal.bind(this), ...this.conductorOpts})
  }

  /**
   * scenario takes (s, instances)
   */
  registerScenario: any = (desc, scenario) => {
    const execute = () => this.executor(
      this.runScenario,
      scenario,
      desc
    )
    this.scenarios.push([desc, execute, false])
  }

  registerScenarioOnly = (desc, scenario) => {
    const execute = () => this.executor(
      this.runScenario,
      scenario,
      desc
    )
    this.scenarios.push([desc, execute, true])
  }

  runScenario = async scenario => {
    await this.refreshWaiter()
    const modifiedScenario = this.middleware(scenario)

    const conductor = this._newConductor()
    await conductor.run(this.instanceConfigs, this.bridgeConfigs, (instanceMap) => {
      const api = new ScenarioApi(this.waiter)
      return modifiedScenario(api, instanceMap)
    })
    await conductor.kill()
  }

  refreshWaiter = () => new Promise(resolve => {
    if (this.waiter) {
      logger.info("Test over, waiting for Waiter to flush...")
      this.waiter.registerCallback({nodes: null, resolve})
    } else {
      resolve()
    }
  }).then(() => {
    const networkModels: NetworkMap = _.chain(this.instanceConfigs)
      .map(i => ({
        id: i.id,
        dna: i.dna.id,
      }))
      .groupBy(n => n.dna)
      .mapValues(ns => new FullSyncNetwork(ns.map(n => n.id)))
      .value()
    this.waiter = new Waiter(networkModels)
  })

  run = async () => {
    const onlyTests = this.scenarios.filter(([desc, execute, only]) => only)

    if (onlyTests.length > 0) {
      logger.warn(`.only was invoked, only running ${onlyTests.length} test(s)!`)
      for (const [desc, execute, _] of onlyTests) {
        await execute()
      }
    } else {
      for (const [desc, execute, _] of this.scenarios) {
        await execute()
      }
    }
  }

  close = () => {

  }
}


export const Diorama = DioramaClass(Conductor)

Diorama.dna = Config.dna
Diorama.bridge = Config.bridge
Diorama.dpki = (name, initParams): DpkiConfig => ({name, initParams})


const makeInstanceConfig = (agentId, dnaConfig) => {
  return {
    id: agentId,
    agent: {
      id: agentId,
      name: agentId,
    },
    dna: dnaConfig
  }
}

const stringifySignal = orig => {
  const signal = Object.assign({}, orig)
  signal.event = JSON.stringify(signal.event)
  signal.pending = signal.pending.map(p => (p.event = JSON.stringify(p.event), p))
  return signal
}
