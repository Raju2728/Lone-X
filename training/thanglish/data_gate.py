"""Validate review evidence before model downloads or GPU allocation.

The review record is a local attestation, not proof of reviewer identity or fluency.
"""
import hashlib
import json
import re
from datetime import date
from pathlib import Path


def normalized(text):
    return ' '.join(re.sub(r'[^a-z0-9 ]', ' ', text.lower()).split())


def validate_data(data_path, review_path=None, *, smoke=False, steps=100):
    here = Path(__file__).resolve().parent
    raw = Path(data_path).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    messages_list = []
    seen = set()
    protected = set()
    for filename in ['pilot-evaluation.json', 'final-evaluation.json']:
        protected.update(normalized(row['prompt']) for row in json.loads((here / filename).read_text(encoding='utf-8')))
    seed = json.loads((here / 'seed.json').read_text(encoding='utf-8'))
    protected.update(normalized(row['prompt']) for row in seed['evaluation'])
    for line in raw.decode('utf-8-sig').splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        if not isinstance(record, dict):
            raise ValueError('Training records must be JSON objects')
        messages = record.get('messages')
        if not isinstance(messages, list) or len(messages) != 3 or any(not isinstance(m, dict) for m in messages):
            raise ValueError('Expected system/user/assistant records')
        if [m.get('role') for m in messages] != ['system', 'user', 'assistant']:
            raise ValueError('Expected system/user/assistant roles')
        if any(not isinstance(m.get('content'), str) or not m['content'].strip() for m in messages):
            raise ValueError('Every message must contain nonempty text')
        key = normalized(messages[1]['content'])
        if not key or key in seen or key in protected:
            raise ValueError('Empty normalized prompt, duplicate prompt or known evaluation overlap')
        seen.add(key)
        messages_list.append(messages)
    if not messages_list:
        raise ValueError('Training data is empty')
    if smoke:
        seed_digest = hashlib.sha256((here / 'train.jsonl').read_bytes()).hexdigest()
        if steps != 1 or digest != seed_digest:
            raise ValueError('Smoke exception permits only the unchanged seed content and exactly one step')
    else:
        if review_path is None:
            raise ValueError('A --review-manifest is required; pending drafts cannot enter full training')
        review = json.loads(Path(review_path).read_text(encoding='utf-8-sig'))
        if not isinstance(review, dict):
            raise ValueError('Review manifest must be a JSON object')
        if review.get('status') != 'approved' or review.get('data_sha256') != digest:
            raise ValueError('Review must approve the exact dataset SHA-256')
        reviewer = review.get('independent_reviewer')
        if not isinstance(reviewer, str) or not reviewer.strip() or reviewer.strip().lower() in {'ai', 'ai assistant', 'assistant', 'pending', 'todo'}:
            raise ValueError('Record the independent reviewer; assistant-only review is insufficient')
        try:
            reviewed_on = date.fromisoformat(review['reviewed_on'])
        except (KeyError, ValueError, TypeError):
            raise ValueError('Review date must be YYYY-MM-DD') from None
        if reviewed_on > date.today():
            raise ValueError('Review date cannot be in the future')
        if type(review.get('record_count')) is not int or review['record_count'] != len(messages_list):
            raise ValueError('Review record count does not match the dataset')
        checks = review.get('checks', {})
        required = ['natural_thanglish', 'factual_accuracy', 'capability_honesty',
                    'literal_and_code_accuracy', 'license_and_provenance', 'topic_and_conversation_split']
        if not isinstance(checks, dict) or any(checks.get(name) is not True for name in required):
            raise ValueError('All required review checks must be explicitly true')
    return {'messages': messages_list, 'sha256': digest, 'smoke_only': smoke}
