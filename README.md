# Lone X

Lone X is a Windows Beta for local Ollama chat and reviewed PC operations. It includes local accounts, conversation history, model downloads, a file agent, project/npm tools, controlled PowerShell commands, storage review and an isolated browser. The website shares its branding and legal documents.

## Run locally

Use Node.js 22 or later. Run `npm ci`, then `npm run dev` for the website or `npm run desktop` for the Windows app.

## Windows preview

From a Windows x64 checkout with Electron, Ollama, and the qwen2.5:0.5b model available, run `pwsh -File scripts/package-windows.ps1`. This writes a portable ZIP to `public/downloads/Lone-X-Windows.zip`. Extract the entire ZIP and open `Lone X.exe`. The portable bundle includes the CPU runtime and default model.

## Hosting

Publish the ZIP as a GitHub prerelease asset. Import the public repository into Vercel and optionally set `VITE_WINDOWS_DOWNLOAD_URL` to override the public release asset URL. The frontend builds to `dist`.

The optional resource API is implemented in `backend`, but live Atlas/R2/Railway setup is deferred. The local desktop does not require that service. Keep credentials in server-side configuration. The product remains Beta; reserve `1.0.0` for completed release acceptance.

## Current limits and verification

Agent file changes need review and support UTF-8 text up to 16 KB. PC-wide scope requires separate session approval and does not grant administrator rights. Terminal commands are allowlisted. npm scripts run with the Windows user's permissions after review.

The Chat agent passed one real Qwen3 Instruct repair-and-retest case. Standalone project repair and natural Thanglish fluency remain model-dependent and are not certified reliable. Clean-Windows installation acceptance remains open. macOS and Windows 32-bit packages are not available.

Run `npm run build` and `npm run test:desktop` for the renderer and Electron checks. See `docs/Progress.md` for milestone evidence, `docs/Clean-Windows-Test.md` for the pending fresh-OS checks and `docs/AI-Integration.md` for models/email configuration.

## Licensing

Lone X original code is licensed under the [MIT License](LICENSE), copyright
2026 Rajesh .T and contributors. MIT allows modification and redistribution
subject to retaining its notice. The project name and logo do not imply
endorsement of modified builds.

Third-party material keeps its own license. In particular, `src/react-bits`
components retain [MIT plus Commons Clause](public/react-bits-LICENSE.md);
they are not relicensed as unrestricted MIT components. Model weights,
Electron/Chromium, Ollama and npm dependencies also keep their notices.
The complete distribution should not be described as exclusively MIT-licensed.

The operator is Rajesh .T (known as Raju), Coimbatore, Tamil Nadu, India.
Privacy and grievance contact: lonex.chat@gmail.com.
