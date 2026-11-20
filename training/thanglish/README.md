# Thanglish training handoff

## Training admission check

Full training now requires `--review-manifest` in addition to `--data`.
Start with `review-manifest.example.json`, which deliberately fails validation.
After an independent reviewer checks the complete dataset, record their name,
review date, exact file SHA-256, record count and the six completed review checks.
Only then set status to `approved`. Never manufacture a review to bypass the
check. The manifest is a local attestation; it does not authenticate the reviewer
or prove legal rights, fluency or correctness.

The trainer validates records, duplicates, exact normalized known evaluation
overlap and the review record before downloading/loading a model. Changing data
invalidates its review hash. Renaming draft data does not bypass the check.
The only exception is the unchanged seed content for exactly one smoke step.
This closes the earlier filename-only restriction; historical multi-step pilots
used the earlier recipe and cannot be rerun without the new review evidence.
No currently prepared corpus meets this independent-review requirement.

Run the lightweight regression checks without CUDA or model downloads:
`python -m unittest discover -s training/thanglish -p test_data_gate.py -v`.
For reviewed training, add `--review-manifest /path/to/completed-review.json`
to the trainer command and use the exact reviewed JSONL file.

The corrected external examples retain source attribution and CC BY 4.0
obligations; see `ATTRIBUTION.txt`. They are not relicensed under MIT.

First correction batch: `curation-batch-01.json` contains 24 assistant-rewritten
pairs covering learning, coding, databases, career questions and honest AI
capabilities. `build-curation.py` rebuilds an attributed comparison queue in
`test-artifacts/thanglish-curation-batch-01/`, preserving the original source
question and answer, correction reasons, source hashes and review status.
These are drafts, not independently reviewed training examples. No model was
trained on this batch. The checks reject exact normalized known evaluation
overlap; they do not establish semantic independence or factual correctness.

Batch input checks exposed four missed Thanglish questions in automatic language
routing. Added the specific markers `edhukku`, `podalaama`, `pannalama` and
`irukkuma` to the shared language configuration. All 24 corrected questions now
select Thanglish guidance, and all 24 explicit English overrides remain English.
The six language tests also preserve quoted-content and permission rules.
These checks test routing, not generated reply fluency. Source changes are local;
the installed executable and public release have not been replaced.

20 November free-source audit: pinned downloads found 11,906 conversational
pairs from Zapd0s (publisher-declared CC BY 4.0), 292 instruction/translation
rows from Naveen04 (publisher-declared MIT), and 365 synthetic TamilTech QA
candidates. The 4,065 non-synthetic TamilTech rows are excluded.

`inspect-free-conversations.py` flags 4,793 conversational rows and produces
7,113 pending review candidates with source IDs and attribution in
`test-artifacts/thanglish-conversation-review/`. Passing those filters does not
approve a row. Samples still invent personal experiences, rely on missing
context, or make unsupported factual claims. The smaller instruction dataset
also contains invented directions, language mismatches and translation errors.
None is suitable for wholesale assistant fine-tuning.

All external training approvals remain zero. No new training run was started.
See `data-source-audit-2026-11-20.json` for pinned revisions and decisions, and
`test-artifacts/thanglish-data-review/review.csv` for the separate 365-row QA
queue. Review fields preserve corrections and reviewer identity; do not feed
these pending queues into `train.py`. Curate and correct standalone replies,
verify provenance, and split by topic/conversation before training. The queues
are review artifacts, not a fluency benchmark or a redistribution-rights audit.

Latest follow-up: 84-pair Qwen pilots completed for 63 and 168 optimizer steps.
They failed validation/fresh response-quality checks and were not enabled in
Chat. See `../../docs/Thanglish-Pilot-2026-11-19.md`. Lower training loss did not
make these candidates fluent. Other model architectures remain untrained.

