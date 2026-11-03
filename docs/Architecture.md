# Lone X architecture

Vite builds the shared React renderer. A browser loads the public landing page and Electron loads the packaged workspace from the local build. Both surfaces use the same CSS theme tokens and supplied logo.

The Electron main process owns the window and denies permission requests, external navigation, and new windows. The renderer runs with sandboxing and context isolation. No privileged IPC is exposed at this stage.

Local conversation and task data will use SQLite. Atlas is reserved for cloud metadata through a server-side API. R2 will host approved binary assets.

Glare Hover, Flip Card, Lattice Loader, Squish Switch, Thought Line, and Tech Text are vendored from the React Bits TypeScript source. The micro-interactions use the existing Framer Motion and Lucide dependencies. The upstream license ships in the public build as react-bits-LICENSE.md.

