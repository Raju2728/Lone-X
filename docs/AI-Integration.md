# Local AI setup

For development, start Ollama and install `qwen2.5:0.5b`. In **Chat**, send an instruction to the default local model. The portable Windows ZIP includes its own runtime and default model.

Development uses the Ollama server at `127.0.0.1:11434` unless a custom model store is selected. Packaged builds use a private loopback runtime. Successful turns are stored in `conversation.sqlite` inside the Electron user data directory. The latest 30 saved messages provide context.

To verify live streaming from PowerShell:

```powershell
$env:LONEX_OLLAMA_MODEL = 'qwen2.5:0.5b'
npm.cmd run test:providers
```

Run `npm.cmd run build` and `npm.cmd run test:desktop` for the desktop regression checks.

Chat history expires 30 days after it is saved. Cleanup runs at launch, hourly while the desktop app is running, and when history is read or used for a new request. Existing messages without a timestamp get 30 days from their first launch after this update.

The Prompt Bar can attach UTF-8 text and source files. Their contents count toward the 16,000-character prompt limit and are stored with the prompt in local chat history. Short, Balanced, and Detailed set different output token limits. Dictation uses the Windows speech recognizer and default microphone, and requires an installed speech language.

## Local account and email

The Windows app creates one local email/password account per Electron user data profile. Passwords are salted and hashed. A successful sign-in stays active for three days, including across app restarts. The session expiry is encrypted with Windows protected storage when available. A password reset clears the session.

To enable Nodemailer, set `LONEX_SMTP_HOST`, `LONEX_SMTP_PORT` (defaults to 465), `LONEX_SMTP_USER`, and `LONEX_SMTP_PASSWORD` in the process environment before starting the desktop app. Optionally set `LONEX_SMTP_FROM` to a verified sender. Account creation and password reset emails use that server.

Packaged builds can check the GitHub release on sign-in and send one email per detected revision. The canonical ZIP release asset label must be `build:<full git commit SHA>`, matching the revision embedded by the packaging script. The app checks for updates but does not install them.

The chat uses `qwen2.5:0.5b` and displays the assistant as Raju. **New chat** starts an empty thread without carrying over context. Prior threads remain in SQLite until the retention policy removes them.

## Portable Windows ZIP

The ZIP bundles the CPU build of Ollama and the `qwen2.5:0.5b` model. Extract the entire ZIP before launching Lone X. The app starts its bundled Ollama on a private loopback port when chat first needs it. End users can chat offline without installing Ollama separately.

To build the ZIP, install Ollama on the packaging PC and run `ollama pull qwen2.5:0.5b` first. The packaging script copies the CPU runtime, model manifest, and verified blobs. Set `LONEX_OLLAMA_RUNTIME_DIR` and `OLLAMA_MODELS` if their locations differ from the Windows defaults.

## Choose a chat model

Chat defaults to the bundled Qwen2.5 0.5B. The Prompt Bar also supports **Qwen2.5 Coder 0.5B**, **Gemma 3 1B**, **Gemma 3 4B** and **Qwen3 4B Instruct**. Download a missing model through the app; all five run locally once installed. Agent mode requires Qwen3 4B Instruct and approved file access.

If you use your own Ollama installation with the development build, start Ollama and install models from PowerShell:

```powershell
ollama pull qwen2.5:0.5b
ollama pull qwen2.5-coder:0.5b
ollama pull gemma3:1b
ollama pull gemma3:4b
ollama pull qwen3:4b-instruct
ollama list
```

Use the Chat download button in the portable ZIP. Its bundled Ollama instance uses a model directory inside the extracted app.

## Natural Thanglish replies

Chat now has **Replies: Auto / Thanglish / English**, saved in local browser
storage on the PC. An explicit language request in the current message takes
priority. Auto handles varied Romanized-Tamil phrases, conversational topics,
and short follow-ups using actual user-message context. Quotes, source code,
attachment contents and assistant/tool messages do not set the language choice.
All five models receive the shared guidance. This is prompt/context handling,
not model training or a guarantee of fluency.

Gemma 3 4B is an optional fifth model (about 3.3 GB download). It was evaluated
on this PC using an isolated E: model cache. Actual outputs still had awkward
Romanized-Tamil grammar and too much English; additional few-shot and native-
Tamil checks did not establish ChatGPT-level conversation quality. It remains
an optional local model, not a claimed fluent replacement. The installed 0.5B
models were especially weak on open-ended Thanglish conversation. See
Thanglish-Review.md for the evidence and limits.

A custom model store can be selected before starting the app:

```powershell
$env:LONEX_OLLAMA_MODEL_DIR = 'E:\Lone X\test-artifacts\ollama-models'
npm run desktop
```

Then select **Gemma 3 4B** in Chat. The runtime uses that E: folder and does not
change the standalone Ollama model store. A packaged build uses its bundled
runtime; a development build needs an installed Ollama runtime. Optional
unavailable models can be downloaded through the app into that selected store.
The custom store survives application uninstall. Clear the environment override
to return to the normal bundled/default runtime behavior.
