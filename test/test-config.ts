import {Config} from '../src/config'

// mock out the effectful bits
Config.getDnaHash = async (path) => 'fakednahash'
Config.getInterfacePort = () => 9000

import * as test from 'tape'

const persistencePath = 'path/to/persistence'

const [aliceConfig, bobConfig] = ['alice', 'bob'].map(name => ({
  agent: Config.agent(name),
  dna: Config.dna(name),
  id: name
}))

const expectedJsonConfig = {
  agents: [
    Config.agent('alice'),
    Config.agent('bob'),
  ],
  dnas: [
    {id: 'alice', file: 'alice', hash: 'fakednahash'},
    {id: 'bob', file: 'bob', hash: 'fakednahash'},
  ],
  instances: [
    {id: 'alice', agent: 'alice', dna: 'alice', storage: { type: 'file', path: 'path/to/persistence/alice'}},
    {id: 'bob', agent: 'bob', dna: 'bob', storage: { type: 'file', path: 'path/to/persistence/bob'}},
  ],
  interfaces: [{
    id: 'diorama-interface',
    driver: {
      type: 'websocket',
      port: 9000,
    },
    instances: [
      {id: 'alice'},
      {id: 'bob'},
    ]
  }],
  signals: {
    trace: false,
    consistency: true,
  }
}

test("test config json generation", async t => {
  const instanceConfigs = [aliceConfig, bobConfig]
  const bridgeConfigs = [
    Config.bridge('bridge', 'alice', 'bob')
  ]
  const config = await Config.genJsonConfig({
    persistencePath,
    instanceConfigs,
    bridgeConfigs,
  })

  t.deepEqual(config, expectedJsonConfig)
  t.end()
})

test("test config toml generation", async t => {
  const instanceConfigs = [aliceConfig, bobConfig]
  const bridgeConfigs = [Config.bridge('bridge', 'alice', 'bob')]
  const toml = await Config.genConfig({
    persistencePath,
    instanceConfigs,
    bridgeConfigs,
    debugLog: false
  })
  t.ok(toml.includes('[agents]'))
  t.ok(toml.includes('[logger]'))
  t.end()
})

test("test config json generation with dpki", async t => {
  const instanceConfigs = [aliceConfig, bobConfig]
  const bridgeConfigs = [
    Config.bridge('bridge', 'alice', 'bob')
  ]
  const dpkiConfig = Config.dpki('alice', {some: 'params'})
  const config = await Config.genJsonConfig({
    persistencePath,
    instanceConfigs,
    bridgeConfigs,
    dpkiConfig
  })

  const expected = Object.assign(expectedJsonConfig, {
    dpki: {
      instance_id: 'alice',
      init_params: '{"some":"params"}'
    }
  })

  t.deepEqual(config, expected)
  t.end()
})
