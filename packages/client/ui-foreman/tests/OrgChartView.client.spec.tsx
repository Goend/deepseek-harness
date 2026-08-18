// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { OrgChartView } from '../src/client/OrgChartView.tsx'
import { type ForemanViewState } from '../src/client/foreman-store.ts'
import type { ForemanConnection } from '../src/foreman-settings.ts'
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

const CONNECTION: ForemanConnection = { url: 'http://127.0.0.1:8787/rpc', token: 'root-token' }
const STORE_STATE: ForemanViewState = { connection: CONNECTION, seeded: true }
const MY_TASK = {
  id: 'task-1',
  description: 'add auth',
  brief: 'docs/auth.md',
  state: 'queued',
  assignee: 'u-1',
  jiraKey: 'EAS-1',
  workspacePaths: [],
}

type Props = ComponentProps<typeof OrgChartView>

function props(overrides: Partial<Props> = {}): Props {
  const base = {
    useStore: ((selector: (state: ForemanViewState) => unknown) => selector(STORE_STATE)) as unknown as Props['useStore'],
    actions: { setConnection: vi.fn() },
    getConnection: () => CONNECTION,
    saveConnection: vi.fn().mockResolvedValue(undefined),
    listOrg: vi.fn().mockResolvedValue(ORG),
    listMyTasks: vi.fn().mockResolvedValue([]),
    whoami: vi.fn().mockResolvedValue({ userId: 'u-1', name: 'root' }),
    claimTask: vi.fn().mockResolvedValue(undefined),
    assignTask: vi.fn().mockResolvedValue(undefined),
    listNodeTasks: vi.fn().mockResolvedValue([]),
    rejectTask: vi.fn().mockResolvedValue(undefined),
    jiraSetCredential: vi.fn().mockResolvedValue(undefined),
    jiraTestCredential: vi.fn().mockResolvedValue({ accountId: 'a1', displayName: 'root', emailAddress: 'root@example.com' }),
    jiraGetIssue: vi.fn().mockResolvedValue({
      key: 'EAS-1', summary: 'fix issue', descriptionText: 'docs/x.md', status: 'In Progress', statusId: '3',
      issueType: 'Bug', issueTypeId: '1', subtask: false, parentKey: null, assignee: 'u-1', reporter: null,
      priority: 'Blocker', components: ['Neutron'], fixVersions: ['EOSv7.0.1'], attachments: [], comments: [], created: '', updated: '', url: 'https://jira/browse/EAS-1',
    }),
    jiraGetTransitions: vi.fn().mockResolvedValue([{ id: '21', name: 'Submit Code Review', to: 'In Review' }]),
    jiraTransition: vi.fn().mockResolvedValue(undefined),
    setTaskWorkspaces: vi.fn().mockImplementation(
      async (_taskId: string, paths: readonly string[]) => ({ ...MY_TASK, workspacePaths: paths }),
    ),
    listHarnessWorkspaces: vi.fn().mockResolvedValue([]),
    registerHarnessWorkspace: vi.fn().mockResolvedValue({ workspaceId: 'ws-1', path: '/repo', title: 'repo' }),
    promptCurrentSession: vi.fn().mockResolvedValue(undefined),
    startWorkerSessions: vi.fn().mockResolvedValue([{ workspacePath: '/repo', workspaceId: 'ws-1', sessionId: 's-1', accepted: true }]),
    ...overrides,
  }
  return base as unknown as Props
}

afterEach(() => {
  cleanup()
})

