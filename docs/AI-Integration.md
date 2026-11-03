# Local AI setup

Start Ollama and install a model, such as `qwen2.5:0.5b`. In the desktop **AI workspace**, send an instruction to the default local model.

Chat requests go to the Ollama server at `127.0.0.1:11434`. Successful turns are stored in `conversation.sqlite` inside the Electron user data directory. The latest 30 saved messages provide context.

To verify live streaming from PowerShell:

```powershell
$env:LONEX_OLLAMA_MODEL = 'qwen2.5:0.5b'
npm.cmd run test:providers
```

Run `npm.cmd run build` and `npm.cmd run test:desktop` for the desktop regression checks.

Chat history expires 30 days after it is saved. Cleanup runs at launch, hourly while the desktop app is running, and when history is read or used for a new request. Existing messages without a timestamp get 30 days from their first launch after this update.

## Local account and email

The Windows app creates one local email/password account per Electron user data profile. Passwords are salted and hashed. Each new app session requires sign-in.

To enable Nodemailer, set `LONEX_SMTP_HOST`, `LONEX_SMTP_PORT` (defaults to 465), `LONEX_SMTP_USER`, and `LONEX_SMTP_PASSWORD` in the process environment before starting the desktop app. Optionally set `LONEX_SMTP_FROM` to a verified sender. Account creation and password reset emails use that server.

Packaged builds can check the GitHub release on sign-in and send one email per detected revision. The canonical ZIP release asset label must be `build:<full git commit SHA>`, matching the revision embedded by the packaging script. The app checks for updates but does not install them.

The chat uses `qwen2.5:0.5b` and displays the assistant as Raju. **New chat** starts an empty thread without carrying over context. Prior threads remain in SQLite until the retention policy removes them.
