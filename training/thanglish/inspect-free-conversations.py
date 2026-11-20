"""Conservative source triage. Eligibility is not training approval."""
import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'test-artifacts/data-sources/Zapd0s__Tanglish-Conversational-SFT/2dd1079b4e9e46df9b91c1c4f7ee6dfeb0834fc0/dataset.csv'
OUT = ROOT / 'test-artifacts/thanglish-conversation-review'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    seen = set()
    protected = set()
    for filename in ['pilot-evaluation.json', 'final-evaluation.json']:
        protected.update(item['prompt'].lower().strip() for item in json.loads(Path(__file__).with_name(filename).read_text()))
    counts = Counter()
    candidates = []
    with SOURCE.open(encoding='utf-8-sig', newline='') as handle:
        for number, row in enumerate(csv.DictReader(handle), 1):
            question, answer = row['question'].strip(), row['answer'].strip()
            text = question + ' ' + answer
            flags = []
            counts['total'] += 1
            key = ' '.join(re.sub(r'[^a-z0-9 ]', ' ', question.lower()).split())
            if not 12 <= len(question) <= 1500 or not 30 <= len(answer) <= 3000:
                flags.append('length')
            if re.search(r'[\u0b80-\u0bff]', text):
                flags.append('Tamil_script')
            if key in seen:
                flags.append('duplicate_question')
            seen.add(key)
            if question.lower() in protected:
                flags.append('known_evaluation_overlap')
            if re.match(r'(?i)^(aama|oh|seri|appo|apdi|adhu|idhu|exact|correct|super|semma|sema|then|okay|ok|yes|illai)\b', question):
                flags.append('dependent_followup')
            if re.search(r'(?i)\b(budget|discount|cashback|sale|emi|loan|sip|funds|equity|stock|gold|rupees|rs\.?|price|buy|vaangu|vanganum|vaanganum|vaanga)\b', text):
                flags.append('shopping_financial_claim')
            if re.search(r'(?i)\b(health|doctor|medicine|medical|blood|diabetes|diet|pain|symptom|hospital|legal|lawyer|visa|tax|police)\b', text):
                flags.append('specialist_advice')
            if re.search(r'(?i)(en peru|enaku.{0,45}(experience|family|wife|husband)|naan.{0,70}(work|company|college|office)|i (work|live|bought)|namma.{0,30}(ponnu|paiyan))', answer):
                flags.append('human_persona')
            if re.search(r'(?i)\b(panniten|pannitten|seithen|saved|guaranteed|compulsory|always|never)\b|<\|', answer):
                flags.append('action_or_absolute_claim')
            if re.search(r'(?i)\b(password|otp|api key|sudo|format c:|rm -rf|torrent|crack)\b', text):
                flags.append('credential_or_command_review')
            for flag in flags:
                counts[flag] += 1
            if flags:
                counts['flagged_rows'] += 1
                continue
            candidates.append({'source_row': number, 'question': question, 'answer': answer,
                'review_status': 'pending', 'approved_for_training': False})
    with (OUT / 'candidates.jsonl').open('w', encoding='utf-8') as handle:
        for row in candidates:
            handle.write(json.dumps(row, ensure_ascii=False) + '\n')
    with (OUT / 'review.csv').open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=['source_row', 'question', 'answer', 'review_status', 'approved_for_training', 'corrected_question', 'corrected_answer', 'reviewer', 'notes'])
        writer.writeheader()
        writer.writerows(candidates)
    result = {'dataset': 'Zapd0s/Tanglish-Conversational-SFT', 'revision': '2dd1079b4e9e46df9b91c1c4f7ee6dfeb0834fc0',
        'url': 'https://huggingface.co/datasets/Zapd0s/Tanglish-Conversational-SFT',
        'declared_license': 'CC BY 4.0', 'license_url': 'https://creativecommons.org/licenses/by/4.0/',
        'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(), 'counts': dict(counts),
        'review_candidates': len(candidates), 'approved_training_rows': 0,
        'limitations': 'Heuristic flags overlap and cannot establish correctness, independence, topic separation or native fluency. Data remains quarantined; no training performed.'}
    (OUT / 'audit.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    (OUT / 'ATTRIBUTION.txt').write_text(
        'Tanglish-Conversational-SFT by Zapd0s\n'
        + result['url'] + '\nRevision: ' + result['revision'] + '\n'
        'Publisher-declared license: CC BY 4.0\n' + result['license_url'] + '\n'
        'Changes: extracted question/answer rows and applied heuristic exclusions; '
        'added source row IDs and review fields. Original candidate wording preserved.\n'
        'No endorsement by the original author is implied. All rows remain pending review.\n',
        encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
