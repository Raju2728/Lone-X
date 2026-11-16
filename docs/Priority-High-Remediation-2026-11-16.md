# High-priority remediation — 16 November 2026

Raju approved High attention items first, Medium next, then new capabilities.
This records implementation and acceptance evidence, not a claim that every
High item is closed.

## Completed locally

- Browser URL parsing accepts bare domains over HTTPS. The approved host pair
  is fixed at approval time, so a redirect cannot extend it through additional
  `www.` prefixes. HTTPS/port boundaries and unrelated-host blocking remain.
- UI and native approval describe the actual host-pair boundary.
- Main-page loading state no longer resets solely for background loading.
- Opt-in real Electron checks opened `google.com` and `youtube.com` in fresh
  temporary sessions. Both returned Ready with Google/YouTube page titles.
  This verifies page opening, not video playback, sign-in or every regional flow.
- The Chat coding agent now uses an 8192-token model context and stops repeated
  failed commands without a file change. This prevents the observed no-progress
  loop from repeatedly executing the same failed tests.
- Real Qwen3 4B Instruct agent acceptance passed on a disposable project: read
  source/tests, run failing tests, change `value + 2` to `value * 2`, retain a
  backup and pass both tests. The test harness independently reran the unchanged
  tests successfully. This is one verified case, not a general quality guarantee.
- Project repair selection now prefers installed Qwen3 Instruct over the small
  general-chat model. Exact-snippet validation remains and rejects whitespace-only
  no-op edits. A trial complete-source output format did not establish reliability
  and was discarded. User review, snapshot checks and backups remain required.
- Existing hard-link, AI stream-size and executable fuse fixes passed regression.
  npm audit reported zero known root production/build dependency vulnerabilities
  and zero known optional-backend production dependency vulnerabilities.

## Verification

- Production renderer build passed with existing directive/sourcemap/chunk warnings.
- Full Electron desktop suite passed, including chained-redirect rejection and
  project repair integration using simulated provider output.
- Browser/agent/repair targeted tests passed. Prior security/token/language/runtime,
  uninstall and executable-branding checks also passed during this work.
- Candidate portable Windows package rebuilt under
  `test-artifacts/priority-high-preview/Lone-X-Windows.zip`.
  Setup instructions, licenses, icon and uninstall helpers are included.
- The package is a local review candidate; no code or ZIP has been pushed or
  deployed during this remediation pass. Existing public downloads are unchanged
  by these local edits. No current remote-state assertion is made.

## High items still open

1. **Standalone Project “Propose fix” reliability:** live Qwen3 attempts still
   generated invalid/no-op or incorrect repairs. The Chat Agent passed the scoped
   case above; the standalone one-shot workflow is not certified reliable.
   Test actual repairs against their unchanged tests before calling them complete.
2. **Clean Windows acceptance:** no supplied clean Windows VM/ISO is available.
   The current host, temporary profiles and fixture installers do not substitute
   for a fresh OS. Follow `Clean-Windows-Test.md` once the environment exists.
3. **Public delivery:** local candidate verification is not publication. Release
   acceptance and a coordinated source/release/deployment step remain necessary.

Medium-priority tasks and broader features remain queued behind this High work.
No R2 billing activation or hosted AI integration was resumed.

## Evidence on E:

- `test-artifacts/browser-live-results.json`
- `test-artifacts/repair-agent-live-results.json`
- `test-artifacts/repair-agent-live-updated.log`
- `test-artifacts/priority-high-desktop.log`
- `test-artifacts/priority-high-package.log`
- `test-artifacts/priority-high-package-verification.json`

The failed attempts are retained in disposable test artifacts. Do not interpret
fixture regression results as a successful live-model repair or clean-OS test.
