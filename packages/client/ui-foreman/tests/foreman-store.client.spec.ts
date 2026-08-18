import { describe, expect, it } from 'vitest'
import { createForemanStore } from '../src/client/foreman-store.ts'
import { DEFAULT_FOREMAN_URL } from '../src/foreman-settings.ts'

describe('createForemanStore', () => {
  it('initializes with the default connection and unseeded', () => {
    const store = createForemanStore().create()
    expect(store.getSnapshot()).toEqual({
      connection: { url: DEFAULT_FOREMAN_URL, token: '' },
      seeded: false,
    })
  })

  it('setConnection writes the connection and marks seeded', () => {
    const store = createForemanStore().create()
    store.actions.setConnection({ url: 'http://x/rpc', token: 'tok' })
    expect(store.getSnapshot()).toEqual({
      connection: { url: 'http://x/rpc', token: 'tok' },
      seeded: true,
    })
  })
})
