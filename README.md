# Lone X

Lone X is a Windows desktop workspace for AI-assisted development and controlled PC operations. The current preview provides the desktop interface and local instruction drafts.

## Run locally

Use Node.js 22 or later. Run `npm ci`, then `npm run dev` for the website or `npm run desktop` for the Windows app.

## Windows preview

From a Windows x64 checkout with Electron, Ollama, and the qwen2.5:0.5b model available, run `pwsh -File scripts/package-windows.ps1`. This writes a portable ZIP to `public/downloads/Lone-X-Windows.zip`. Extract the entire ZIP and open `Lone X.exe`. The portable bundle includes the CPU runtime and default model.

## Hosting

Publish the ZIP as a GitHub prerelease asset. Import the public repository into Vercel and optionally set `VITE_WINDOWS_DOWNLOAD_URL` to override the public release asset URL. The frontend builds to `dist`.

Deploy the backend to Railway when the backend service is implemented. Configure database credentials as server-side Railway variables. Use `1.0.0` for the completed release.
