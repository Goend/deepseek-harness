# Agent Note: Foreman org-chart as a conversation view tab

Status: implemented

English | [中文](2026-08-14-foreman-org-chart-view-tab.zh.md)

## Problem

Foreman — the org/task governance layer over the DeepSeek Harness — needs a browser surface to show the org tree and dispatch tasks. Reusing the Harness Web GUI means contributing a slot rather than building a separate app; the natural entry is the conversation view ring, beside trajectory.

## Decision

A new client plugin `@deepseek-ai/dsh-client-ui-foreman` registers one `conversation.view` entry (`id: 'foreman'`, `order: 20`). The org data is fetched from the Foreman JSON-RPC server through the injected face (`listOrg`), so the component stays a pure consumer: it reads no `ctx`, holds org data in local `useState`, and derives the tree with `buildOrgTree` (parentId → children) before rendering the recursion with indentation. The server URL is a hardcoded placeholder pending a settings/credential seam; the org-chart tree renders leader and domain labels, while per-node members and dispatch are deferred.

## Consequences

The org-chart tab is a browser-only consumer with no host-side service; removing the plugin from the composition removes the tab without touching Foreman. The server URL placeholder means the tab shows the empty state until a settings/credential seam supplies the real endpoint and token. Per-node members and task dispatch remain deferred to a follow-up that widens the injected face.

## Alternatives considered

**A standalone web panel** — rejected. It would duplicate authentication, hosting, and the client shell; the slot is the sanctioned composition route and keeps Foreman inside the same browser surface the worker already uses.

**A slot-declared store for org data** — rejected for now. The data is component-private (loaded once per mount), so local state is the right channel until it must survive remounts or be shared across entries.
