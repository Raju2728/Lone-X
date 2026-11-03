# Local AI setup

Start Ollama and install a model, such as `qwen2.5:0.5b`. In the desktop **AI workspace**, click **Find models**, choose the installed model, and send an instruction.

Chat requests go to the Ollama server at `127.0.0.1:11434`. Successful turns are stored in `conversation.sqlite` inside the Electron user data directory. The latest 30 saved messages provide context.

To verify live streaming from PowerShell:

```powershell
$env:LONEX_OLLAMA_MODEL = 'qwen2.5:0.5b'
npm.cmd run test:providers
```

Run `npm.cmd run build` and `npm.cmd run test:desktop` for the desktop regression checks.

Chat history expires 30 days after it is saved. Cleanup runs at launch, hourly while the desktop app is running, and when history is read or used for a new request. Existing messages without a timestamp get 30 days from their first launch after this update.
