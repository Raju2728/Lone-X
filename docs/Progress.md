# Development progress

## Milestone 1 — In progress

The responsive landing page and Electron renderer share the supplied Lone X logo and light and dark theme tokens. The landing page uses Glare Hover from React Bits. The desktop shell provides overview, workspace draft, projects status, task status, terminal status, activity, and appearance settings. Draft and theme preferences use browser storage in this milestone.

TypeScript checking and the Vite production build passed. Headless Edge verified landing page rendering, the React Bits component, theme switching and persistence, workspace anchor navigation, and layout at 360 pixels. The build emits warnings about Framer Motion client directives that Vite ignores.

The Windows Electron smoke test passed for launch, all seven navigation targets, theme switching and persistence, and renderer isolation. Full visual and keyboard accessibility review remains pending. Provider chat, task execution, terminal commands, SQLite persistence, and cloud integration belong to later milestones.

## Milestone 2 — Local AI verified

The approved scope uses Ollama exclusively. Live streaming passed with qwen2.5:0.5b. The Windows smoke test passed for model discovery, chat streaming, retry, and SQLite storage.

## Milestone 3 — In progress

Projects can list the immediate entries of a folder selected in the Windows folder picker. The renderer supplies no filesystem path, and the handler checks the caller before opening the picker. The smoke test verifies cancellation and approved folder listing. File reads and writes, PowerShell execution, audit logging, and emergency stop are pending.

The project browser can preview an explicitly selected UTF-8 text file up to 128 KB. Thought Line shows waiting and streaming status in the local chat.

Users can save the preview bytes to a new file selected in the Windows save dialog. The desktop smoke test verifies the copy and refusal to overwrite an existing file.

Settings > Terminal now runs two fixed, read-only PowerShell diagnostics after a native Run once approval. Local SQLite records the command label and outcome. Stop cancels a pending approval or terminates the current PowerShell process. Arbitrary commands and autonomous execution are outside this increment.

Milestone 3 checks passed for approved file operations, the fixed PowerShell command list, native approval and denial, SQLite audit history, and stopping a real PowerShell process before launch and during execution. The running-stop test uses a harmless sleep command in an isolated profile.
