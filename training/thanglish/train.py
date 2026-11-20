"""LoRA recipe: Qwen 0.5B one-step GPU check verified; other model paths unvalidated."""
import argparse
import json
import os
import re
import math
from pathlib import Path
from data_gate import validate_data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True)
    parser.add_argument('--revision', required=True, help='Exact Hugging Face checkpoint commit SHA')
    parser.add_argument('--data', type=Path, required=True, help='Reviewed training JSONL; never evaluation data')
    parser.add_argument('--review-manifest', type=Path, help='Independent review record bound to the exact data SHA-256')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--max-steps', type=int, default=100)
    parser.add_argument('--rank', type=int, default=8)
    parser.add_argument('--target-modules', choices=['qv', 'all-linear'], default='qv')
    parser.add_argument('--learning-rate', type=float, default=1e-4)
    parser.add_argument('--seed-smoke-test', action='store_true', help='Permit the unreviewed seed only for a one-step pipeline check')
    args = parser.parse_args()
    mapping = json.loads(Path(__file__).with_name('models.json').read_text())
    if args.model not in mapping:
        parser.error('Choose a model key from models.json')
    if not re.fullmatch(r'[0-9a-f]{40}', args.revision):
        parser.error('Pin the exact 40-character base checkpoint commit SHA')
    if args.output.exists() and any(args.output.iterdir()):
        parser.error('Use a new empty output directory; existing checkpoints are preserved')
    if args.max_steps < 1:
        parser.error('max-steps must be positive')
    if args.rank < 1 or args.rank > 64 or not 0 < args.learning_rate <= 0.001:
        parser.error('Use rank 1..64 and a positive learning rate no greater than 0.001')
    try:
        validated = validate_data(args.data, args.review_manifest, smoke=args.seed_smoke_test, steps=args.max_steps)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    if os.name == 'nt':
        cache = Path(__file__).resolve().parents[2] / 'test-artifacts' / 'training-cache'
        if cache.drive.lower() != 'e:' or args.output.resolve().drive.lower() != 'e:':
            parser.error('On this Windows setup, keep the project, caches and output on E:')
        for key, folder in {'HF_HOME': 'hf', 'HF_HUB_CACHE': 'hf/hub', 'TRANSFORMERS_CACHE': 'hf/hub', 'TORCH_HOME': 'torch', 'TMP': 'temp', 'TEMP': 'temp'}.items():
            destination = cache / folder
            destination.mkdir(parents=True, exist_ok=True)
            os.environ[key] = str(destination)
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError('A CUDA GPU training environment is required by this recipe. No weights were trained.')
    from datasets import Dataset
    from transformers import AutoTokenizer, AutoModelForCausalLM, AutoModelForImageTextToText, Trainer, TrainingArguments, DataCollatorForSeq2Seq
    from peft import LoraConfig, get_peft_model
    model_id = mapping[args.model]
    token = os.environ.get('HF_TOKEN')  # Never print or save credentials.
    tokenizer = AutoTokenizer.from_pretrained(model_id, revision=args.revision, token=token, trust_remote_code=False)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    rows = []
    for messages in validated['messages']:
        if args.model.startswith('gemma3:'):
            messages = [{'role': 'user', 'content': messages[0]['content'] + '\n\n' + messages[1]['content']}, messages[2]]
        prefix = tokenizer.apply_chat_template(messages[:-1], tokenize=True, add_generation_prompt=True)
        full = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=False)
        if full[:len(prefix)] != prefix:
            raise ValueError('Chat template prefix mismatch: validate this model/template before training')
        if len(full) > 1024 or len(full) <= len(prefix):
            raise ValueError('Record exceeds 1024 tokens or has no assistant target; edit/split it before training')
        rows.append({'input_ids': full, 'attention_mask': [1] * len(full), 'labels': [-100] * len(prefix) + full[len(prefix):]})
    if not rows:
        raise ValueError('Training data is empty')
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    multimodal = args.model == 'gemma3:4b'
    cls = AutoModelForImageTextToText if multimodal else AutoModelForCausalLM
    model = cls.from_pretrained(model_id, revision=args.revision, token=token, torch_dtype=dtype, trust_remote_code=False, use_safetensors=True, low_cpu_mem_usage=True)
    model.config.use_cache = False
    targets = r'.*language_model.*\.(q_proj|v_proj)' if multimodal else ['q_proj', 'v_proj']
    if args.target_modules == 'all-linear':
        if multimodal:
            raise ValueError('All-linear multimodal training has not been validated')
        targets = 'all-linear'
    model = get_peft_model(model, LoraConfig(r=args.rank, lora_alpha=args.rank * 2, lora_dropout=0.05, target_modules=targets, task_type='CAUSAL_LM'))
    model.enable_input_require_grads()
    arguments = TrainingArguments(output_dir=str(args.output), max_steps=args.max_steps, per_device_train_batch_size=1,
        gradient_accumulation_steps=4, learning_rate=args.learning_rate, gradient_checkpointing=True,
        bf16=dtype == torch.bfloat16, fp16=dtype == torch.float16, logging_steps=1,
        save_strategy='no', report_to='none', seed=42, remove_unused_columns=False)
    trainer = Trainer(model=model, args=arguments, train_dataset=Dataset.from_list(rows),
        data_collator=DataCollatorForSeq2Seq(tokenizer, padding=True, label_pad_token_id=-100))
    torch.cuda.reset_peak_memory_stats()
    result = trainer.train()
    if not math.isfinite(result.training_loss):
        raise RuntimeError('Non-finite training loss; candidate is not accepted')
    updated = any('lora_B' in name and torch.count_nonzero(parameter.detach()).item() > 0
                  for name, parameter in model.named_parameters())
    if not updated:
        raise RuntimeError('No LoRA B weights changed; training pipeline is not verified')
    model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)
    (args.output / 'training-run.json').write_text(json.dumps({'base': model_id, 'revision': args.revision, 'steps': args.max_steps,
        'records': len(rows), 'smokeOnly': args.seed_smoke_test, 'humanEvaluationRequired': True,
        'gpu': torch.cuda.get_device_name(), 'peakAllocatedMiB': torch.cuda.max_memory_allocated() / 1048576,
        'loss': result.training_loss, 'adapterWeightsChanged': updated}, indent=2))
    manifest = json.loads((args.output / 'training-run.json').read_text())
    manifest.update({'rank': args.rank, 'targetModules': args.target_modules, 'learningRate': args.learning_rate,
        'dataSha256': validated['sha256'], 'reviewManifestRequired': not args.seed_smoke_test})
    (args.output / 'training-run.json').write_text(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
