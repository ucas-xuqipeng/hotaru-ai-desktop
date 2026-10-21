"""Validated Japanese speech / Chinese caption agent for Hotaru."""

# Malformed JSON values consistently raise ValueError at the agent boundary.
# ruff: noqa: TRY004

import asyncio
import json
import math
import re
from contextlib import aclosing
from loguru import logger

from ...chat_history_manager import get_history
from ..input_types import BatchInput
from ..output_types import Actions, DisplayText, SentenceOutput
from .agent_interface import AgentInterface

EXPRESSIONS = {
    "neutral": "exp_idle01",
    "happy": "exp_smile01",
    "shy": "exp_shy01",
    "thinking": "exp_thinking01",
    "sad": "exp_sad01",
    "surprised": "exp_surprised01",
    "angry": "exp_angry01",
}
MOTIONS = {
    "idle": "mtn_idle01_C",
    "nod": "mtn_nod01_C",
    "smile": "mtn_smile01_C",
    "thinking": "mtn_thinking01_C",
    "surprised": "mtn_surprised01_C",
    "bye": "mtn_bye01_C",
    "sad": "mtn_sad01_C",
    "denial": "mtn_denial01_C",
}
MAX_RESPONSE = 16000
MAX_SEGMENTS = 8
MAX_TEXT = 1000
KANA = re.compile(r"[\u3041-\u3096\u30a1-\u30fa]")
HAN = re.compile(r"[\u3400-\u9fff]")