describe('OrgChartView', () => {
  it('renders the org tree with nested nodes and members', async () => {
    render(<OrgChartView {...props()} />)
    expect(await screen.findByText('company')).toBeTruthy()
    expect(screen.getByText('前端')).toBeTruthy()
    expect(screen.getByText('UI')).toBeTruthy()
    expect(screen.getByText(/leader: alice/)).toBeTruthy()
    expect(screen.getByText(/成员: bob/)).toBeTruthy()
    expect(screen.getByText(/成员: carol/)).toBeTruthy()
  })

  it('hides my tasks and shows a hint when no token is configured', async () => {
    const emptyState: ForemanViewState = { connection: { url: 'http://127.0.0.1:8787/rpc', token: '' }, seeded: true }
    const whoami = vi.fn()
    const listMyTasks = vi.fn()
    render(<OrgChartView {...props({
      useStore: ((selector: (state: ForemanViewState) => unknown) => selector(emptyState)) as unknown as Props['useStore'],
      whoami,
      listMyTasks,
    })} />)
    expect(await screen.findByText('company')).toBeTruthy()
    expect(screen.getByText(/当前未设置 token/)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /我的任务/ })).toBeNull()
    expect(whoami).not.toHaveBeenCalled()
    expect(listMyTasks).not.toHaveBeenCalled()
  })

  it('shows the current token identity and personal task briefs', async () => {
    render(<OrgChartView {...props({
      listMyTasks: vi.fn().mockResolvedValue([{
        id: 'task-1',
        description: 'add auth',
        brief: '文档：docs/auth.md\n验收：登录接口可用',
        state: 'queued',
        assignee: 'u-1',
      }]),
    })} />)
    expect(await screen.findByText(/当前用户：root/)).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /task-1 — add auth/ }))
    expect(screen.getByText(/docs\/auth\.md/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '认领' })).toBeTruthy()
  })

  it('renders the Jira subview and loads an issue with transitions', async () => {
    const jiraGetIssue = vi.fn().mockResolvedValue({
      key: 'EAS-1', summary: 'fix issue', descriptionText: 'docs/x.md', status: 'In Progress', statusId: '3',
      issueType: 'Bug', issueTypeId: '1', subtask: false, parentKey: null, assignee: 'u-1', reporter: null,
      priority: 'Blocker', components: ['Neutron'], fixVersions: ['EOSv7.0.1'], attachments: [], comments: [], created: '', updated: '', url: 'https://jira/browse/EAS-1',
    })
    render(<OrgChartView {...props({ jiraGetIssue })} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Jira' }))
    fireEvent.change(screen.getByPlaceholderText(/EAS-145045/), { target: { value: 'EAS-1' } })
    fireEvent.click(screen.getByRole('button', { name: '查询' }))
    expect(await screen.findByText('fix issue')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'EAS-1' })).toBeTruthy()
    expect(screen.getByText(/In Progress/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Submit Code Review/ })).toBeTruthy()
  })

  it('creates a Jira while assigning to a member (leader flow)', async () => {
    const assignTask = vi.fn().mockResolvedValue(undefined)
    render(<OrgChartView {...props({ assignTask })} />)
    await screen.findByText('company')
    fireEvent.change(screen.getByPlaceholderText('任务 id'), { target: { value: 'task-create-jira' } })
    fireEvent.change(screen.getByPlaceholderText('任务描述'), { target: { value: '实现登录接口' } })
    fireEvent.change(screen.getByPlaceholderText(/任务详情/), { target: { value: '见 docs/auth.md' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bob' } })
    fireEvent.click(screen.getByLabelText(/创建 Jira 并分配给任务成员/))
    fireEvent.change(screen.getByPlaceholderText('Jira 项目 key'), { target: { value: 'EAS' } })
    fireEvent.change(screen.getByPlaceholderText('组件，逗号分隔（可空）'), { target: { value: 'Neutron' } })
    fireEvent.click(screen.getByRole('button', { name: '下发任务' }))
    expect(await screen.findByText('已下发 task-create-jira')).toBeTruthy()
    expect(assignTask).toHaveBeenCalledWith({
      id: 'task-create-jira',
      description: '实现登录接口',
      brief: '见 docs/auth.md',
      changeIntent: 'additive',
      assignee: 'bob',
      jira: {
        projectKey: 'EAS',
        issueTypeName: 'Story',
        summary: '实现登录接口',
        description: '见 docs/auth.md',
        componentNames: ['Neutron'],
      },
    }, CONNECTION)
  })

  it('dispatches a Jira-linked task without a separate description', async () => {
    const assignTask = vi.fn().mockResolvedValue(undefined)
    render(<OrgChartView {...props({ assignTask })} />)
    await screen.findByText('company')
    fireEvent.change(screen.getByPlaceholderText('任务 id'), { target: { value: 'task-jira' } })
    fireEvent.change(screen.getByPlaceholderText('Jira key（可选，填写后由服务端拉取上下文）'), { target: { value: 'EAS-145045' } })
    fireEvent.click(screen.getByRole('button', { name: '下发任务' }))
    expect(await screen.findByText('已下发 task-jira')).toBeTruthy()
    expect(assignTask).toHaveBeenCalledWith({
      id: 'task-jira',
      changeIntent: 'additive',
      assignee: undefined,
      jiraKey: 'EAS-145045',
    }, CONNECTION)
  })

  it('adds and persists workspace paths from the expanded task', async () => {
    const registerHarnessWorkspace = vi.fn().mockResolvedValue({ workspaceId: 'ws-1', path: '/repo', title: 'repo' })
    const setTaskWorkspaces = vi.fn().mockImplementation(
      async (_taskId: string, paths: readonly string[]) => ({ ...MY_TASK, workspacePaths: paths }),
    )
    render(<OrgChartView {...props({
      listMyTasks: vi.fn().mockResolvedValue([MY_TASK]),
      registerHarnessWorkspace,
      setTaskWorkspaces,
    })} />)
    fireEvent.click(await screen.findByRole('button', { name: /task-1 — add auth/ }))
    fireEvent.change(screen.getByPlaceholderText('本地工作区路径'), { target: { value: '/repo' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await screen.findByText(/已更新 task-1 的工作区/)
    expect(registerHarnessWorkspace).toHaveBeenCalledWith('/repo')
    expect(setTaskWorkspaces).toHaveBeenCalledWith('task-1', ['/repo'], CONNECTION)
  })

  it('starts one worker session per configured workspace', async () => {
    const startWorkerSessions = vi.fn().mockResolvedValue([{ workspacePath: '/repo', workspaceId: 'ws-1', sessionId: 's-1', accepted: true }])
    render(<OrgChartView {...props({ startWorkerSessions, listMyTasks: vi.fn().mockResolvedValue([{ ...MY_TASK, workspacePaths: ['/repo'] }]) })} />)
    fireEvent.click(await screen.findByRole('button', { name: /task-1 — add auth/ }))
    fireEvent.click(screen.getByRole('button', { name: '启动工作会话' }))
    expect(await screen.findByText('已创建 1 个工作会话')).toBeTruthy()
  })

  it('shows an empty state when the server is unreachable', async () => {
    render(<OrgChartView {...props({ listOrg: vi.fn().mockRejectedValue(new Error('offline')) })} />)
    expect(await screen.findByText(/未连接到 Foreman 服务端：offline/)).toBeTruthy()
  })

  it('shows the empty state without an error when the org is empty', async () => {
    render(<OrgChartView {...props({ listOrg: vi.fn().mockResolvedValue({ nodes: [], memberships: [] }) })} />)
    expect(await screen.findByText(/请点「连接配置」设置服务器地址/)).toBeTruthy()
  })

  it('dispatches a task with a brief and assignee through assignTask', async () => {
    const assignTask = vi.fn().mockResolvedValue(undefined)
    render(<OrgChartView {...props({ assignTask })} />)
    await screen.findByText('company')
    fireEvent.change(screen.getByPlaceholderText('任务 id'), { target: { value: 'task-9' } })
    fireEvent.change(screen.getByPlaceholderText('任务描述'), { target: { value: 'add auth' } })
    fireEvent.change(screen.getByPlaceholderText(/任务详情/), { target: { value: 'docs/auth.md' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bob' } })
    fireEvent.click(screen.getByRole('button', { name: '下发任务' }))
    expect(await screen.findByText('已下发 task-9')).toBeTruthy()
    expect(assignTask).toHaveBeenCalledWith({
      id: 'task-9',
      description: 'add auth',
      brief: 'docs/auth.md',
      changeIntent: 'additive',
      assignee: 'bob',
    }, CONNECTION)
  })

  it('dispatches a self-assigned task when no member is chosen', async () => {
    const assignTask = vi.fn().mockResolvedValue(undefined)
    render(<OrgChartView {...props({ assignTask })} />)
    await screen.findByText('company')
    fireEvent.change(screen.getByPlaceholderText('任务 id'), { target: { value: 'task-2' } })
    fireEvent.change(screen.getByPlaceholderText('任务描述'), { target: { value: 'extend myself' } })
    fireEvent.click(screen.getByRole('button', { name: '下发任务' }))
    expect(await screen.findByText('已下发 task-2')).toBeTruthy()
    expect(assignTask).toHaveBeenCalledWith({
      id: 'task-2',
      description: 'extend myself',
      changeIntent: 'additive',
      assignee: undefined,
    }, CONNECTION)
  })

  it('lists node tasks and rejects one', async () => {
    const listNodeTasks = vi.fn().mockResolvedValue([
      { id: 'task-1', description: 'add auth', brief: '', state: 'queued', assignee: 'bob' },
    ])
    const rejectTask = vi.fn().mockResolvedValue(undefined)
    render(<OrgChartView {...props({ listNodeTasks, rejectTask })} />)
    await screen.findByText('company')
    fireEvent.click(screen.getAllByRole('button', { name: '任务' })[0]!)
    fireEvent.click(await screen.findByRole('button', { name: /task-1 — add auth/ }))
    fireEvent.click(screen.getByRole('button', { name: '驳回' }))
    expect(rejectTask).toHaveBeenCalledWith('task-1', CONNECTION)
  })

  it('claims a personal task and refreshes my tasks', async () => {
    const listMyTasks = vi.fn()
      .mockResolvedValueOnce([{ id: 'task-1', description: 'x', brief: '', state: 'queued', assignee: 'u-1' }])
      .mockResolvedValue([{ id: 'task-1', description: 'x', brief: '', state: 'assigned', assignee: 'u-1' }])
    const claimTask = vi.fn().mockResolvedValue(undefined)
    render(<OrgChartView {...props({ listMyTasks, claimTask })} />)
    fireEvent.click(await screen.findByRole('button', { name: /task-1 — x/ }))
    fireEvent.click(await screen.findByRole('button', { name: '认领' }))
    await waitFor(() => { expect(claimTask).toHaveBeenCalledWith('task-1', CONNECTION) })
    await waitFor(() => { expect(screen.getByText(/assigned/)).toBeTruthy() })
  })

  it('saves a per-conversation connection into the store', async () => {
    const saveConnection = vi.fn().mockResolvedValue(undefined)
    const setConnection = vi.fn()
    render(<OrgChartView {...props({ saveConnection, actions: { setConnection } })} />)
    await screen.findByText('company')
    fireEvent.click(screen.getByRole('button', { name: '连接配置' }))
    fireEvent.change(screen.getByPlaceholderText(/服务器地址/), { target: { value: '192.3.39.195:8787/rpc' } })
    fireEvent.change(screen.getByPlaceholderText(/token/), { target: { value: 'alice-token' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并连接' }))
    await waitFor(() => { expect(saveConnection).toHaveBeenCalledWith({
      url: 'http://192.3.39.195:8787/rpc',
      token: 'alice-token',
    }) })
    expect(setConnection).toHaveBeenCalledWith({
      url: 'http://192.3.39.195:8787/rpc',
      token: 'alice-token',
    })
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
    const listNodeTasks = vi.fn().mockResolvedValue([{ id: 'task-1', description: 'x', brief: '', state: 'queued', assignee: 'bob' }])
    const rejectTask = vi.fn().mockRejectedValue(new Error('reject-fail'))
    render(<OrgChartView {...props({ listNodeTasks, rejectTask })} />)
    await screen.findByText('company')
    fireEvent.click(screen.getAllByRole('button', { name: '任务' })[0]!)
    fireEvent.click(await screen.findByRole('button', { name: /task-1 — x/ }))
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

  it('keeps the empty state and exposes the reason when reload after save fails', async () => {
    const saveConnection = vi.fn().mockResolvedValue(undefined)
    const listOrg = vi.fn().mockRejectedValue(new Error('offline'))
    render(<OrgChartView {...props({ saveConnection, listOrg })} />)
    await screen.findByText(/未连接/)
    fireEvent.click(screen.getByRole('button', { name: '连接配置' }))
    fireEvent.click(screen.getByRole('button', { name: '保存并连接' }))
    await waitFor(() => { expect(screen.getByText(/未连接到 Foreman 服务端：offline/)).toBeTruthy() })
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
    const listNodeTasks = vi.fn().mockResolvedValue([{ id: 'task-1', description: 'x', brief: '', state: 'queued', assignee: 'bob' }])
    const rejectTask = vi.fn().mockRejectedValue('oops')
    render(<OrgChartView {...props({ listNodeTasks, rejectTask })} />)
    await screen.findByText('company')
    fireEvent.click(screen.getAllByRole('button', { name: '任务' })[0]!)
    fireEvent.click(await screen.findByRole('button', { name: /task-1 — x/ }))
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
