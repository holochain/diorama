
export type DnaConfig = { path: string, id: string }
export type DpkiConfig = { dna: DnaConfig, initParams: any }

export const Config = {
  agent: id => ({ name: id, id }),
  dna: (path, id = `${path}`): DnaConfig => ({ path, id }),
  dpki: (dna: DnaConfig, initParams = {}) => ({ dna, initParams }),
  bridge: (handle, caller, callee) => ({
    handle,
    caller_id: caller.name,
    callee_id: callee.name
  }),
  instance: (agent, dna, id = agent.id) => ({
    id,
    agent,
    dna
  })
}
