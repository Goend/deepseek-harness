# @deepseek-ai/dsh-client-ui-foreman

English | [中文](README.zh.md)

Foreman organization panel: an org-chart view tab contributed to the conversation view ring. It renders the org tree, per-node members, and a dispatch form, and lets the user configure the Foreman server connection in the panel. Data flows from the Foreman JSON-RPC server through injected callbacks; the panel is a pure consumer and defines no host-side service.

## Model Experience

### Org-chart view tab

#### What the model sees

Nothing. The panel reads org data over the Foreman JSON-RPC wire and renders it in the browser; no panel text enters any model request.

#### Token effect

Zero tokens.

#### KV Cache effect

None; the panel never touches a request prefix.

## Known Limitations and Deferred Work

- **The auth token is stored in the settings document** — the panel persists the server URL and token through the `foreman` settings namespace; the token is `role('secret')` (never rendered by `describe`), but moving it to a credentials reference would keep it out of the settings file entirely.
- **Leader authority is not surfaced per node in the UI** — task view/reject controls render for every node; the server enforces the leader check and the UI shows the resulting error rather than hiding the action.
