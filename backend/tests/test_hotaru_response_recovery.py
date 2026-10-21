import asyncio
import json
import unittest

from open_llm_vtuber.agent.agents.hotaru_bilingual_agent import HotaruBilingualAgent
from open_llm_vtuber.agent.input_types import BatchInput, TextData, TextSource


VALID = '{"segments":[{"ja":"こんにちは。","zh":"你好。","emotion":"happy","motion":"nod"}]}'


class ModelReplies:
    """External model boundary with ordered streamed replies."""

    def __init__(self, replies, delay=0):
        self.replies = replies
        self.delay = delay
        self.requests = []
        self.closed = 0
        self.repair_started = asyncio.Event()

    async def chat_completion(self, messages, system):
        index = len(self.requests)
        self.requests.append(messages)
        if index == 1:
            self.repair_started.set()
        try:
            await asyncio.sleep(self.delay)
            yield self.replies[min(index, len(self.replies) - 1)]
        finally:
            self.closed += 1


class ResponseRecoveryTests(unittest.IsolatedAsyncioTestCase):
    async def collect(self, agent):
        data = BatchInput(texts=[TextData(TextSource.INPUT, '你好')])
        return [item async for item in agent.chat(data)]

    def test_top_level_segment_array_is_valid_dialogue(self):
        outputs = HotaruBilingualAgent.parse_response(
            '[{"ja":"こんにちは。","zh":"你好。","motion":"nod"}]'
        )
        self.assertEqual(outputs[0].tts_text, 'こんにちは。')
        self.assertEqual(outputs[0].display_text.text, '你好。')
        self.assertEqual(outputs[0].actions.motions, ['mtn_nod01_C'])

    def test_json_string_wrapping_a_response_is_decoded_once(self):
        outputs = HotaruBilingualAgent.parse_response(json.dumps(VALID))
        self.assertEqual(outputs[0].display_text.text, '你好。')

    async def test_invalid_first_reply_is_repaired_without_polluting_next_turn(self):
        model = ModelReplies(['你好，我是萤。', VALID, VALID])
        agent = HotaruBilingualAgent(model, '')
        outputs = await self.collect(agent)
        self.assertEqual(outputs[0].tts_text, 'こんにちは。')
        self.assertEqual(outputs[0].display_text.text, '你好。')
        self.assertEqual(len(model.requests), 2)
        self.assertEqual(model.closed, 2)
        await self.collect(agent)
        self.assertEqual(model.requests[-1], [
            {'role': 'user', 'content': '你好'},
            {'role': 'assistant', 'content': '你好。'},
            {'role': 'user', 'content': '你好'},
        ])

    async def test_repeated_invalid_response_stops_after_one_repair(self):
        model = ModelReplies(['null'])
        agent = HotaruBilingualAgent(model, '')
        with self.assertRaisesRegex(ValueError, '重新发送'):
            await self.collect(agent)
        self.assertEqual(len(model.requests), 2)
        self.assertEqual(model.closed, 2)
        self.assertEqual(agent._memory, [])

    async def test_cancellation_during_repair_closes_stream_without_memory(self):
        model = ModelReplies(['null', VALID], delay=0.02)
        agent = HotaruBilingualAgent(model, '')
        task = asyncio.create_task(self.collect(agent))
        await asyncio.wait_for(model.repair_started.wait(), 0.5)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(model.closed, 2)
        self.assertEqual(agent._memory, [])

    async def test_timeout_budget_covers_initial_response_and_repair_together(self):
        model = ModelReplies(['null', VALID], delay=0.12)
        agent = HotaruBilingualAgent(model, '', timeout_seconds=0.20)
        with self.assertRaises(TimeoutError):
            await self.collect(agent)
        self.assertEqual(model.closed, 2)
        self.assertEqual(agent._memory, [])

    def test_compatibility_does_not_accept_invalid_languages_or_unbounded_arrays(self):
        for raw in ['[]', '[{"ja":"你好","zh":"你好"}]',
                    '[{"ja":"はい。","zh":"はい。"}]',
                    json.dumps(json.dumps(VALID)),
                    '[' + ','.join(['{"ja":"はい。","zh":"好的。"}'] * 9) + ']']:
            with self.subTest(raw=raw[:30]), self.assertRaises(ValueError):
                HotaruBilingualAgent.parse_response(raw)
