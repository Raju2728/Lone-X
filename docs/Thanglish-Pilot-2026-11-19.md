# Expanded Thanglish training pilots — 19 November 2026

## Decision

Two actual Qwen2.5 0.5B LoRA pilots completed on the local RTX 3050. Neither
passed response-quality acceptance. No adapter was imported into Ollama,
enabled in Chat, published or substituted for an existing model. The other four
models were not weight-trained during this pilot.

## Data and evaluation design

The original 24 synthetic examples were expanded to 84 original pairs covering
conversation, coding, arithmetic, computer concepts, exact text, explicit
English requests and permission limits. Prompt duplication, empty records,
Tamil-script targets and exact training/evaluation overlap were checked.
Per-message language guidance respects explicit English overrides.

This was assistant consistency review, not independent fluent-speaker review.
The dataset is small and synthetic and is not production-approved.

- Training: `training/thanglish/pilot-train.jsonl`.
- Data hash: `09296b0d99cc28310e6f611f0bdf390b93d8b7bed507de5623d8dc116beb0159`.
- Initial validation: 12 prompts in `pilot-evaluation.json`.
- Fresh final evaluation: ten new prompts in `final-evaluation.json`, kept out
  of both training and initial validation. Topic overlap is intentional; exact
  prompt disjointness does not make this a broad independent benchmark.

## Training results

Both pilots started from Qwen/Qwen2.5-0.5B-Instruct revision
`7ae557604adf67be50417f59c2c2f167def9a775`. Original base weights stayed frozen;
separate LoRA adapters were trained. Batch size was one with four accumulation
steps. Trainer seed was 42; adapter initialization was not explicitly seeded,
so these are not strict reproducible causal comparisons of configurations.

| Configuration | Narrow pilot | Broader pilot |
| --- | --- | --- |
| Target modules | q/v projections | all linear modules except output head |
| Rank / alpha | 8 / 16 | 16 / 32 |
| Learning rate | 0.0001 | 0.0005 |
| Optimizer steps | 63 | 168 |
| Dataset passes | 3 | 8 |
| Mean training loss | 5.0502 | 1.2057 |
| Peak PyTorch allocated memory | 1779.32 MiB | 1905.43 MiB |
| Optimizer runtime | 110.36 seconds | 357.08 seconds |
| Finite loss / changed adapter weights | Passed | Passed |
| Language-quality acceptance | Failed | Failed |

The broader pilot's last batch losses were about 0.01–0.03. Very low loss on
these examples did not establish generalization. GPU memory figures exclude
some driver/reserved memory; runtimes exclude loading, saving and evaluation.

## Actual output review

The narrow pilot was evaluated against its base on 12 validation prompts.
Responses remained garbled/repetitive on most Thanglish questions, although the
addition and explicit English explanation were answered correctly.

The broader pilot and base were then evaluated on ten fresh prompts, for 20
nonempty generations. Greedy generation was capped at 96 new tokens. Nonempty
output and Latin script were not treated as fluency passes.

Examples of broader-pilot failures:

- Asked to subtract six from seventeen using `kazhichaa`, it answered
  `17 × 6 = 102.` instead of 11. The base also failed to understand that prompt;
  no claim is made that the base previously passed it.
- Asked for exactly `Release ready`, it added punctuation and a follow-up.
- Asked to create a Markdown file without tools, it suggested `md hello.md`
  and used confused saved/created wording. That command creates a directory,
  and the response did not correctly explain the required Agent access/review.
- Greetings, organization advice and planning remained unnatural or confused.
- The explicit English backup explanation was coherent. This does not offset
  the failures on the requested Thanglish behavior.

## Preserved evidence

- `test-artifacts/training-qwen-pilot.log`
- `test-artifacts/training-qwen-pilot-evaluation.json`
- `test-artifacts/training-qwen-all-linear.log`
- `test-artifacts/training-qwen-final-evaluation.json`
- Each adapter folder contains `training-run.json`, adapter configuration and
  Safetensors weights. Run pointers are in `training-pilot-run.json` and
  `training-pilot-all-linear-run.json` under test-artifacts.

All files, weights, caches and outputs remain on E:. The installed app and its
saved chats were not modified. Both failed candidates are retained for review.

## Next work before training the remaining models

Use a substantially larger, language-reviewed corpus with diverse spellings and
meanings, not only paraphrased command templates. In particular cover Tamil
arithmetic verbs, ordinary conversation, contextual follow-ups, exact literals,
and separation between instructions, advice and verified tool actions. Record
data provenance and split by topic/conversation rather than exact prompt alone.

Have a fluent speaker check the teacher responses and the evaluation rubric.
Choose training/validation/test splits before further configuration selection.
Do not repeatedly tune on these ten final prompts and continue calling them an
untouched test set. Scaling the failed recipe to the other models would not
establish that all models can respond naturally in Thanglish.

Reference for the broader target selection:
[PEFT LoRA target modules](https://huggingface.co/docs/peft/developer_guides/lora).
