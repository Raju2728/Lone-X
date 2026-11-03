# AI integration preview

Open **AI workspace** in the desktop app and select a provider and model. Send an instruction to stream a response into the workspace.

- **Ollama** connects to the local runtime on port 11434. Start Ollama, install a model, then click **Find models** to populate the model suggestions.
- **OpenAI** requires `OPENAI_API_KEY` in the launching process environment and a model ID available to that account. Keep the key in your local environment. The app sends the current instruction and recent messages to the selected provider when you submit.

Successful turns are saved in `conversation.sqlite` inside the Electron user data directory. The AI integration currently uses one local conversation, and the latest 30 saved messages provide context. The renderer uses a restricted Electron bridge for history, local model discovery, and streaming. Provider requests run in the main process.

Run `npm run build` and `npm run test:desktop` to verify the desktop chat flow with simulated Ollama and OpenAI responses. Live provider acceptance requires a running Ollama instance with a model and an OpenAI credential.

## Live acceptance check

In the same PowerShell session, set `LONEX_OLLAMA_MODEL` and `LONEX_OPENAI_MODEL` to the model IDs you want to test. With Ollama running and `OPENAI_API_KEY` available to the process, run `npm run test:providers`. The check sends one short prompt to each configured provider and exits with a failure if either provider cannot complete a text stream.
