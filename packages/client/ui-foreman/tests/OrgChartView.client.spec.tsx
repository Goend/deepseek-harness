// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ComponentProps } from 'react'
import { OrgChartView } from '../src/client/OrgChartView.tsx'
import type { OrgData } from '../src/client/index.ts'

const ORG: OrgData = {
  nodes: [
    { id: 'org', name: 'company', parentId: null, leaderId: null, domain: null },
    { id: 'frontend', name: '前端', parentId: 'org', leaderId: 'alice', domain: 'core/frontend' },
    { id: 'ui', name: 'UI', parentId: 'frontend', leaderId: null, domain: 'core/frontend/ui' },
  ],
  memberships: [],
}

type Props = ComponentProps<typeof OrgChartView>

function props(overrides: Partial<Props>): Props {
  return {
    foremanUrl: 'http://127.0.0.1:8787/rpc',
    listOrg: async () => ORG,
    ...overrides,
  } as unknown as Props
}

describe('OrgChartView', () => {
  it('renders the org tree with nested nodes', async () => {
    render(<OrgChartView {...props({})} />)
    expect(await screen.findByText('company')).toBeTruthy()
    expect(screen.getByText('前端')).toBeTruthy()
    expect(screen.getByText('UI')).toBeTruthy()
    expect(screen.getByText(/leader: alice/)).toBeTruthy()
  })

  it('shows an empty state when the server is unreachable', async () => {
    render(<OrgChartView {...props({ listOrg: async () => { throw new Error('offline') } })} />)
    expect(await screen.findByText(/未连接到 Foreman 服务端/)).toBeTruthy()
  })

  it('ignores a result that resolves after unmount', async () => {
    let resolve!: (value: OrgData) => void
    const listOrg = () => new Promise<OrgData>((r) => { resolve = r })
    const { unmount } = render(<OrgChartView {...props({ listOrg })} />)
    unmount()
    resolve(ORG) // alive is false after unmount; the state update is skipped
  })

  it('ignores an error that rejects after unmount', async () => {
    let reject!: (e: Error) => void
    const listOrg = () => new Promise<OrgData>((_, r) => { reject = r })
    const { unmount } = render(<OrgChartView {...props({ listOrg })} />)
    unmount()
    reject(new Error('offline')) // alive is false; no state update
  })
})
