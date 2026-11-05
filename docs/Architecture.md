# Lone X architecture

Vite builds the shared React renderer. A browser loads the public landing page and Electron loads the packaged workspace from the local build. Both surfaces use the same CSS theme tokens and supplied logo.

The Electron main process owns the workspace window and denies permission requests, external navigation, and new windows. The renderer runs with sandboxing and context isolation. Each privileged IPC handler validates the local main-frame origin and requires current legal acceptance and a signed-in local account. Files, installers and application launches use the relevant review and approval flows.

Local conversations, usage windows, accounts, acceptance receipts and audit records use SQLite. Local Ollama handles AI inference. Atlas and R2 integration is implemented behind an optional resource API; live cloud deployment is deferred. Desktop downloads verify registered sizes and SHA-256 checksums.

The optional browser workspace owns a separate sandboxed window and a temporary session for each approved HTTPS origin. Its pages have no preload or Node access. Top-level navigation and redirects stay on the approved origin. Popups, downloads and permissions are denied. Back, Forward and Reload use a fixed IPC action list and validate the destination in the main process. Stop cancels loading and Close clears the temporary session. External sites still receive normal network requests and can load their own subresources; this is a navigation boundary rather than a network allowlist.

Glare Hover, Flip Card, Lattice Loader, Squish Switch, Thought Line, and Tech Text are vendored from the React Bits TypeScript source. The micro-interactions use the existing Framer Motion and Lucide dependencies. The upstream license ships in the public build as react-bits-LICENSE.md.