An experimental Qwen2.5 0.5B LoRA adapter has completed one GPU optimizer step.
This verifies the pipeline, not Thanglish fluency or training of all five models.
An isolated environment now exists at `test-artifacts/training-env` with
PyTorch 2.9.1+cu126 and the training libraries. Global Python remains separate.

A later direct GPU check confirmed an RTX 3050 Laptop GPU with 4096 MiB VRAM,
compute capability 8.6 and NVIDIA driver 566.07. See `PC-READINESS.md` for the
initial assessment and `../../docs/GPU-Smoke-2026-11-19.md` for the actual run.

## Data

`seed.json` contains 24 original synthetic conversation pairs and three separate
evaluation prompts. `train.jsonl` is generated with
`node scripts/evaluate-thanglish.cjs`. No private conversations, scraped datasets
or proprietary source corpus were used. These are draft starter examples under
the repository MIT license, not a large or native-speaker-validated corpus.

Expand and correct the corpus with a fluent Tamil/Thanglish reviewer. Cover
spelling variation, multi-turn context, ordinary topics, coding, exact literals,
English overrides and honest tool limitations. Keep evaluation prompts/answers
out of training. Three held-out prompts are a smoke check, not a benchmark.

## GPU setup and smoke check

Use an isolated GPU environment with enough memory for the original model,
activations and training buffers. Provide its GPU/VRAM, OS, Python and CUDA
versions first. Install matching CUDA PyTorch and then the proposed requirements;
freeze exact resolved versions for reproducibility. No paid service has been
started. Keep local downloads/caches/output on E:, never the low-space C: drive.

Models in `models.json` are candidate original checkpoints, not guarantees of
byte-identical ancestry to every installed Ollama quantization. Verify the
base revision, tokenizer and architecture before training or adapter import.
Gemma may require the user's accepted model terms and Hugging Face access.
Supply HF_TOKEN privately in the environment, never in code or chats.

```sh
python -m pip install -r training/thanglish/requirements.txt
python -m pip freeze > environment-lock.txt
python training/thanglish/train.py --model qwen2.5:0.5b --revision EXACT_BASE_COMMIT_SHA --data training/thanglish/train.jsonl --output /workspace/outputs/qwen25-smoke --seed-smoke-test --max-steps 1
```

Replace EXACT_BASE_COMMIT_SHA with that checkpoint's full Hugging Face commit.
Run the one-step check independently for all five model keys before full runs.
Qwen2.5 0.5B passed a one-step GPU run. Other model paths, their chat
templates, Gemma 4B text-only multimodal training and LoRA module matching still
need validation. The recipe masks system/user/padding loss and refuses template mismatch
or token truncation rather than silently training on the wrong targets.

For actual training use expanded reviewed JSONL via `--data`, its completed
`--review-manifest` and a new output
folder per model. The 24-record seed is deliberately limited to a one-step smoke
check. Do not call that check a fluent Thanglish model.

## Evaluation and application integration

`node scripts/evaluate-thanglish.cjs --live` evaluates all five currently
installed Ollama models, baseline versus examples. It changes no weights.
Outputs are under `test-artifacts/thanglish-adaptation-results.json`. Latin
script checks do not measure fluency, factual correctness or permission honesty.

After GPU runs, evaluate each adapter on unseen prompts and compare it with its
base model. Have a fluent reviewer assess naturalness and accuracy. Verify code,
literals, explicit English requests and agent approval boundaries. Retain both
failures and successes. Run coding-agent regressions for Qwen3 too.

Adapter merge/conversion/quantization and Ollama import are a separate validation
step. Preserve the exact base model revision and its license. Do not overwrite
the five existing models or change Chat's defaults until each candidate passes.
Chat already accepts Thanglish input; response quality is model-dependent.

Primary references: [Ollama customization](https://docs.ollama.com/modelfile),
[Ollama weight import](https://docs.ollama.com/import),
[Gemma 3 architecture](https://huggingface.co/docs/transformers/model_doc/gemma3),
[Qwen3 Instruct checkpoint](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507).
