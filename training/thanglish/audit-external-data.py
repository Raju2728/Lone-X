"""Inspect external QA data without approving it or training on scraped comments."""
import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REVISION = 'a73e451b2e58bcae7ce0d2c553392ff84b6738ce'
SOURCE = ROOT / 'test-artifacts' / 'data-sources' / 'TamilTech-QA' / REVISION
OUT = ROOT / 'test-artifacts' / 'thanglish-data-review'


def normalized(text):
    return ' '.join(re.sub(r'[^a-z0-9 ]', ' ', text.lower()).split())


def main():
    import pandas as pd
    OUT.mkdir(parents=True, exist_ok=True)
    seen = set()
    counts = Counter()
    rows = []
    protected = set()
    for name in ['pilot-evaluation.json', 'final-evaluation.json']:
        for case in json.loads(Path(__file__).with_name(name).read_text(encoding='utf-8')):
            protected.add(normalized(case['prompt']))
    hashes = {}
    for split in ['train', 'validation', 'test']:
        file = SOURCE / f'data_{split}-00000-of-00001.parquet'
        hashes[file.name] = hashlib.sha256(file.read_bytes()).hexdigest()
        for item in pd.read_parquet(file).to_dict('records'):
            counts['total'] += 1
            if item.get('source') != 'synthetic':
                counts['excluded_non_synthetic'] += 1
                continue
            counts['synthetic'] += 1
            question, answer = str(item.get('question', '')).strip(), str(item.get('answer', '')).strip()
            key = normalized(question)
            flags = []
            if not question or not answer:
                flags.append('empty')
            if key in seen:
                flags.append('duplicate_question')
            if key in protected:
                flags.append('known_evaluation_overlap')
            if re.search(r'[\u0b80-\u0bff]', answer):
                flags.append('Tamil_script_answer')
            if re.search(r'https?://|[\w.+-]+@[\w.-]+\.[a-z]{2,}', question + ' ' + answer, re.I):
                flags.append('contact_or_link_review')
            if re.search(r'\b(compulsory|always|never|guaranteed|100%)\b', answer, re.I):
                flags.append('absolute_claim_review')
            if len(answer) < 30:
                flags.append('short_answer_review')
            seen.add(key)
            for flag in flags:
                counts[flag] += 1
            rows.append({'source_id': item['id'], 'original_split': split,
                'topic': str(item.get('topic', '')), 'question': question, 'answer': answer,
                'flags': ';'.join(flags), 'review_status': 'pending', 'corrected_question': '',
                'corrected_answer': '', 'reviewer': '', 'notes': ''})
    with (OUT / 'review.csv').open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    manifest = {'dataset': 'dheepakkaran/TamilTech-QA', 'revision': REVISION,
        'source_url': 'https://huggingface.co/datasets/dheepakkaran/TamilTech-QA',
        'declared_license': 'CC BY 4.0', 'attribution': 'Dheepak Karan E S, TamilTech-QA, 2026',
        'counts': dict(counts), 'file_sha256': hashes, 'approved_training_records': 0,
        'decision': 'Quarantined for quality review. No external record is admitted to training.',
        'limits': 'Synthetic labels and automatic flags do not establish factual accuracy or fluency. Keep original split provenance; create topic-grouped splits only after review.'}
    (OUT / 'audit.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
