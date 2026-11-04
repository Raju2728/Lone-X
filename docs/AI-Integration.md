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

The Windows app creates one local email/password account per Electron user data profile. Passwords are salted and hashed. A successful sign-in stays active for three days, including across app restarts. The session expiry is encrypted with Windows protected storage when available. A password reset clears the session.

To enable Nodemailer, set `LONEX_SMTP_HOST`, `LONEX_SMTP_PORT` (defaults to 465), `LONEX_SMTP_USER`, and `LONEX_SMTP_PASSWORD` in the process environment before starting the desktop app. Optionally set `LONEX_SMTP_FROM` to a verified sender. Account creation and password reset emails use that server.

Packaged builds can check the GitHub release on sign-in and send one email per detected revision. The canonical ZIP release asset label must be `build:<full git commit SHA>`, matching the revision embedded by the packaging script. The app checks for updates but does not install them.

The chat uses `qwen2.5:0.5b` and displays the assistant as Raju. **New chat** starts an empty thread without carrying over context. Prior threads remain in SQLite until the retention policy removes them.

## Portable Windows ZIP

The ZIP bundles the CPU build of Ollama and the `qwen2.5:0.5b` model. Extract the entire ZIP before launching Lone X. The app starts its bundled Ollama on a private loopback port when chat first needs it. End users can chat offline without installing Ollama separately.

To build the ZIP, install Ollama on the packaging PC and run `ollama pull qwen2.5:0.5b` first. The packaging script copies the CPU runtime, model manifest, and verified blobs. Set `LONEX_OLLAMA_RUNTIME_DIR` and `OLLAMA_MODELS` if their locations differ from the Windows defaults.

## Choose a chat model

Chat defaults to the bundled Qwen2.5 0.5B. Select **Qwen2.5 Coder 0.5B** or **Gemma 3 1B** in the Prompt Bar and click the download button if the model is missing. All three run locally once installed.

If you use your own Ollama installation with the development build, start Ollama and install models from PowerShell:

```powershell
ollama pull qwen2.5:0.5b
ollama pull qwen2.5-coder:0.5b
ollama pull gemma3:1b
ollama list
```

Use the Chat download button in the portable ZIP. Its bundled Ollama instance uses a model directory inside the extracted app.
