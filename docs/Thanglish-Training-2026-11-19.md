# Thanglish data and training preparation — 19 November 2026

Follow-up: the founder subsequently authorized local setup. See
[GPU smoke results](GPU-Smoke-2026-11-19.md) for the successful CUDA check and
experimental one-step Qwen adapter. This document records the preparation baseline.

The founder requested training all five Chat models and then selected:
“Prepare training files; I'll provide a GPU environment.” Actual weight training
is pending that environment. No adapter or fine-tuned checkpoint exists yet.

## Prepared

- `training/thanglish/seed.json`: 24 original synthetic conversation examples
  and three disjoint evaluation prompts, with provenance and review status.
- `train.jsonl` and `evaluation.jsonl`: generated, separate training/evaluation
  files. These are seed data, not a large validated language corpus.
- `models.json`: candidate original checkpoints for all five supported models.
- `train.py`: CUDA LoRA recipe with assistant-only target loss, pinned base
  revisions, output preservation and refusal of silently truncated examples.
- `requirements.txt` and README: GPU setup, model access, seed smoke-check and
  evaluation/import steps. GPU execution is unverified; syntax/help passed.
- `scripts/evaluate-thanglish.cjs`: installed-model baseline/example comparison.

No scraped source, private conversations or hidden training corpus was used.
The records were authored as synthetic examples for this project. A fluent
reviewer must correct and expand them before full training. Copying prompts
into Ollama does not update weights and is not reported as training.

## Current hardware and checks

The inspected environment has PyTorch 2.6.0+cpu, CUDA unavailable and zero CUDA
devices visible to PyTorch. Transformers, PEFT and Datasets are not installed.
No packages, source weights or paid GPU service were downloaded/started.
All generated files and evaluation output stay on E:.

Five language tests and the full Electron suite passed. The existing Chat path
accepts Thanglish prompts and supplies shared guidance for all five models.
That tests routing and permissions, not conversational fluency.

## Live evaluation

The first baseline/example comparison completed 30 outputs across all five
models. All calls completed without provider errors. Latin-script counts were:

| Model | Latin-script outputs / six |
| --- | --- |
| Qwen2.5 0.5B | 6 / 6 |
| Qwen2.5 Coder 0.5B | 6 / 6 |
| Gemma 3 1B | 5 / 6 |
| Gemma 3 4B | 6 / 6 |
| Qwen3 4B Instruct | 6 / 6 |

Latin-only output is not a fluency score: pure English passes that check too.
Review found repeated prompts, irrelevant file-action phrases, awkward grammar,
English-only explanations and an unsupported action implication. The examples
were not enabled in production Chat. The topic-matched second pass also
completed for all five models with no provider errors: 45 generated responses
across the baseline and two example conditions in total. The smaller Qwen models
still repeated phrases; Gemma responses remained awkward, and Qwen3's concept
explanation stayed substantially English. No candidate was accepted as a fluent
Thanglish solution. These are untrained-model observations, not post-training
results. Existing Chat behavior and model weights remain unchanged.

Full first-run responses: `test-artifacts/thanglish-generic-examples-results.json`.
Latest comparison: `test-artifacts/thanglish-adaptation-results.json`.
Model responses have a 160-token cap, so this is a short-answer smoke evaluation,
not a language benchmark or a post-training test.

## Required next input

Provide the GPU environment details: GPU name/VRAM, OS, Python/CUDA versions,
available storage and access method. Keep access tokens private. Verify Gemma
model access and exact source revisions in that environment. Then validate a
one-step run separately for all five architectures before reviewed-data runs.
Adapter evaluation, merge/conversion, Ollama import and Chat integration follow
only after real training and acceptance; existing model names/weights remain.

References: [Ollama customization](https://docs.ollama.com/modelfile),
[weight import](https://docs.ollama.com/import),
[Gemma 3](https://huggingface.co/docs/transformers/model_doc/gemma3).
