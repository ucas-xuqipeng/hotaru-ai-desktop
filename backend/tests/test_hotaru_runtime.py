import unittest
from hotaru_runtime import redact_message


class LoggingTests(unittest.TestCase):
    def test_config_values_cannot_reveal_saved_keys_in_error_messages(self):
        self.assertEqual(
            redact_message("bad config: {'llm_api_key': 'private-test-value'}", ['private-test-value']),
            "bad config: {'llm_api_key': '[REDACTED]'}",
        )

    def test_empty_secret_does_not_damage_diagnostic_text(self):
        self.assertEqual(redact_message('model missing', ['', None]), 'model missing')


if __name__ == '__main__':
    unittest.main()
