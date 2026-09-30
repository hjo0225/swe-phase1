---
title: queryClient.clear() leaves mounted components on a dead query, so the vault gate never re-renders
date: 2026-09-30
category: ui-bugs
module: renderer vault gate (features/vault/api/vault-queries.ts)
problem_type: ui_bug
component: frontend_state
symptoms:
  - "After choosing a vault folder the picker screen stays; the app never switches to the sidebar/editor"
  - "`queryClient.setQueryData(['vault','current'], vault)` right after `queryClient.clear()` has no visible effect"
  - "Flow test: Unable to find role=\"button\" name=\"보관함: Mock\" after clicking 폴더 열기"
root_cause: wrong_api
resolution_type: code_fix
severity: high
framework_version: "@tanstack/react-query 5.104"
related_components: [react-query, vault-switching]
tags: [tanstack-query, react-query, queryclient-clear, setquerydata, observer, cache-reset]
---

# queryClient.clear() leaves mounted components on a dead query

## Problem

Switching vaults must drop every cached note query (different vault = different notes). The first version did
`queryClient.clear()` and then `queryClient.setQueryData(['vault','current'], vault)` so the gate would render the app.
The gate (`useCurrentVault`) stayed on the picker.

## Root cause

`clear()` removes the `Query` objects from the cache, but a mounted `useQuery` observer keeps its reference to the
old, removed `Query`. `setQueryData` then creates a **new** `Query` under the same key; the mounted observer is not
subscribed to it and never re-renders. It only reattaches on remount or key change.

## Fix

Keep the queries the mounted gate depends on and remove only the rest:

```ts
queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'vault' });
queryClient.setQueryData(vaultKeys.current, vault);   // updates the query the gate is observing
void queryClient.invalidateQueries({ queryKey: vaultKeys.recent });
```

Everything below the gate is remounted anyway (`<VaultRouter key={vault.root} />`), so those components subscribe to
fresh queries.

## Rule

Never `clear()` (or `removeQueries` for a key) and then write to a key that a *still-mounted* component observes.
Either exclude that key from the removal, or remount the observer (change its `key`).