class HotaruBilingualAgent(AgentInterface):
    def __init__(self, llm, system: str, timeout_seconds: float = 60):
        if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
            raise ValueError("Timeout must be finite and positive")
        self._llm = llm
        self._persona = system
        self._timeout = timeout_seconds
        self._memory = []
        self._revision = 0
        self._last_turn_committed = False
        self._last_turn_user = None
        self._last_turn_skip = False
        self._interrupt_handled = False
        self._generation_task = None
        self._lock = asyncio.Lock()
        self._system = (
            system
            + """
Respond as Hotaru, a warm, casual Japanese companion. Understand the user's Chinese.
Return ONLY JSON: {"segments":[{"ja":"Japanese spoken dialogue","zh":"Chinese translation","emotion":"neutral","motion":"idle"}]}.
Use 1-8 short paired segments, at most 1000 characters per text. ja must be natural
Japanese with kana; zh must be Chinese without Japanese kana. No explanations,
markdown, stage directions, code, JSON, or translations inside spoken text.
Emotion choices: neutral, happy, shy, thinking, sad, surprised, angry.
Motion choices: idle, nod, smile, thinking, surprised, bye, sad, denial.
Conversation history contains Chinese captions; continue Japanese spoken dialogue.
"""
        )

    def new_session(self):
        """Create isolated conversation state while sharing the stateless model client."""
        return type(self)(self._llm, self._persona, timeout_seconds=self._timeout)

    @staticmethod
    def parse_response(raw: str):
        if not isinstance(raw, str) or len(raw) > MAX_RESPONSE:
            raise ValueError("Invalid bilingual response size")
        raw = raw.strip()
        if raw.startswith("```"):
            match = re.fullmatch(r"```(?:json)?\s*\n?(.*?)\s*```", raw, re.DOTALL)
            if not match:
                raise ValueError("Invalid JSON fence")
            raw = match.group(1)
        try:
            data = json.loads(raw)
            # Some compatible providers serialize the JSON response a second time.
            if isinstance(data, str):
                data = json.loads(data)
        except (ValueError, RecursionError):
            raise ValueError("Expected bilingual JSON response") from None
        if isinstance(data, list):
            data = {"segments": data}
        if not isinstance(data, dict):
            raise ValueError("Expected bilingual response object")
        segments = data.get("segments", [data])
        if not isinstance(segments, list) or not 1 <= len(segments) <= MAX_SEGMENTS:
            raise ValueError("Invalid segment count")
        outputs = []
        for segment in segments:
            if not isinstance(segment, dict):
                raise ValueError("Invalid segment")
            ja, zh = segment.get("ja"), segment.get("zh")
            if any(
                not isinstance(t, str) or not t.strip() or len(t) > MAX_TEXT
                for t in (ja, zh)
            ):
                raise ValueError("Missing or invalid paired dialogue")
            ja, zh = ja.strip(), zh.strip()
            if not KANA.search(ja) or not HAN.search(zh) or KANA.search(zh):
                raise ValueError("Dialogue language check failed")
            if any(c in ja + zh for c in "{}`"):
                raise ValueError("Structured payload cannot be spoken")
            emotion, motion = segment.get("emotion"), segment.get("motion")
            expression = (
                EXPRESSIONS.get(emotion, EXPRESSIONS["neutral"])
                if isinstance(emotion, str)
                else EXPRESSIONS["neutral"]
            )
            group = (
                MOTIONS.get(motion, MOTIONS["idle"])
                if isinstance(motion, str)
                else MOTIONS["idle"]
            )
            outputs.append(
                SentenceOutput(
                    DisplayText(zh),
                    ja,
                    Actions(expressions=[expression], motions=[group]),
                )
            )
        return outputs

    async def _generate(self, messages):
        # One total timeout covers the original response and the bounded repair.
        async with asyncio.timeout(self._timeout):
            request = messages
            for attempt in range(2):
                parts, size = [], 0
                async with aclosing(
                    self._llm.chat_completion(request, self._system)
                ) as stream:
                    async for chunk in stream:
                        if not isinstance(chunk, str):
                            raise ValueError("Unexpected nontext model response")
                        size += len(chunk)
                        if size > MAX_RESPONSE:
                            raise ValueError("Bilingual response too large")
                        parts.append(chunk)
                raw = "".join(parts)
                try:
                    return self.parse_response(raw)
                except ValueError as error:
                    if attempt:
                        raise ValueError(
                            "模型回复格式异常，自动修正未成功，请重新发送这句话。"
                        ) from None
                    # Log only the validation reason, never raw model content.
                    logger.warning("Retrying bilingual response format: {}", error)
                    request = [
                        *messages,
                        {"role": "assistant", "content": raw},
                        {
                            "role": "user",
                            "content": (
                                "上一条回复格式或语言不符合要求。请回答原来的问题，"
                                "只返回一个 JSON 对象，不要说明或代码围栏："
                                '{"segments":[{"ja":"こんにちは。",'
                                '"zh":"你好。","emotion":"happy","motion":"nod"}]}。'
                                "示例只是格式；内容请根据原问题生成。"
                                "ja 必须是含假名的日语，zh 必须是无假名的中文。"
                            ),
                        },
                    ]

    async def chat(self, input_data):
        if not isinstance(input_data, BatchInput):
            raise ValueError("Hotaru expects text input")
        text = "\n".join(
            t.content for t in input_data.texts if t.content.strip()
        ).strip()
        if not text or len(text) > MAX_RESPONSE:
            raise ValueError("Invalid user input")
        skip_memory = bool((input_data.metadata or {}).get("skip_memory"))
        async with self._lock:
            revision = self._revision
            user = {"role": "user", "content": text}
            self._last_turn_user = user
            self._last_turn_committed = False
            self._last_turn_skip = skip_memory
            self._interrupt_handled = False
            try:
                self._generation_task = asyncio.create_task(
                    self._generate([dict(m) for m in self._memory] + [user])
                )
                try:
                    outputs = await self._generation_task
                except asyncio.CancelledError:
                    if revision != self._revision:
                        return
                    raise
                for output in outputs:
                    if revision != self._revision:
                        return
                    yield output
                if revision == self._revision and not skip_memory:
                    self._memory.extend(
                        [
                            user,
                            {
                                "role": "assistant",
                                "content": "".join(
                                    o.display_text.text for o in outputs
                                ),
                            },
                        ]
                    )
                    self._memory = self._memory[-40:]
                    self._last_turn_committed = True
            finally:
                self._generation_task = None

    def handle_interrupt(self, heard_response: str) -> None:
        # Invalidate pending generation, including one paused at an output yield.
        if self._interrupt_handled:
            return
        self._interrupt_handled = True
        self._revision += 1
        if self._generation_task and not self._generation_task.done():
            self._generation_task.cancel()
        if self._last_turn_skip:
            return
        if (
            self._last_turn_committed
            and self._memory
            and self._memory[-1]["role"] == "assistant"
        ):
            self._memory.pop()
        if (
            isinstance(heard_response, str)
            and HAN.search(heard_response)
            and not KANA.search(heard_response)
        ):
            if not self._last_turn_committed and self._last_turn_user is not None:
                self._memory.append(dict(self._last_turn_user))
            self._memory.append(
                {"role": "assistant", "content": heard_response[:MAX_RESPONSE] + "…"}
            )
        self._memory = self._memory[-40:]

    def set_memory_from_history(self, conf_uid: str, history_uid: str) -> None:
        self._revision += 1
        self._last_turn_committed = False
        self._last_turn_user = None
        self._interrupt_handled = True
        if self._generation_task and not self._generation_task.done():
            self._generation_task.cancel()
        history = get_history(conf_uid, history_uid)
        roles = {"human": "user", "ai": "assistant"}
        self._memory = [
            {"role": roles[m["role"]], "content": m["content"][:MAX_RESPONSE]}
            for m in history
            if m.get("role") in roles
            and isinstance(m.get("content"), str)
            and m["content"].strip()
        ][-40:]
