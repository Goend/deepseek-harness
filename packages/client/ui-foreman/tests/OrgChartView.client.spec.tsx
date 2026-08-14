// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { OrgChartView } from '../src/client/OrgChartView.tsx'
import type { OrgData } from '../src/client/index.ts'

const ORG: OrgData = {
  nodes: [
    { id: 'org', name: 'company', parentId: null, leaderId: null, domain: null },
    { id: 'frontend', name: '前端', parentId: 'org', leaderId: 'alice', domain: 'core/frontend' },
    { id: 'ui', name: 'UI', parentId: 'frontend', leaderId: null, domain: 'core/frontend/ui' },
  ],
  memberships: [
    { userId: 'bob', nodeId: 'frontend' },
    { userId: 'carol', nodeId: 'ui' },
  ],
}

type Props = ComponentProps<typeof OrgChartView>

function props(overrides: Partial<Props>): Props {
  return {
    foremanUrl: 'http://127.0.0.1:8787/rpc',
    listOrg: async () => ORG,
    assignTask: async () => {},
    ...overrides,
  } as unknown as Props
}

afterEach(() => {
  cleanup()
})

describe('OrgChartView', () => {
  it('renders the org tree with nested nodes and members', async () => {
    render(<OrgChartView {...props({})} />)
    expect(await screen.findByText('company')).toBeTruthy()
    expect(screen.getByText('前端')).toBeTruthy()
    expect(screen.getByText('UI')).toBeTruthy()
    expect(screen.getByText(/leader: alice/)).toBeTruthy()
    expect(screen.getByText(/成员: bob/)).toBeTruthy()
    expect(screen.getByText(/成员: carol/)).toBeTruthy()
  })

  it('shows an empty state when the server is unreachable', async () => {
    render(<OrgChartView {...props({ listOrg: async () => { throw new Error('offline') } })} />)
    expect(await screen.findByText(/未连接到 Foreman 服务端/)).toBeTruthy()
  })

  it('dispatches a task through assignTask', async () => {
    const assignTask = vi.fn().mockResolvedValue(undefined)
    render(<OrgChartView {...props({ assignTask })} />)
    await screen.findByText('company')
    fireEvent.change(screen.getByPlaceholderText('任务 id'), { target: { value: 'task-1' } })
    fireEvent.change(screen.getByPlaceholderText('任务描述'), { target: { value: 'add auth' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bob' } })
    fireEvent.click(screen.getByRole('button', { name: '下发任务' }))
    expect(await screen.findByText(/已下发 task-1/)).toBeTruthy()
    expect(assignTask).toHaveBeenCalledWith({ id: 'task-1', description: 'add auth', changeIntent: 'additive', assignee: 'bob' })
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
