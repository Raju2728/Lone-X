# Natural Thanglish review — 5 November 2026

## Implemented locally

- Broadened language detection to every phrase the founder supplied and ordinary
  conversation: greetings, explanations, coding questions, concerns and thanks.
  The marker list only selects stronger reply guidance; it is not a whitelist
  of topics the model may understand.
- Removed canned file-completion replies from the language prompt.
- Added saved Auto / Thanglish / English reply selection, validated in the main
  process and passed to ordinary Chat and the Agent. Current explicit language
  requests override the selection. Short follow-ups can retain the user's chat
  language. Quoted/file/code/tool text cannot set that preference.
- Preserved literal values, code and all action permission/review checks.
  Understanding a request does not implement a missing tool. Permanent deletion,
  sharing and lock/unlock tools remain unavailable; recycling requires review.
- Added optional Gemma 3 4B in the picker and supported model download allowlist.
- Added LONEX_OLLAMA_MODEL_DIR for a separate local model folder. Development
  can start its own installed Ollama runtime against the E: cache; packaged
  builds use their bundled runtime. Existing standalone model storage is left
  unchanged. No additional model was downloaded to C:.

## Actual model evaluation

Tested the four previously installed models on a Python-variable explanation
and interview-preparation question, then downloaded Gemma 3 4B (about 3.3 GB)
into `E:\Lone X\test-artifacts\ollama-models` and tested the same topic types.
That download is kept outside Git and outside the public/default-model ZIP.

Qwen2.5 0.5B produced repetition and an unjustified refusal. Coder 0.5B did not
establish reliable everyday Thanglish. Gemma 3 1B switched to Tamil script or
English despite Romanized-Tamil instructions. Qwen3 4B Instruct mixed languages,
misunderstood part of the interview request and copied a prompt-style example.
Those observations prompted removal of the canned style examples.

Gemma 3 4B with the refined prompt produced Latin-letter responses but still
used awkward grammar, repetition and too much English. Additional conversation
examples did not reliably fix this; native-Tamil guidance produced better Tamil
syntax but sometimes unnecessary code or a mistaken conversational role.
Native-first conversion was therefore not shipped as a claimed solution.

**Conclusion:** broader input/reply controls are implemented, but these tests do
not demonstrate ChatGPT-level Thanglish fluency. Gemma 3 4B remains optional and
is not labeled a guaranteed or fluent replacement. A stronger model or a
carefully evaluated Thanglish-trained model may be needed; no additional large
model was downloaded and no fine-tuning was claimed.

Raw outputs are in ignored E: artifacts:
`test-artifacts/thanglish-live.log`, `gemma4b-download-test.log`, and
`thanglish-style-comparison.json`. Latin-script/nonempty checks are not a
semantic quality score; the observations above are manual review of the actual
responses, not a benchmark or an exhaustive accuracy claim.

## Verification

Language/agent/runtime tests passed (12 tests), including supplied phrases,
non-file conversation, explicit overrides, chained short follow-ups, literals,
model-folder isolation and retained agent path/approval controls. The production
build and full desktop suite passed with five models, the saved language
selector, invalid preference rejection, main-process language application and
English per-message overrides. The ordinary live model tests involved no PC
file actions or user personal files.

Changes are local and not deployed. The local review ZIP is built separately
from the existing published ZIP; the default bundled model remains Qwen2.5
0.5B. Select Gemma 3 4B explicitly for the downloaded model.

## Primary model information

- [Google Gemma 3 model card](https://ai.google.dev/gemma/docs/core/model_card_3)
- [Ollama Gemma 3 tags](https://ollama.com/library/gemma3/tags)

Published multilingual support does not guarantee fluent Romanized-Tamil output
for a specific prompt, model size or quantization.
