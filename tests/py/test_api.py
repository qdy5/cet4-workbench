# -*- coding: utf-8 -*-
"""接口层测试：用临时数据库跑，不碰真实的 workbench.db。"""
import io
import json
import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

TMP = tempfile.mkdtemp(prefix='cet4-test-')
os.environ['CET4_DB'] = os.path.join(TMP, 'test.db')

import app as appmod  # noqa: E402


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        appmod.init_db()
        cls.c = appmod.app.test_client()

    def test_health(self):
        r = self.c.get('/api/health')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()['ok'])

    def test_content_shapes(self):
        meta = self.c.get('/api/meta').get_json()
        self.assertIn('exam', meta)
        self.assertIn('date', meta['exam'])
        self.assertEqual(meta['schedule']['newPerDay'], 30)

        words = self.c.get('/api/words').get_json()
        self.assertGreater(len(words), 4000)
        ids = {w['id'] for w in words}
        for w in words[:200]:
            self.assertEqual(len(w['dz']), 3, w['w'])
            for i in w['dz']:
                self.assertIn(i, ids)
                self.assertNotEqual(i, w['id'])
        self.assertNotIn('audio', words[0], '不该再带外部发音 URL')

        info = self.c.get('/api/info').get_json()
        self.assertEqual(len(info), len(words))
        self.assertTrue(any(x[1] for x in info), '例句不该是空的')

    def test_translation_points(self):
        items = self.c.get('/api/translation').get_json()
        self.assertTrue(items)
        for it in items:
            self.assertGreaterEqual(len(it['points']), 2)
            self.assertNotIn('keys', it, '旧的 keys 打分方式应已移除')

    def test_listening_audio_is_local(self):
        items = self.c.get('/api/listening').get_json()
        self.assertTrue(items)
        for it in items:
            if it['audio_url']:
                self.assertFalse(it['audio_url'].startswith('http'), it['audio_url'])

    def test_cards_roundtrip(self):
        self.assertEqual(self.c.get('/api/cards').get_json(), [])
        card = {'s': 3.2, 'd': 5.1, 'state': 'learning', 'reps': 1, 'lapses': 0,
                'due': 1762000000000, 'last': 1762000000000}
        self.assertEqual(self.c.post('/api/cards/1', json=card).status_code, 200)
        got = self.c.get('/api/cards/1').get_json()
        self.assertEqual(got['wordId'], 1)
        self.assertEqual(got['state'], 'learning')
        self.assertEqual(len(self.c.get('/api/cards').get_json()), 1)

    def test_events_and_export(self):
        ev = {'ts': 1762000000000, 'type': 'word', 'ref': '1', 'correct': 1, 'total': 1,
              'detail': {'rating': 3, 'isNew': True}}
        r = self.c.post('/api/events', json=ev)
        self.assertEqual(r.status_code, 200)
        self.assertIn('id', r.get_json())

        listed = self.c.get('/api/events?limit=10').get_json()
        self.assertEqual(listed[0]['type'], 'word')
        self.assertTrue(listed[0]['detail']['isNew'])

        exp = self.c.get('/api/export').get_json()
        self.assertEqual(exp['version'], 2)
        self.assertTrue(exp['cards'])
        self.assertTrue(exp['events'])

    def test_import_merge_keeps_more_advanced_card(self):
        better = {'wordId': 2, 's': 9, 'd': 5, 'state': 'review', 'reps': 5, 'lapses': 1,
                  'due': 1762100000000, 'last': 1762000000000}
        worse = {'wordId': 2, 's': 1, 'd': 5, 'state': 'new', 'reps': 1, 'lapses': 0,
                 'due': 1762000000000, 'last': 1762000000000}
        self.c.post('/api/import', json={'merge': True, 'cards': [better]})
        self.c.post('/api/import', json={'merge': True, 'cards': [worse]})
        got = self.c.get('/api/cards/2').get_json()
        self.assertEqual(got['reps'], 5)

    def test_import_dedupes_events(self):
        ev = {'id': 'fixed-1', 'ts': 1762000000000, 'type': 'reading', 'ref': '1',
              'correct': 3, 'total': 5}
        self.c.post('/api/import', json={'merge': True, 'events': [ev]})
        self.c.post('/api/import', json={'merge': True, 'events': [ev]})
        ids = [e['id'] for e in self.c.get('/api/events').get_json()]
        self.assertEqual(ids.count('fixed-1'), 1)

    def test_drafts(self):
        self.c.post('/api/drafts/tr-1', json={'text': 'hello'})
        self.assertEqual(self.c.get('/api/drafts/tr-1').get_json()['text'], 'hello')

    def test_settings(self):
        self.assertEqual(self.c.get('/api/settings').get_json()['newPerDay'], 30)
        out = self.c.post('/api/settings', json={'newPerDay': 15, 'bogus': 1}).get_json()
        self.assertEqual(out['newPerDay'], 15)
        self.assertNotIn('bogus', out)

    def test_reset(self):
        self.c.post('/api/reset')
        self.assertEqual(self.c.get('/api/cards').get_json(), [])
        self.assertEqual(self.c.get('/api/events').get_json(), [])

    def test_static_and_audio(self):
        r = self.c.get('/')
        self.assertEqual(r.status_code, 200)
        self.assertIn(b'<title>', r.data)
        self.assertEqual(self.c.get('/app.js').status_code, 200)
        self.assertEqual(self.c.get('/core/fsrs.js').status_code, 200)
        r = self.c.get('/audio/listen_1.mp3')
        self.assertEqual(r.status_code, 200)
        self.assertGreater(len(r.data), 1000)


if __name__ == '__main__':
    unittest.main()
