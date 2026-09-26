# Security Policy

## Supported versions

| Version | Supported |
| :--- | :--- |
| 1.4.x | :white_check_mark: |
| < 1.4 | :x: |

Only the latest release receives fixes. Please reproduce on the newest version before
reporting.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report privately through GitHub's
[Security Advisories](https://github.com/hawkongz/dsh-chat-locator/security/advisories/new)
form. If you cannot use that form, open a minimal public issue that says only "I need to
report a security issue privately" and wait for a maintainer to contact you — do not include
the details.

Please include:

* The affected version and DSH version.
* A description of the impact and who is affected.
* Reproduction steps or a proof of concept.
* Any suggested fix or mitigation.

You can expect an acknowledgement within 7 days and an assessment within 30 days. Please give
us a reasonable window to ship a fix before publishing details.

## Scope and threat model

`dsh-chat-locator` is a local UI plugin. It runs with the privileges of the user who installed
it, inside the DSH Web page and the DSH host process. The relevant attack surface is small and
worth stating precisely, so that reports land in the right place:

**In scope**

* Code execution or privilege escalation caused by this plugin's own code
  (`index.js`, `client.js`).
* Content injected into the page by this plugin that could exfiltrate conversation text.
  The plugin does not read turn text — it only injects CSS that styles the built-in rail, plus the
  sample strings it renders on its own settings page — and it must never send anything anywhere.
* Weaknesses in how the plugin resolves its CSS-injection target that could be abused by a
  different, untrusted plugin to inject styles into the DSH page.
* Local-storage handling that could corrupt or leak data beyond the plugin's own
  `dsh.chat-locator.settings` key.

**Out of scope**

* Vulnerabilities in DSH itself, in Cordis, or in `@deepseek-ai/dsh-client-ui-chat`. Report
  those to the respective upstream project.
* Anything requiring an already-compromised machine, a malicious browser extension, or
  physical access.
* The plugin's dependency tree — it has none by design.

## Design properties relevant to security

* **Zero runtime dependencies.** There is no third-party supply chain to audit.
* **No network access.** Neither half opens a socket or issues a request. Hover previews are the
  built-in ones, drawn from data already in the page; the plugin only styles them.
* **No secrets, no telemetry.** Settings are stored in this browser's local storage (key
  `dsh.chat-locator.settings`) and never leave the machine.
* **Owned styles only.** All injected CSS is namespaced under one `<style>` element created by
  the plugin (`chat-locator/rail.css`) and removed on cleanup.
* **No writes to the shipped install.** The plugin never modifies files under the DSH
  installation directory.
