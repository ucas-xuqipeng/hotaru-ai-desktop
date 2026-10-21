import asyncio
import json
import os
import threading
import unittest
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, HTTPServer

from src.open_llm_vtuber.agent.output_types import DisplayText
from src.open_llm_vtuber.conversations.tts_manager import TTSTaskManager
from src.open_llm_vtuber.tts.gpt_sovits_tts import TTSEngine


class FailedVoiceHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(503)
        self.end_headers()
        self.wfile.write(b'voice unavailable')

    def log_message(self, *args):
        pass


class TTSErrorTests(unittest.TestCase):
    def test_failed_voice_http_request_raises_instead_of_returning_no_audio(self):
        server = HTTPServer(('127.0.0.1', 0), FailedVoiceHandler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            engine = TTSEngine(api_url=f'http://127.0.0.1:{server.server_port}/tts')
            with patch.dict(os.environ, {'NO_PROXY': '127.0.0.1', 'no_proxy': '127.0.0.1'}):
                with self.assertRaisesRegex(RuntimeError, '503'):
                    engine.generate_audio('こんにちは。')
        finally:
            server.shutdown()
            server.server_close()
            worker.join()


class AudioFailureBoundary:
    async def async_generate_audio(self, **kwargs):
        return None


class PayloadErrorTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_generated_audio_sends_visible_error_not_a_normal_silent_reply(self):
        manager = TTSTaskManager()
        messages = []
        delivered = asyncio.Event()

        async def send(raw):
            messages.append(json.loads(raw))
            delivered.set()

        try:
            await manager.speak('こんにちは。', DisplayText('你好。'), None, None,
                                AudioFailureBoundary(), send)
            await asyncio.gather(*manager.task_list)
            await asyncio.wait_for(delivered.wait(), timeout=2)
            self.assertEqual(messages[0]['type'], 'error')
            self.assertIn('重试', messages[0]['message'])
            self.assertNotIn('audio', messages[0])
        finally:
            sender = manager._sender_task
            manager.clear()
            if sender:
                await asyncio.gather(sender, return_exceptions=True)
