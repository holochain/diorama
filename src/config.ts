const child_process = require('child_process')
const json2toml = require('json2toml')
const getPort = require('get-port')

interface DnaConfig {
  path: string,
  id: string,
  hash?: string,
}

export const Config = {
  agent: id => ({ name: id, id }),
  dna: (path, id = `${path}`): DnaConfig => ({ path, id }),
  bridge: (handle, caller, callee) => ({
    handle,
    caller_id: caller.name,
    callee_id: callee.name
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

  async genJsonConfig (persistencePath, instanceConfigs, bridgeConfigs, debugLog) {
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

  async genConfig (persistencePath, instanceConfigs, bridgeConfigs, debugLog) {

    const config = this.genJsonConfig(persistencePath, instanceConfigs, bridgeConfigs, debugLog)

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
  exclude = ${debugLog ? 'false' : 'true'}
  pattern = ".*"
`
    return toml

  }
}
