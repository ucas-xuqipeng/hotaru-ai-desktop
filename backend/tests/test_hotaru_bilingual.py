import asyncio
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

from open_llm_vtuber.agent.input_types import BatchInput, TextData, TextSource

MODULE = "open_llm_vtuber.agent.agents.hotaru_bilingual_agent"


class ModelIO:
    def __init__(self, payload, wait=False):
        self.payload = payload
        self.wait = wait
        self.requests = []
        self.closed = False
        self.started = asyncio.Event()

    async def chat_completion(self, messages, system):
        self.requests.append((messages, system))
        self.started.set()
        try:
            if self.wait:
                await asyncio.sleep(10)
            yield self.payload
        finally:
            self.closed = True


class BilingualTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.assertIsNotNone(
            importlib.util.find_spec(MODULE), "bilingual agent must exist"
        )
        from open_llm_vtuber.agent.agents.hotaru_bilingual_agent import (
            HotaruBilingualAgent,
        )

        self.Agent = HotaruBilingualAgent

    def input(self, text="你好", **metadata):
        return BatchInput(texts=[TextData(TextSource.INPUT, text)], metadata=metadata)

    async def collect(self, agent, data=None):
        return [item async for item in agent.chat(data or self.input())]

    async def test_pairs_keep_japanese_speech_and_chinese_captions(self):
        model = ModelIO(
            json.dumps(
                {
                    "segments": [
                        {
                            "ja": "こんにちは。",
                            "zh": "你好。",
                            "emotion": "happy",
                            "motion": "nod",
                        },
                        {
                            "ja": "元気ですか？",
                            "zh": "你好吗？",
                            "emotion": "unknown",
                            "motion": "../x",
                        },
                    ]
                }
            )
        )
        agent = self.Agent(model, "Hotaru persona")
        out = await self.collect(agent)
        self.assertEqual([x.tts_text for x in out], ["こんにちは。", "元気ですか？"])
        self.assertEqual([x.display_text.text for x in out], ["你好。", "你好吗？"])
        self.assertEqual(
            out[0].actions.to_dict(),
            {"expressions": ["exp_smile01"], "motions": ["mtn_nod01_C"]},
        )
        self.assertEqual(out[1].actions.expressions, ["exp_idle01"])
        self.assertEqual(out[1].actions.motions, ["mtn_idle01_C"])
        await self.collect(agent, self.input("继续"))
        self.assertEqual(
            model.requests[1][0][1], {"role": "assistant", "content": "你好。你好吗？"}
        )
        self.assertIn("Hotaru persona", model.requests[0][1])

    async def test_fenced_single_segment(self):
        agent = self.Agent(
            ModelIO(
                '```json\n{"ja":"ありがとう。","zh":"谢谢。","emotion":"shy","motion":"bye"}\n```'
            ),
            "",
        )
        out = await self.collect(agent)
        self.assertEqual(out[0].tts_text, "ありがとう。")

    async def test_rejects_malformed_missing_wrong_language_or_oversized_text(self):
        for payload in [
            "raw Chinese text",
            "{}",
            '{"ja":"はい。"}',
            '{"ja":"你好","zh":"你好"}',
            '{"ja":"はい","zh":"はい"}',
            '{"ja":42,"zh":"你好"}',
            json.dumps({"ja": "あ" * 4000, "zh": "好"}),
        ]:
            with self.subTest(payload=payload[:60]):
                model = ModelIO(payload)
                agent = self.Agent(model, "")
                with self.assertRaises(ValueError):
                    await self.collect(agent)
                model.payload = '{"ja":"はい。","zh":"好的。"}'
                await self.collect(agent)
                self.assertEqual(len(model.requests[-1][0]), 1)

    async def test_cancelled_response_does_not_commit_history(self):
        model = ModelIO('{"ja":"はい。","zh":"好的。"}', wait=True)
        agent = self.Agent(model, "")
        task = asyncio.create_task(self.collect(agent))
        await model.started.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(model.closed)
        model.wait = False
        await self.collect(agent)
        self.assertEqual(len(model.requests[1][0]), 1)

    async def test_timeout_closes_model_stream(self):
        model = ModelIO("", wait=True)
        with self.assertRaises(TimeoutError):
            await self.collect(self.Agent(model, "", timeout_seconds=0.01))
        self.assertTrue(model.closed)

    async def test_interrupt_discards_pending_completion(self):
        model = ModelIO(
            '{"segments":[{"ja":"はい。","zh":"好的。"},{"ja":"またね。","zh":"再见。"}]}'
        )
        agent = self.Agent(model, "")
        stream = agent.chat(self.input())
        await anext(stream)
        agent.handle_interrupt("好的。")
        self.assertEqual([x async for x in stream], [])
        await self.collect(agent)
        self.assertNotIn("再见。", str(model.requests[1][0]))

    async def test_skip_memory_does_not_persist_turn(self):
        model = ModelIO('{"ja":"はい。","zh":"好的。"}')
        agent = self.Agent(model, "")
        await self.collect(agent, self.input(skip_memory=True))
        await self.collect(agent)
        self.assertEqual(len(model.requests[1][0]), 1)

    async def test_interrupt_stops_inflight_model_request(self):
        model = ModelIO("", wait=True)
        agent = self.Agent(model, "")
        task = asyncio.create_task(self.collect(agent))
        await model.started.wait()
        agent.handle_interrupt("")
        self.assertEqual(await asyncio.wait_for(task, 0.1), [])
        self.assertTrue(model.closed)

    async def test_interrupt_pending_turn_preserves_prior_completed_answer(self):
        model = ModelIO('{"ja":"はい。","zh":"之前的回答。"}')
        agent = self.Agent(model, "")
        await self.collect(agent)
        model.payload = '{"ja":"またね。","zh":"尚未听到的回答。"}'
        stream = agent.chat(self.input("第二轮"))
        await anext(stream)
        agent.handle_interrupt("")
        await stream.aclose()
        await self.collect(agent, self.input("第三轮"))
        self.assertEqual(
            model.requests[2][0][1], {"role": "assistant", "content": "之前的回答。"}
        )

    async def test_cancel_then_interrupt_preserves_previous_completed_turn(self):
        model = ModelIO('{"ja":"はい。","zh":"之前的回答。"}')
        agent = self.Agent(model, "")
        await self.collect(agent)
        model.started.clear()
        model.wait = True
        task = asyncio.create_task(self.collect(agent))
        await model.started.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        agent.handle_interrupt("")
        model.wait = False
        await self.collect(agent)
        self.assertEqual(
            model.requests[2][0][1], {"role": "assistant", "content": "之前的回答。"}
        )

    async def test_repeated_interrupt_does_not_duplicate_heard_caption(self):
        model = ModelIO('{"ja":"はい。","zh":"好的。"}')
        agent = self.Agent(model, "")
        stream = agent.chat(self.input())
        await anext(stream)
        agent.handle_interrupt("好")
        agent.handle_interrupt("好")
        await stream.aclose()
        await self.collect(agent)
        self.assertEqual(
            len([m for m in model.requests[1][0] if m["role"] == "assistant"]), 1
        )

    async def test_interrupted_skip_memory_turn_stays_out_of_history(self):
        model = ModelIO('{"ja":"はい。","zh":"好的。"}')
        agent = self.Agent(model, "")
        stream = agent.chat(self.input(skip_memory=True))
        await anext(stream)
        agent.handle_interrupt("好")
        await stream.aclose()
        await self.collect(agent)
        self.assertEqual(len(model.requests[1][0]), 1)

    async def test_partial_interruption_retains_user_and_heard_caption_together(self):
        model = ModelIO(
            '{"segments":[{"ja":"はい。","zh":"好的。"},{"ja":"またね。","zh":"再见。"}]}'
        )
        agent = self.Agent(model, "")
        stream = agent.chat(self.input("请介绍自己"))
        await anext(stream)
        agent.handle_interrupt("好的。")
        await stream.aclose()
        await self.collect(agent, self.input("继续"))
        self.assertEqual(
            model.requests[1][0],
            [
                {"role": "user", "content": "请介绍自己"},
                {"role": "assistant", "content": "好的。…"},
                {"role": "user", "content": "继续"},
            ],
        )

    async def test_completed_interruption_does_not_duplicate_current_user(self):
        model = ModelIO('{"ja":"はい。","zh":"好的。"}')
        agent = self.Agent(model, "")
        await self.collect(agent, self.input("问题一"))
        agent.handle_interrupt("好")
        await self.collect(agent, self.input("问题二"))
        self.assertEqual(
            model.requests[1][0],
            [
                {"role": "user", "content": "问题一"},
                {"role": "assistant", "content": "好…"},
                {"role": "user", "content": "问题二"},
            ],
        )

    async def test_more_than_forty_partial_interruptions_keep_memory_bounded(self):
        model = ModelIO('{"ja":"はい。","zh":"好的。"}')
        agent = self.Agent(model, "")
        for index in range(45):
            stream = agent.chat(self.input(f"问题{index}"))
            await anext(stream)
            agent.handle_interrupt("好")
            await stream.aclose()
        await self.collect(agent, self.input("继续"))
        request = model.requests[-1][0]
        self.assertEqual(len(request), 41)
        self.assertEqual(request[0], {"role": "user", "content": "问题25"})
        self.assertEqual(
            request[-3:],
            [
                {"role": "user", "content": "问题44"},
                {"role": "assistant", "content": "好…"},
                {"role": "user", "content": "继续"},
            ],
        )

    async def test_new_sessions_start_empty_and_keep_independent_memory(self):
        model = ModelIO('{"ja":"はい。","zh":"好的。"}')
        cached = self.Agent(model, "Hotaru persona")
        await self.collect(cached, self.input("缓存对话"))
        first, second = cached.new_session(), cached.new_session()
        await self.collect(first, self.input("第一会话"))
        await self.collect(second, self.input("第二会话"))
        await self.collect(first, self.input("第一会话继续"))
        self.assertEqual(
            model.requests[1][0], [{"role": "user", "content": "第一会话"}]
        )
        self.assertEqual(
            model.requests[2][0], [{"role": "user", "content": "第二会话"}]
        )
        self.assertEqual(
            model.requests[3][0],
            [
                {"role": "user", "content": "第一会话"},
                {"role": "assistant", "content": "好的。"},
                {"role": "user", "content": "第一会话继续"},
            ],
        )
        self.assertEqual(model.requests[1][1], model.requests[0][1])

    async def test_interrupt_one_session_does_not_cancel_or_block_another(self):
        model = ModelIO(
            '{"segments":[{"ja":"はい。","zh":"好的。"},{"ja":"またね。","zh":"再见。"}]}'
        )
        cached = self.Agent(model, "")
        first, second = cached.new_session(), cached.new_session()
        first_stream = first.chat(self.input("第一会话"))
        second_stream = second.chat(self.input("第二会话"))
        await anext(first_stream)
        await asyncio.wait_for(anext(second_stream), 0.2)
        first.handle_interrupt("好")
        self.assertEqual([x async for x in first_stream], [])
        self.assertEqual([x.display_text.text async for x in second_stream], ["再见。"])
        await self.collect(second, self.input("继续"))
        self.assertEqual(
            model.requests[2][0],
            [
                {"role": "user", "content": "第二会话"},
                {"role": "assistant", "content": "好的。再见。"},
                {"role": "user", "content": "继续"},
            ],
        )

    async def test_new_session_preserves_finite_generation_timeout(self):
        model = ModelIO("", wait=True)
        session = self.Agent(model, "persona", timeout_seconds=0.01).new_session()
        with self.assertRaises(TimeoutError):
            await self.collect(session)
        self.assertTrue(model.closed)

    async def test_factory_uses_basic_provider_without_mutating_config(self):
        from open_llm_vtuber.agent.agent_factory import AgentFactory
        from open_llm_vtuber.config_manager.agent import AgentConfig

        config = AgentConfig.model_validate(
            {
                "conversation_agent_choice": "hotaru_bilingual_agent",
                "agent_settings": {
                    "basic_memory_agent": {"llm_provider": "openai_compatible_llm"}
                },
                "llm_configs": {
                    "openai_compatible_llm": {
                        "base_url": "http://127.0.0.1:9/v1",
                        "model": "test-model",
                        "llm_api_key": "test-placeholder",
                        "interrupt_method": "user",
                    }
                },
            }
        )
        data = config.model_dump()
        before = json.loads(json.dumps(data))
        agent = AgentFactory.create_agent(**data, system_prompt="Hotaru")
        try:
            self.assertIsInstance(agent, self.Agent)
            self.assertEqual(data, before)
        finally:
            await agent._llm.client.close()

    async def test_history_reload_reads_chinese_captions_from_real_history_file(self):
        original = os.getcwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                folder = Path("chat_history/test-conf")
                folder.mkdir(parents=True)
                (folder / "test-history.json").write_text(
                    json.dumps(
                        [
                            {"role": "metadata"},
                            {"role": "human", "content": "你好"},
                            {"role": "ai", "content": "你好，我是萤。"},
                        ]
                    ),
                    encoding="utf-8",
                )
                model = ModelIO('{"ja":"はい。","zh":"好的。"}')
                agent = self.Agent(model, "")
                agent.set_memory_from_history("test-conf", "test-history")
                await self.collect(agent)
                self.assertEqual(
                    model.requests[0][0][:2],
                    [
                        {"role": "user", "content": "你好"},
                        {"role": "assistant", "content": "你好，我是萤。"},
                    ],
                )
            finally:
                os.chdir(original)


if __name__ == "__main__":
    unittest.main()
