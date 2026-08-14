/** Client-safe Foreman settings vocabulary (no host-side imports). */

/** Settings namespace for the Foreman server connection. */
export const FOREMAN_SETTINGS_NAMESPACE = 'foreman'

/** The Foreman connection settings a browser panel reads. */
export interface ForemanSettings {
  /** Foreman JSON-RPC server URL. */
  foremanUrl?: string
  /** Worker auth token; empty means unauthenticated. */
  token?: string
}
