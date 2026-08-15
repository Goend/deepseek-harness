# @deepseek-ai/dsh-client-ui-foreman

[English](README.md) | 中文

Foreman 组织面板：一个贡献到会话视图环的组织架构图视图标签页。它渲染组织树、各节点成员和下发表单，并让用户在面板内配置 Foreman 服务端连接。数据通过注入的回调从 Foreman JSON-RPC 服务端流转；该面板是纯消费者，不定义任何 host 侧服务。

## Model Experience

### 组织架构图视图标签页

#### 模型看到什么

无。面板通过 Foreman JSON-RPC 链路读取组织数据并在浏览器中渲染；面板文本不进入任何模型请求。

#### Token 影响

零 token。

#### KV Cache 影响

无；面板从不触碰请求前缀。

## Known Limitations and Deferred Work

- **认证 token 存储在 settings 文档中** — 面板通过 `foreman` settings 命名空间持久化服务端 URL 和 token；token 是 `role('secret')`（从不被 `describe` 渲染），但将其移入 credentials 引用可彻底不落 settings 文件。
- **leader 权限未在 UI 中按节点区分** — 任务查看/驳回控件在每个节点都渲染；服务端强制 leader 检查，UI 显示返回的错误而非隐藏该动作。
