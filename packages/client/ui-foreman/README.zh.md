# @deepseek-ai/dsh-client-ui-foreman

[English](README.md) | 中文

Foreman 组织面板：一个贡献到会话视图环的组织架构图视图标签页。它通过注入的回调从 Foreman JSON-RPC 服务端渲染组织树和成员列表；该面板是纯消费者，不定义任何 host 侧服务。

## Model Experience

### 组织架构图视图标签页

#### 模型看到什么

无。面板通过 Foreman JSON-RPC 链路读取组织数据并在浏览器中渲染；面板文本不进入任何模型请求。

#### Token 影响

零 token。

#### KV Cache 影响

无；面板从不触碰请求前缀。

## Known Limitations and Deferred Work

- **Foreman 服务端 URL 和 token 是硬编码占位** — 视图标签页当前使用 `http://127.0.0.1:8787/rpc` 且尚无认证 token；一旦 Foreman 服务端可被浏览器访问，两者应移入 settings 命名空间或凭据引用。
- **组织架构图渲染了树但省略了成员列表和下发动作** — 节点树、leader 和域标签已渲染；各节点成员和任务下发已延后。
