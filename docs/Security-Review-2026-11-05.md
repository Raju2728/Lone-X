# Security review — 5 November 2026

## Scope and result

Reviewed source based on commit `89cb497e16ac1a86186af6e0c3578cf79bfd244f`,
its published Windows Beta ZIP and the local working-copy security fixes.
This is a targeted code/dependency and behavior review, not a penetration-test
certification, incident-response investigation, or guarantee of no bugs/breaches.
No external exploit traffic was sent to production services. Cloud audit logs,
GitHub account access logs, SMTP logs and the user's whole PC were not examined.
All downloaded audit dependencies/runtime, caches and test artifacts were placed
on E:. Windows and installed security software may maintain their normal system
metadata independently.

## Findings

| ID | Priority | Finding and evidence | Result |
| --- | --- | --- | --- |
| LX-SEC-01 | Medium | An NTFS hard link inside an approved agent folder allowed reading a fixture outside the folder. The original path/realpath checks rejected symlinks but not hard links. This requires a prepared local hard link; it is not evidence of remote code execution or a breach. | Fixed locally: reject multi-link files in agent resolution/reads and npm manifest/lock inspection. Regression verifies read, write, recycle and npm rejection without approval or outside-content modification. |
| LX-SEC-02 | Medium | The bundled Electron 42.11.18 included the examined recent patches but was outside the latest-three-major support policy when 45 was current. npm audit alone did not flag this support gap. | Updated locally to Electron 45.2.3 and verified full desktop behavior. Installed Ollama is 0.40.14, matching the official latest release checked today. |
| LX-SEC-03 | Medium | The shared NDJSON parser and ordinary chat accumulator lacked explicit size limits. A malfunctioning or hostile local AI endpoint could consume excessive memory until timeout. No remote access or exfiltration was demonstrated. | Fixed locally: 128 Ki-character frame limit and 1 MiB response-content limit. Tests cover oversized unfinished frames and aggregate output. |
| LX-SEC-04 | Hardening | Packaged Electron permitted standard Node/environment/debug launch modes. This is a local execution-hardening gap, not an independent remote exploit. | Build now disables RunAsNode, NODE_OPTIONS and Node CLI inspector fuses. A real branded executable test confirms the normal renderer starts despite these attempted overrides, without running injected code or opening the Node inspector. |
| LX-SEC-05 | Medium, outstanding | The published Lone X executable is not Authenticode signed. SHA-256 verifies agreement with GitHub release metadata, not an independent publisher signature if the publishing account is compromised. | Signing and release-account MFA/recovery settings remain release-hardening tasks. No certificate was purchased or invented. |
| LX-SEC-06 | Known boundary | Chats, attached text, drafts and projects are not encrypted by Lone X. Approved npm scripts run as the Windows user and can access other files/network. Ollama is a local HTTP service, not a sandbox against other local processes. | Disclosed in policies and SECURITY.md. Keep Windows account/device protection, action review and project trust. Consider a future process/filesystem sandbox for untrusted projects. |
| LX-SEC-07 | Web hardening | Added deployment headers for anti-framing, MIME sniffing, referrer and browser permission controls plus a server CSP. | Configured locally; not yet deployed. The renderer already used a CSP meta tag. |

## Checks completed

- Root and optional backend npm audits: zero known vulnerabilities reported by
  the queried advisory service. This does not cover every Chromium/Go/model issue.
- Pattern-based scan of reachable Git commit patches for OpenAI/Google/GitHub
  tokens, embedded MongoDB passwords and private-key headers: no matching secrets
  found. This is not an exhaustive entropy scan, nor a scan of private cloud logs.
- Windows Defender custom scan of the existing published ZIP: exit code 0,
  "found no threats", signature version 1.463.134.0. No third-party upload and
  remediation disabled. This result applies to the original ZIP hash below,
  not to unbuilt/modified files or every previous release.
- Original published ZIP SHA-256:
  `2b661c1b64c11d45e86b343329787533f429570983b93a50c320a260b47fdbb5`.
- Production renderer build passed with existing chunk/directive warnings.
- Full Electron desktop integration passed on 45.2.3: legal and account gates,
  protected three-day session, IPC origin/frame rejection, approvals, path checks,
  cancellation, update/download integrity, storage and isolated-browser fixtures.
  Software installation in that suite uses fixtures, not a real clean PC.
- Agent/language/token/uninstall/package tests passed; follow-up response-size
  and executable-fuse injection tests passed. Backend local API test passed.
- Old secret credentials previously shared in chat should be revoked/rotated
  with their providers. This review did not use or republish them and cannot
  confirm whether they were previously accessed by anyone.

## Remaining verification

A real clean Windows install test was NOT completed. This machine is Home Single
Language, has no Windows Sandbox executable and only a Kali Linux VirtualBox VM.
No Windows ISO/VM was supplied. See Clean-Windows-Test.md for the E:-only test
lab plan and exact acceptance checks. Host testing and a fresh app profile are
not substitutes for a fresh OS without Node/Git/Ollama.

No confirmed data breach was found in the material examined. That is not proof
that no breach occurred. To investigate an actual incident, obtain provider
sign-in/audit logs and preserve the affected system/release evidence.

## Publication state

The hard-link/response-size fixes, Electron upgrade, fuse changes, web headers,
MIT adoption and policy updates are local working-copy changes. They are not
present in the previously published ZIP or live site yet. A new release must
be built, verified and published before users receive them.

## Primary references

- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron support policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)
- [Electron upstream advisories](https://github.com/electron/electron/security/advisories)
- [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
- [Ollama FAQ](https://github.com/ollama/ollama/blob/main/docs/faq.mdx)
