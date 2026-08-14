# Agent Note：Foreman 组织架构图作为会话视图标签页

Status: implemented

[English](2026-08-14-foreman-org-chart-view-tab.md) | 中文

## 问题

Foreman —— DeepSeek Harness 之上的组织/任务治理层 —— 需要一个浏览器界面来展示组织树并下发任务。复用 Harness Web GUI 意味着贡献一个 slot 而不是构建独立应用；自然的入口是会话视图环，位于轨迹视图旁。

## 决策

新 client 插件 `@deepseek-ai/dsh-client-ui-foreman` 注册一个 `conversation.view` 条目（`id: 'foreman'`，`order: 20`）。组织数据通过注入面（`listOrg`）从 Foreman JSON-RPC 服务端获取，因此组件保持纯消费者：不读 `ctx`，将组织数据保存在本地 `useState`，用 `buildOrgTree`（parentId → children）推导树，再以缩进渲染递归。服务端 URL 是硬编码占位，等待 settings/credential 接缝；组织架构图树渲染 leader 和域标签，各节点成员与下发已延后。

## 后果

组织架构图标签页是纯浏览器消费者，无 host 侧服务；从组装中移除插件即移除标签页，不影响 Foreman。服务端 URL 占位意味着在 settings/credential 接缝提供真实端点与 token 之前，标签页显示空状态。各节点成员与任务下发仍延后到后续扩展注入面。

## 备选方案

**独立 Web 面板** — 拒绝。它会重复认证、托管和 client shell；slot 是受认可的组装路径，且让 Foreman 留在 worker 已在使用的同一浏览器界面内。

**为组织数据声明 slot store** — 暂拒。该数据是组件私有的（每次挂载加载一次），因此本地 state 是正确通道，直到它需要跨重挂载存活或在条目间共享。
