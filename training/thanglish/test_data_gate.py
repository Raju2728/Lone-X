import hashlib
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from data_gate import validate_data


class DataGateTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[2] / 'test-artifacts'
        root.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=root)
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.data = self.folder / 'renamed-draft.jsonl'
        self.review = self.folder / 'review.json'
        self.row = {'messages': [
            {'role': 'system', 'content': 'Respond helpfully.'},
            {'role': 'user', 'content': 'Indha unit-test fixture question-ku badhil sollunga.'},
            {'role': 'assistant', 'content': 'Idhu oru test example.'}]}
        self.write_rows([self.row])

    def write_rows(self, rows):
        self.data.write_text(''.join(json.dumps(row) + '\n' for row in rows), encoding='utf-8', newline='\n')

    def approve_fixture(self, **changes):
        record = {'status': 'approved', 'data_sha256': hashlib.sha256(self.data.read_bytes()).hexdigest(),
                  'record_count': 1, 'independent_reviewer': 'TEST FIXTURE ONLY',
                  'reviewed_on': date.today().isoformat(), 'checks': {name: True for name in [
                      'natural_thanglish', 'factual_accuracy', 'capability_honesty',
                      'literal_and_code_accuracy', 'license_and_provenance', 'topic_and_conversation_split']}}
        record.update(changes)
        self.review.write_text(json.dumps(record), encoding='utf-8')

    def test_unreviewed_renamed_draft_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'review-manifest'):
            validate_data(self.data)

    def test_matching_review_is_accepted(self):
        self.approve_fixture()
        result = validate_data(self.data, self.review)
        self.assertEqual(len(result['messages']), 1)
        self.assertFalse(result['smoke_only'])

    def test_changed_data_invalidates_review(self):
        self.approve_fixture()
        self.row['messages'][2]['content'] = 'Changed answer.'
        self.write_rows([self.row])
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            validate_data(self.data, self.review)

    def test_pending_assistant_and_incomplete_reviews_are_rejected(self):
        for changes in [{'status': 'pending'}, {'independent_reviewer': 'AI assistant'},
                        {'checks': {}}, {'record_count': 2}, {'reviewed_on': 'invalid'},
                        {'reviewed_on': '2999-01-01'}]:
            with self.subTest(changes=changes):
                self.approve_fixture(**changes)
                with self.assertRaises(ValueError):
                    validate_data(self.data, self.review)

    def test_smoke_exception_is_content_bound_and_one_step(self):
        self.data.write_bytes(Path(__file__).with_name('train.jsonl').read_bytes())
        self.assertTrue(validate_data(self.data, smoke=True, steps=1)['smoke_only'])
        with self.assertRaisesRegex(ValueError, 'exactly one step'):
            validate_data(self.data, smoke=True, steps=2)
        self.write_rows([self.row])
        with self.assertRaisesRegex(ValueError, 'unchanged seed'):
            validate_data(self.data, smoke=True, steps=1)

    def test_duplicates_evaluation_and_invalid_messages_are_rejected(self):
        for rows in [[self.row, self.row], [{'messages': []}], [None]]:
            self.write_rows(rows)
            with self.assertRaises(ValueError):
                validate_data(self.data)
        case = json.loads(Path(__file__).with_name('final-evaluation.json').read_text())[0]
        self.row['messages'][1]['content'] = case['prompt']
        self.write_rows([self.row])
        with self.assertRaisesRegex(ValueError, 'evaluation overlap'):
            validate_data(self.data)


if __name__ == '__main__':
    unittest.main()
