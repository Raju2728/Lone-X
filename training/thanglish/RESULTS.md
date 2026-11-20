# Preparation and evaluation status

20 November follow-up: free-source triage produced review queues, not approved
training data. Twenty-four external pairs were assistant-corrected with source
attribution. Four missed spelling variants were added to shared language routing;
24/24 batch prompts select Thanglish, and 24/24 explicit English overrides work.
Six language regression tests pass. This measures routing, not reply fluency.

The trainer now requires an independent review manifest bound to the dataset
hash and record count before model loading. Six admission tests cover changed
data, missing/pending review, duplicates, evaluation leakage and the one-step
seed exception. The CLI rejects the unreviewed 84-row pilot before creating an
output directory. No new weights have been trained. Full training remains
blocked on independently reviewed, sufficiently broad data; existing failed
adapters remain rejected.

Latest: two longer Qwen2.5 0.5B pilots completed on 84 synthetic pairs (63-step
q/v LoRA and 168-step all-linear LoRA). Both failed language-quality acceptance;
the all-linear pilot also failed arithmetic/literal/action-guidance checks on
fresh prompts. Neither was enabled in Chat. Details are in
`docs/Thanglish-Pilot-2026-11-19.md` in the project.

Date: 19 November 2026.

- 24 original synthetic training records and three separate evaluation prompts
  prepared. Data remains a draft requiring fluent-speaker review and expansion.
- All five installed models were evaluated: Qwen2.5 0.5B, Qwen2.5 Coder 0.5B,
  Gemma 3 1B, Gemma 3 4B and Qwen3 4B Instruct.
- 45 local responses generated across baseline, generic examples and
  topic-matched examples. All provider requests completed.
- Examples did not establish reliable Thanglish fluency. Latin-only checks also
  accept English, so they are not used as fluency certification.
- Thanglish input routing passed all five language tests and the desktop suite,
  including shared guidance for all five Chat models.
- Training recipe syntax/help and data split/schema checks passed. Subsequently,
  CUDA PyTorch was installed in an isolated E: environment and Qwen2.5 0.5B
  completed one optimizer step with finite loss and changed adapter weights.
  Peak PyTorch allocated GPU memory was approximately 1755.53 MiB. This is a
  pipeline smoke adapter, not a fluent model or completed all-model training.
- Original weights and production language behavior were not changed.
- The one-step adapter was compared with its base on three held-out prompts.
  All six outputs were nonempty, but Thanglish remained garbled/repetitive.
  It was not accepted for Chat. See `docs/GPU-Smoke-2026-11-19.md` in the project.

Next: review the smoke evaluation, validate each remaining architecture's recipe,
review/expand the corpus, train separate adapters and evaluate unseen prompts
before importing candidates into Ollama/Chat.
