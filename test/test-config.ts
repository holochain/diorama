import {Config} from '../src/config'

// mock out the effectful bits
Config.getDnaHash = (path) => 'fakednahash'
Config.getInterfacePort = () => 9000

import * as test from 'tape'

const [aliceConfig, bobConfig] = ['alice', 'bob'].map(name => ({
  id: name,
  agent: Config.agent(name),
  dna: Config.dna(name),
}))

const expectedJsonConfig = {
  agents: [
    {id: 'alice', name: 'alice'},
    {id: 'bob', name: 'bob'},
  ],
  dnas: [
    {id: 'alice', path: 'alice', hash: 'fakednahash'},
    {id: 'bob', path: 'bob', hash: 'fakednahash'},
  ],
  instances: [
    {id: 'alice', agent_id: 'alice', dna_id: 'alice'},
    {id: 'bob', agent_id: 'bob', dna_id: 'bob'},
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
  const instances = [aliceConfig, bobConfig]
  const bridges = [
    Config.bridge('bridge', 'alice', 'bob')
  ]
  const config = await Config.genJsonConfig('path/to/persistence', instances, bridges, false)

  t.deepEqual(config, expectedJsonConfig)
  t.end()
})

test("test config toml generation", async t => {
  const instances = [aliceConfig, bobConfig]
  const bridges = [Config.bridge('bridge', 'alice', 'bob')]
  const toml = await Config.genConfig('path/to/persistence', instances, bridges, false)
  t.ok(toml.includes('[logger]'))
  t.end()
})
