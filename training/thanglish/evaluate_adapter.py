"""Compare a locally trained Qwen smoke adapter with its exact base checkpoint."""
import argparse
import json
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adapter', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cases', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    cache = root / 'test-artifacts' / 'training-cache'
    for key, part in {'HF_HOME': 'hf', 'HF_HUB_CACHE': 'hf/hub', 'TRANSFORMERS_CACHE': 'hf/hub', 'TMP': 'temp', 'TEMP': 'temp'}.items():
        os.environ[key] = str(cache / part)
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from peft import PeftModel
    manifest = json.loads((args.adapter / 'training-run.json').read_text())
    if manifest['base'] != 'Qwen/Qwen2.5-0.5B-Instruct':
        raise ValueError('This smoke evaluator supports only Qwen2.5 0.5B')
    seed = json.loads(Path(__file__).with_name('seed.json').read_text(encoding='utf-8'))
    system = json.loads(Path(__file__).with_name('train.jsonl').read_text(encoding='utf-8').splitlines()[0])['messages'][0]
    tokenizer = AutoTokenizer.from_pretrained(manifest['base'], revision=manifest['revision'], trust_remote_code=False, local_files_only=True)
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    base = AutoModelForCausalLM.from_pretrained(manifest['base'], revision=manifest['revision'], torch_dtype=dtype,
        trust_remote_code=False, use_safetensors=True, local_files_only=True).to('cuda')
    model = PeftModel.from_pretrained(base, args.adapter).eval()
    results = []
    cases = json.loads(args.cases.read_text(encoding='utf-8')) if args.cases else seed['evaluation']
    for case in cases:
        messages = [{'role': 'system', 'content': case.get('system', system['content'])}, {'role': 'user', 'content': case['prompt']}]
        text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(text, add_special_tokens=False, return_tensors='pt').to('cuda')
        for mode in ['base', 'adapter']:
            with torch.inference_mode():
                if mode == 'base':
                    with model.disable_adapter():
                        tokens = model.generate(**inputs, max_new_tokens=96, do_sample=False, pad_token_id=tokenizer.eos_token_id)
                else:
                    tokens = model.generate(**inputs, max_new_tokens=96, do_sample=False, pad_token_id=tokenizer.eos_token_id)
            response = tokenizer.decode(tokens[0, inputs['input_ids'].shape[-1]:], skip_special_tokens=True)
            results.append({'id': case['id'], 'prompt': case['prompt'], 'mode': mode, 'response': response,
                'generatedTokens': int(tokens.shape[-1] - inputs['input_ids'].shape[-1]),
                'reachedTokenCap': int(tokens.shape[-1] - inputs['input_ids'].shape[-1]) >= 96,
                'review': case['review']})
            print(json.dumps({'id': case['id'], 'mode': mode, 'nonempty': bool(response.strip())}), flush=True)
    args.output.write_text(json.dumps({'smokeOnly': manifest['smokeOnly'], 'humanReviewRequired': True, 'training': manifest, 'results': results}, indent=2), encoding='utf-8')
    if any(not item['response'].strip() for item in results):
        raise RuntimeError('An evaluation response was empty')


if __name__ == '__main__':
    main()
