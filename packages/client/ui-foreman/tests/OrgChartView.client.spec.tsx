// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    getConnection: () => ({ url: 'http://127.0.0.1:8787/rpc', token: '' }),
    saveConnection: async () => {},
    listOrg: async () => ORG,
    assignTask: async () => {},
    listNodeTasks: async () => [],
    rejectTask: async () => {},
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

  it('lists node tasks and rejects one', async () => {
    const listNodeTasks = vi.fn().mockResolvedValue([
      { id: 'task-1', description: 'add auth', state: 'queued', assignee: 'bob' },
    ])
    const rejectTask = vi.fn().mockResolvedValue(undefined)
    render(<OrgChartView {...props({ listNodeTasks, rejectTask })} />)
    await screen.findByText('company')
    fireEvent.click(screen.getAllByRole('button', { name: '任务' })[0]!)
    expect(await screen.findByText(/task-1 — add auth/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '驳回' }))
    expect(rejectTask).toHaveBeenCalledWith('task-1')
  })

  it('saves a connection and reloads', async () => {
    const saveConnection = vi.fn().mockResolvedValue(undefined)
    const listOrg = vi.fn().mockResolvedValue(ORG)
    render(<OrgChartView {...props({ saveConnection, listOrg })} />)
    await screen.findByText('company')
    fireEvent.click(screen.getByRole('button', { name: '连接配置' }))
    fireEvent.change(screen.getByPlaceholderText(/服务器地址/), { target: { value: 'http://x/rpc' } })
    fireEvent.change(screen.getByPlaceholderText(/token/), { target: { value: 'tok' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并连接' }))
    await waitFor(() => expect(saveConnection).toHaveBeenCalledWith('http://x/rpc', 'tok'))
  })

  it('shows an error when listing node tasks fails', async () => {
    const listNodeTasks = vi.fn().mockRejectedValue(new Error('offline'))
    render(<OrgChartView {...props({ listNodeTasks })} />)
    await screen.findByText('company')
    fireEvent.click(screen.getAllByRole('button', { name: '任务' })[0]!)
    expect(await screen.findByText(/offline/)).toBeTruthy()
  })

  it('shows an error when saving the connection fails', async () => {
    const saveConnection = vi.fn().mockRejectedValue(new Error('save-fail'))
    render(<OrgChartView {...props({ saveConnection })} />)
    await screen.findByText('company')
    fireEvent.click(screen.getByRole('button', { name: '连接配置' }))
    fireEvent.click(screen.getByRole('button', { name: '保存并连接' }))
    expect(await screen.findByText(/save-fail/)).toBeTruthy()
  })

  it('shows an error when rejecting a task fails', async () => {
    const listNodeTasks = vi.fn().mockResolvedValue([{ id: 'task-1', description: 'x', state: 'queued', assignee: 'bob' }])
    const rejectTask = vi.fn().mockRejectedValue(new Error('reject-fail'))
    render(<OrgChartView {...props({ listNodeTasks, rejectTask })} />)
    await screen.findByText('company')
    fireEvent.click(screen.getAllByRole('button', { name: '任务' })[0]!)
    await screen.findByText(/task-1/)
    fireEvent.click(screen.getByRole('button', { name: '驳回' }))
    expect(await screen.findByText(/reject-fail/)).toBeTruthy()
  })

  it('shows an error when assigning a task fails', async () => {
    const assignTask = vi.fn().mockRejectedValue(new Error('assign-fail'))
    render(<OrgChartView {...props({ assignTask })} />)
    await screen.findByText('company')
    fireEvent.change(screen.getByPlaceholderText('任务 id'), { target: { value: 'task-1' } })
    fireEvent.change(screen.getByPlaceholderText('任务描述'), { target: { value: 'x' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bob' } })
    fireEvent.click(screen.getByRole('button', { name: '下发任务' }))
    expect(await screen.findByText(/assign-fail/)).toBeTruthy()
  })

  it('keeps the empty state when reload after save fails', async () => {
    const saveConnection = vi.fn().mockResolvedValue(undefined)
    const listOrg = vi.fn().mockRejectedValue(new Error('offline'))
    render(<OrgChartView {...props({ saveConnection, listOrg })} />)
    await screen.findByText(/未连接/)
    fireEvent.click(screen.getByRole('button', { name: '连接配置' }))
    fireEvent.click(screen.getByRole('button', { name: '保存并连接' }))
    await waitFor(() => expect(screen.getByText(/未连接/)).toBeTruthy())
  })

  it('shows a non-Error message when saving throws a string', async () => {
    const saveConnection = vi.fn().mockRejectedValue('oops')
    render(<OrgChartView {...props({ saveConnection })} />)
    await screen.findByText('company')
    fireEvent.click(screen.getByRole('button', { name: '连接配置' }))
    fireEvent.click(screen.getByRole('button', { name: '保存并连接' }))
    expect(await screen.findByText(/oops/)).toBeTruthy()
  })

  it('shows a non-Error message when listing tasks throws a string', async () => {
    const listNodeTasks = vi.fn().mockRejectedValue('oops')
    render(<OrgChartView {...props({ listNodeTasks })} />)
    await screen.findByText('company')
    fireEvent.click(screen.getAllByRole('button', { name: '任务' })[0]!)
    expect(await screen.findByText(/oops/)).toBeTruthy()
  })

  it('shows a non-Error message when rejecting throws a string', async () => {
    const listNodeTasks = vi.fn().mockResolvedValue([{ id: 'task-1', description: 'x', state: 'queued', assignee: 'bob' }])
    const rejectTask = vi.fn().mockRejectedValue('oops')
    render(<OrgChartView {...props({ listNodeTasks, rejectTask })} />)
    await screen.findByText('company')
    fireEvent.click(screen.getAllByRole('button', { name: '任务' })[0]!)
    await screen.findByText(/task-1/)
    fireEvent.click(screen.getByRole('button', { name: '驳回' }))
    expect(await screen.findByText(/oops/)).toBeTruthy()
  })

  it('shows a non-Error message when assigning throws a string', async () => {
    const assignTask = vi.fn().mockRejectedValue('oops')
    render(<OrgChartView {...props({ assignTask })} />)
    await screen.findByText('company')
    fireEvent.change(screen.getByPlaceholderText('任务 id'), { target: { value: 'task-1' } })
    fireEvent.change(screen.getByPlaceholderText('任务描述'), { target: { value: 'x' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bob' } })
    fireEvent.click(screen.getByRole('button', { name: '下发任务' }))
    expect(await screen.findByText(/oops/)).toBeTruthy()
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
