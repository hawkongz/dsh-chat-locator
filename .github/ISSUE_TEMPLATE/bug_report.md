---
name: Bug report
about: Something renders wrong, a setting does not stick, or the rail disappears
title: "[Bug] "
labels: bug
assignees: ""
---

## What happened

A clear and concise description of the bug.

## Steps to reproduce

1. Open DSH Web at `http://127.0.0.1:3080`.
2. Open a conversation with at least 2 turns.
3. Change '...'
4. Hover the rail at '...'
5. See the problem.

## Expected behavior

A clear and concise description of what you expected to happen.

## Actual behavior

A clear and concise description of what actually happened.

## Console state

Open the browser DevTools console and paste the output of the built-in debug hook. This
single call answers most triage questions (`railPrefix: null` means the rail is not
rendered in this view; a non-empty `settingsStatus.unsupported` means the host half has
not registered those fields).

```js
__dshChatLocator.state()
```

## Screenshots or logs

If applicable, add screenshots (the rail is easier to judge visually) or error logs.

```text
(paste logs here)
```

## Environment

- Operating system: [e.g. Windows 11 24H2, macOS 15.0]
- DSH version: [run `dsh --version`]
- DSH profile: [e.g. `web`]
- dsh-chat-locator version: [e.g. v1.2.0]
- Browser: [e.g. Chrome 140, Edge 140]
- Conversation view that shows the bug: [e.g. right-side rail, narrow window ≤900px]

## Checklist

- [ ] I searched existing issues and this is not a duplicate.
- [ ] I pasted the `__dshChatLocator.state()` output above.
- [ ] I checked whether restarting `dsh web` changes the behavior.
