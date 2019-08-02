const path = require('path')
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const TOML = require('@iarna/toml')
const getPort = require('get-port')

import {AgentConfig, DnaConfig, InstanceConfig, BridgeConfig, DpkiConfig} from './types'

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
  agent: (id): AgentConfig => ({
    id,
    name: id,
    keystore_file: id,
    public_address: id,
    test_agent: true,
  } as AgentConfig),

  dna: (file, id = `${file}`, opts = {}): DnaConfig => ({ file, id, ...opts }),

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

  async getDnaHash (dnaPath) {
    const {stdout, stderr} = await exec('hc hash', dnaPath)
    if (stderr) {
      throw new Error("Error while getting hash: " + stderr)
    }
    const [hash] = stdout.match(/\w{46}/)
    if (!hash) {
      throw new Error("Could not parse hash from `hc hash` output, which follows: " + stdout)
    }
    return hash
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
          instance.dna.hash = await this.getDnaHash(instance.dna.file)
        }
        config.dnas.push(instance.dna)
      }
      config.instances.push({
        id: instance.id,
        agent: instance.agent.id,
        dna: instance.dna.id,
        storage: {
          type: 'file',
          path: path.join(persistencePath, instance.id)
        }
      })
      iface.instances.push({id: instance.id})
    }

    config.interfaces = [iface]

    return config
  },

  async genConfig (args: GenJsonConfigArgs & {debugLog: boolean}) {
    const config = await this.genJsonConfig(args)
    const toml = TOML.stringify(config) + `
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
