---
name: Feature request
about: Suggest a new setting, a different default, or a new rail behavior
title: "[Feature] "
labels: enhancement
assignees: ""
---

## The problem

Describe the situation where the current plugin does not do what you need. Start from the
user-facing symptom, not the implementation. Example: "On a 13-inch laptop the preview card
covers the paragraph I am reading."

## Proposed solution

What would you like the plugin to do? If it is a new setting, give the label in English and
简体中文, the control type (toggle / stepper / segmented control), the default value, and the
allowed range.

- Label: [e.g. `previewOffset` / 预览卡间距]
- Control: [e.g. stepper]
- Default: [e.g. `10`]
- Range: [e.g. `0`–`40`, step `2`]

## Alternatives considered

Any workaround you already tried, and why it is not enough.

## Scope check

- [ ] This can be expressed as injected CSS on top of the built-in rail (the plugin's only
      coupling point is the `<hash>_frame` / `<hash>_mark` structure).
- [ ] This does not require re-rendering the rail or forking `@deepseek-ai/dsh-client-ui-chat`.
- [ ] I am willing to open a pull request for this.

## Additional context

Screenshots, mockups, or links to similar features in other tools.
