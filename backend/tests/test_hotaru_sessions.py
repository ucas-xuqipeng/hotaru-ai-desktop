import unittest
from pathlib import Path
from src.open_llm_vtuber.config_manager import validate_config, read_yaml
from src.open_llm_vtuber.service_context import ServiceContext
from src.open_llm_vtuber.websocket_handler import WebSocketHandler
from src.open_llm_vtuber.agent.agents.hotaru_bilingual_agent import HotaruBilingualAgent


class SessionTests(unittest.IsolatedAsyncioTestCase):
    async def test_opening_another_tab_does_not_share_or_reset_the_existing_conversation(self):
        config = validate_config(read_yaml(str(Path('config_templates/conf.ZH.default.yaml'))))
        config.character_config.agent_config.conversation_agent_choice = 'hotaru_bilingual_agent'
        cache = ServiceContext()
        cache.config = config
        cache.character_config = config.character_config
        cache.system_config = config.system_config
        cache.agent_engine = HotaruBilingualAgent(object(), 'persona')
        handler = WebSocketHandler(cache)
        first = await handler._init_service_context(None, 'first-tab')
        first.agent_engine._memory = [{'role': 'user', 'content': '我叫小明'}]
        second = await handler._init_service_context(None, 'second-tab')
        self.assertIsNot(first.agent_engine, second.agent_engine)
        second.agent_engine.set_memory_from_history('unused-test-config', 'empty-history')
        self.assertEqual(first.agent_engine._memory, [{'role': 'user', 'content': '我叫小明'}])
        self.assertEqual(second.agent_engine._memory, [])


if __name__ == '__main__':
    unittest.main()
