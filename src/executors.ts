import * as colors from 'colors'

import {ScenarioFn, ScenarioFnCustom} from './types'


export const simpleDescription = (next, f, desc) => {
  console.log(colors.yellow(`§`), colors.yellow.underline(`desc`))
  next(f)
}

export const tapeExecutor = tape => (next, f, desc) => new Promise((resolve, reject) => {
  if (f.length !== 3) {
    reject("tapeMiddleware requires scenario functions to take 3 arguments, please check your scenario definitions.")
  }
  tape(desc, t => {
    next((s, ins) => f(s, t, ins))
    .catch((err) => {
      try {
        // Include stack trace from actual test function, but all on one line.
        // This is the best we can do for now without messing with tape internals
        t.fail(err.stack)
      } catch (e) {
        t.fail(err)
      }
    })
    .then(() => {
      t.end()
      resolve()
    })
  })
})

/**
 * Middleware to retrofit each instance with a `callSync` method
 */
export const callSyncMiddleware = (next, f, desc) => next((s, ins) => {
  // callSync "polyfill"
  Object.values(ins).forEach((i: any) => {
    i.callSync = async (...args) => {
        const ret = await i.call(...args)
        await s.consistent()
        return ret
    }
  })
  return f(s, ins)
})

/**
 * Middleware to retrofit each instance with an `agentId` member,
 * equivalent to the `agentAddress`
 */
export const agentIdMiddleware = (next, f, desc) => next((s, ins) => {
    // agentId "polyfill"
  Object.values(ins).forEach((i: any) => {
    i.agentId = i.agentAddress
  })
  return f(s, ins)
})


export const combine = (...ms) => async (next, f, desc) => {
  let g = f
  for (const m of ms) {
    const g = await new Promise(next => m(next, g, desc))
  }
  return g
}
