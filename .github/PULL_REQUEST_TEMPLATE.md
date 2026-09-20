## Summary

What does this pull request change, in one or two sentences?

## Why

Why is this change needed? Link the issue it closes.

Closes #123

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change (changes an existing default, setting name, or range)
- [ ] Documentation
- [ ] Refactor or test only

## Test plan

- [ ] `node test/verify-client.mjs` passes (paste the assertion count below).
- [ ] I manually checked the changed behavior in DSH Web.
- [ ] If this changes the gradient table, I updated `README.md`, `zh-CN/README.md`,
      `docs/design-notes.md`, and `zh-CN/docs/design-notes.md`.

Manually tested scenarios:

1. Scenario one: ...
2. Scenario two: ...

```text
(node test/verify-client.mjs output tail)
```

## Screenshots (required for visual changes)

Paste before/after screenshots of the rail. State the window width, because the built-in
rail hides itself below 900px and the preview card is clamped to the container.

## Checklist

- [ ] The code follows the project conventions (zero runtime dependencies, ESM, 2-space indent).
- [ ] I added or updated tests for the change.
- [ ] All documentation that mentions the changed values is updated.
- [ ] The commit message follows [Conventional Commits](https://www.conventionalcommits.org/).
- [ ] I did not commit `node_modules/`, secrets, or build artifacts.
