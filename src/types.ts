
import {ScenarioApi} from './api'
import {DnaInstance} from './instance'

export type ScenarioFnCustom = (s: object, ins: {[id: string]: any}) => Promise<any>
export type ScenarioFn = (s: ScenarioApi, ins: {[id: string]: DnaInstance}) => Promise<any>


export type AgentConfig = {
  id: string,
  name: string,
}

export interface DnaConfig {
  path: string,
  id: string,
  hash?: string,
}

export type InstanceConfig = {
  id: string
  agent: AgentConfig
  dna: DnaConfig
}

export type BridgeConfig = {
  handle: string
  caller_id: string
  callee_id: string
}

export type DpkiConfig = {
  instance_id: string,
  init_params: any,
}
