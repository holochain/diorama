const child_process = require('child_process')
const json2toml = require('json2toml')
const getPort = require('get-port')

import {DnaConfig, InstanceConfig, BridgeConfig, DpkiConfig} from './types'

type GenJsonConfigArgs = {
  persistencePath: string,
  instanceConfigs: Array<InstanceConfig>,
  bridgeConfigs: Array<BridgeConfig>,
  dpkiConfig?: DpkiConfig,
}

/**
 * Minimal helper functions to create pieces of valid Conductor configuration.
 * Some of these are exposed on the Diorama class, which constitue the public interface.
 * This class should not be used directly by the user.
 */
export const Config = {
  agent: id => ({ name: id, id }),

  dna: (path, id = `${path}`, opts = {}): DnaConfig => ({ path, id, ...opts }),

  bridge: (handle, caller, callee) => ({
    handle,
    caller_id: caller.name,
    callee_id: callee.name
  }),

  dpki: (instance_id, init_params): DpkiConfig => ({
    instance_id,
    init_params: JSON.stringify(init_params)
  }),

  instance: (agent, dna, id = agent.id) => ({
    id,
    agent,
    dna
  }),

  getInterfacePort() {
    return getPort()
  },

  getDnaHash (dnaPath) {
    return child_process.exec('hc hash', dnaPath)
  },

  async genJsonConfig ({persistencePath, instanceConfigs, bridgeConfigs, dpkiConfig}: GenJsonConfigArgs) {
    const port = await this.getInterfacePort()
    const config: any = {

      agents: [],

      dnas: [],

      instances: [],

      signals: {
        trace: false,
        consistency: true,
      }
    }

    const iface = {
      id: 'diorama-interface',
      driver: {
        type: 'websocket',
        port: port,
      },
      instances: [] as Array<{id: string}>
    }

    if (dpkiConfig) {
      config.dpki = dpkiConfig
    }

    const agentIds = new Set()
    const dnaIds = new Set()

    for (const instance of instanceConfigs) {
      if (!agentIds.has(instance.agent.id)) {
        config.agents.push(instance.agent)
      }
      if (!dnaIds.has(instance.dna.id)) {
        if (!instance.dna.hash) {
          instance.dna.hash = await this.getDnaHash(instance.dna.path)
        }
        config.dnas.push(instance.dna)
      }
      config.instances.push({
        id: instance.id,
        agent_id: instance.agent.id,
        dna_id: instance.dna.id,
      })
      iface.instances.push({id: instance.id})
    }

    config.interfaces = [iface]

    return config
  },

  async genConfig (args: GenJsonConfigArgs & {debugLog: boolean}) {

    const config = this.genJsonConfig(args)

    const toml = json2toml(config) + `
[logger]
type = "debug"
  [[logger.rules.rules]]
  color = "red"
  exclude = false
  pattern = "^err/"
  [[logger.rules.rules]]
  color = "white"
  exclude = false
  pattern = "^debug/dna"
  [[logger.rules.rules]]
  exclude = ${args.debugLog ? 'false' : 'true'}
  pattern = ".*"
`
    return toml

  }
}
