# @deepseek-ai/dsh-client-ui-foreman

English | [中文](README.zh.md)

Foreman organization panel: an org-chart view tab contributed to the conversation view ring. It renders the org tree and member list from the Foreman JSON-RPC server through injected callbacks; the panel is a pure consumer and defines no host-side service.

## Model Experience

### Org-chart view tab

#### What the model sees

Nothing. The panel reads org data over the Foreman JSON-RPC wire and renders it in the browser; no panel text enters any model request.

#### Token effect

Zero tokens.

#### KV Cache effect

None; the panel never touches a request prefix.

## Known Limitations and Deferred Work

- **The Foreman server URL and token are hardcoded placeholders** — the view tab uses `http://127.0.0.1:8787/rpc` and no auth token yet; both belong in a settings namespace or credential reference once the Foreman server is reachable from the browser.
- **The org chart renders the tree but omits the member list and dispatch action** — the node tree, leader, and domain labels render; per-node members and task dispatch are deferred.
