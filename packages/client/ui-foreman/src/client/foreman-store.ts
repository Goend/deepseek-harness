/**
 * Per-conversation Foreman view store. The org-chart tab is a session-scope
 * slot, so the framework instantiates this factory once per conversation and
 * suffixes the persistence key with the session id: each conversation keeps
 * its own Foreman token/endpoint and can therefore act as a different worker.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import { DEFAULT_FOREMAN_URL, type ForemanConnection } from '../foreman-settings.ts'

/** Foreman view state persisted per conversation. */
export interface ForemanViewState {
  connection: ForemanConnection
  /** True once this conversation has saved its own connection; false means use the global last-used settings. */
  seeded: boolean
}

/** Annotation twin of the actions literal below. */
type ForemanViewActions = {
  setConnection: (draft: ForemanViewState, connection: ForemanConnection) => void
}

/**
 * Create the per-session Foreman connection store handle.
 * @returns the store handle; register the factory itself (exclusive use).
 */
export function createForemanStore(): EngineStoreHandle<ForemanViewState, ForemanViewActions> {
  return defineStore({
    init: (): ForemanViewState => ({
      connection: { url: DEFAULT_FOREMAN_URL, token: '' },
      seeded: false,
    }),
    persist: 'dsh.foreman.view.v1',
    actions: {
      setConnection: (draft, connection) => {
        draft.connection = connection
        draft.seeded = true
      },
    },
  })
}
