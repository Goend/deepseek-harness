import { describe, expect, it } from 'vitest'
import { FOREMAN_SETTINGS_NAMESPACE, normalizeForemanUrl } from '../src/foreman-settings.ts'

describe('normalizeForemanUrl', () => {
  it('completes a scheme-less host:port with http://', () => {
    expect(normalizeForemanUrl('192.3.39.195:8787/rpc')).toBe('http://192.3.39.195:8787/rpc')
  })

  it('keeps an absolute http(s) URL', () => {
    expect(normalizeForemanUrl('http://x/rpc')).toBe('http://x/rpc')
    expect(normalizeForemanUrl('https://x/rpc')).toBe('https://x/rpc')
  })

  it('rejects an empty address', () => {
    expect(() => normalizeForemanUrl('')).toThrow(/不能为空/)
  })

  it('rejects an invalid address', () => {
    expect(() => normalizeForemanUrl('not a url with spaces')).toThrow(/无效/)
  })

  it('rejects a non-http scheme', () => {
    expect(() => normalizeForemanUrl('ftp://x')).toThrow(/仅支持/)
  })
})

describe('FOREMAN_SETTINGS_NAMESPACE', () => {
  it('names the foreman namespace', () => {
    expect(FOREMAN_SETTINGS_NAMESPACE).toBe('foreman')
  })
})
