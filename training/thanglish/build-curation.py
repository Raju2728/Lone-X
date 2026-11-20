"""Build an attributed correction queue, never a training-approved dataset."""
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def normalize(text):
    return ' '.join(re.sub(r'[^a-z0-9 ]', ' ', text.lower()).split())


def main():
    batch_path = HERE / 'curation-batch-01.json'
    batch = json.loads(batch_path.read_text(encoding='utf-8'))
    source = ROOT / 'test-artifacts/data-sources/Zapd0s__Tanglish-Conversational-SFT' / batch['revision'] / 'dataset.csv'
    with source.open(encoding='utf-8-sig', newline='') as handle:
        originals = list(csv.DictReader(handle))
    protected = set()
    for filename in ['pilot-evaluation.json', 'final-evaluation.json']:
        protected.update(normalize(row['prompt']) for row in json.loads((HERE / filename).read_text(encoding='utf-8')))
    seed = json.loads((HERE / 'seed.json').read_text(encoding='utf-8'))
    protected.update(normalize(row['prompt']) for row in seed['evaluation'])
    seen_questions, seen_ids = set(), set()
    rows = []
    for item in batch['corrections']:
        row_id = item['source_row']
        if not isinstance(row_id, int) or not 1 <= row_id <= len(originals) or row_id in seen_ids:
            raise ValueError('Invalid or duplicate source row')
        original = originals[row_id - 1]
        question, answer = item['question'].strip(), item['answer'].strip()
        key = normalize(question)
        if not key or not answer or not item['reason'].strip() or not item['topic'].strip():
            raise ValueError('Missing correction content')
        if key in seen_questions or key in protected:
            raise ValueError('Duplicate or exact normalized evaluation overlap')
        if re.search(r'[\u0b80-\u0bff]', question + answer) or '<|' in question + answer:
            raise ValueError('Unexpected script or chat-template delimiter')
        seen_ids.add(row_id)
        seen_questions.add(key)
        rows.append({
            'source_row': row_id, 'topic': item['topic'],
            'original_question': original['question'], 'original_answer': original['answer'],
            'corrected_question': question, 'corrected_answer': answer,
            'correction_reason': item['reason'],
            'review_status': 'assistant_corrected_pending_independent_review',
            'reviewer': 'AI assistant', 'independent_reviewer': '',
            'approved_for_training': False,
        })
    output = ROOT / 'test-artifacts/thanglish-curation-batch-01'
    output.mkdir(parents=True, exist_ok=True)
    with (output / 'corrections.csv').open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    content = ''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in rows)
    (output / 'corrections.jsonl').write_text(content, encoding='utf-8', newline='\n')
    manifest = {
        'source': batch['source'], 'revision': batch['revision'],
        'url': 'https://huggingface.co/datasets/' + batch['source'],
        'publisher_declared_license': batch['license'],
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'batch_sha256': hashlib.sha256(batch_path.read_bytes()).hexdigest(),
        'output_sha256': hashlib.sha256(content.encode('utf-8')).hexdigest(),
        'corrected_rows': len(rows), 'approved_training_rows': 0,
        'topics': sorted({row['topic'] for row in rows}),
        'checks': ['source IDs in bounds and unique', 'nonempty correction and reason',
                   'unique normalized questions', 'no exact normalized known evaluation overlap',
                   'Latin-script targets', 'no chat-template delimiters'],
        'limitations': 'Assistant review only. Automated checks do not establish factual correctness or fluency. Semantic and topic overlap still require review. No training was started.',
    }
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    (output / 'ATTRIBUTION.txt').write_text(
        'Source: Tanglish-Conversational-SFT by Zapd0s\n' + manifest['url']
        + '\nRevision: ' + batch['revision']
        + '\nPublisher-declared license: CC BY 4.0\nhttps://creativecommons.org/licenses/by/4.0/\n'
        'Modifications by the Lone X project: questions rewritten for standalone context; '
        'answers rewritten to correct factual, identity, capability and style problems; '
        'review fields and reasons added. Original rows retained for comparison.\n'
        'Original creator endorsement is not implied. No row has independent review or training approval.\n', encoding='utf-8')
    print(json.dumps({'corrected_rows': len(rows), 'approved_training_rows': 0,
                      'output': str(output), 'checks': 'passed'}, indent=2))


if __name__ == '__main__':
    main()
