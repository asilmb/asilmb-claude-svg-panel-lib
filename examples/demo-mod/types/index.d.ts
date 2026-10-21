// The demo mod's state contract: a small service, watched from a pane.

/** One host's state; the icon of the same name draws it. */
export type DemoHost = 'online' | 'idle' | 'offline' | 'failed'

/** What gets a marker on the requests chart. */
export type DemoMarker = 'deploy' | 'incident'

/** One measurement of the service. */
export type DemoSample = {
  /** Requests per second. */
  rps: number
  /** 95th percentile latency, in milliseconds. */
  p95: number
  /** CPU and memory in use, in percent. */
  cpu: number
  mem: number
  /** Failed requests, in percent. */
  errors: number
}

export type DemoState = {
  /** Oldest first. */
  samples: DemoSample[]
  /** Markers, at the sample where each happened. */
  markers: { step: number; kind: DemoMarker }[]
  hosts: DemoHost[]
  /** Samples left in the open incident; 0 when none is open. */
  incident: number
  /** Samples left while a deploy warms up. */
  warmup: number
}

declare module 'claude-code' {
  interface PluginState {
    'svg-panel-demo': { state: DemoState; theme: 'dark' | 'light'; isLive: boolean }
  }
}
