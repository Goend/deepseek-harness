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

/** Absolute http(s) scheme, so bare host:port entries can be completed safely. */
const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * Normalize a user-entered Foreman server address into an absolute http(s)
 * URL. Hosts and ports entered without a scheme (for example
 * `192.3.39.195:8787/rpc`) are completed with `http://`.
 * @param url - raw connection input.
 * @returns the absolute URL.
 */
export function normalizeForemanUrl(url: string): string {
  const input = url.trim()
  if (input === '') throw new Error('服务器地址不能为空')
  const candidate = ABSOLUTE_URL.test(input) ? input : `http://${input}`
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error(`无效的服务器地址：${input}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('服务器地址仅支持 http:// 或 https://')
  }
  return parsed.href
}
