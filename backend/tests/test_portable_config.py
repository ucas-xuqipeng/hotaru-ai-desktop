import contextlib
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import yaml

class PortableTests(unittest.TestCase):
    def test_config_relocates_only_local_fields_without_disclosing_api(self):
        from portable.configuration import prepare_backend_config
        with tempfile.TemporaryDirectory(prefix='萤 portable ') as tmp:
            root = Path(tmp); (root / 'config').mkdir()
            api = {'provider': {'api_key': 'dummy-secret', 'base_url': 'https://dummy.invalid', 'model': 'dummy'}}
            original = {'system_config': {'host': '0.0.0.0', 'port': 12393}, 'character_config': {'live2d_model_name': 'Hotaru', 'agent_config': {'llm_configs': api}, 'asr_config': {'sherpa_onnx_asr': {'sense_voice': 'F:/old/models/sense/model.onnx', 'tokens': 'F:/old/models/sense/tokens.txt'}}, 'tts_config': {'gpt_sovits_tts': {'api_url': 'http://old:9880', 'ref_audio_path': 'F:/old/Hotaru/reference.wav'}}}}
            source = root / 'config/config.yaml'; source.write_text(yaml.safe_dump(original), encoding='utf-8')
            before = source.read_bytes(); output = io.StringIO()
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
                result = prepare_backend_config(root, 32101, 32102)
            self.assertEqual(result['system_config']['host'], '127.0.0.1')
            self.assertEqual(result['system_config']['port'], 32101)
            char = result['character_config']
            self.assertEqual(char['agent_config']['llm_configs'], api)
            self.assertEqual(char['tts_config']['gpt_sovits_tts']['ref_audio_path'], str(root / 'voice/Hotaru/reference.wav'))
            self.assertEqual(char['tts_config']['gpt_sovits_tts']['api_url'], 'http://127.0.0.1:32102/tts')
            self.assertEqual(char['asr_config']['sherpa_onnx_asr']['tokens'], str(root / 'backend/models/sense/tokens.txt'))
            self.assertEqual(source.read_bytes(), before)
            self.assertEqual(output.getvalue(), '')
            self.assertEqual(list(root.rglob('*.yaml')), [source])
            for invalid in (0, -1, 65536, True, '123'):
                with self.assertRaises(ValueError): prepare_backend_config(root, invalid, 32102)

    def test_voice_config_and_device_selection(self):
        from portable.configuration import build_voice_config
        from portable.launch_voice import select_device
        for device in ('cpu', 'cuda'):
            config = build_voice_config(Path('X:/萤 portable'), device)['custom']
            self.assertEqual(config['is_half'], device == 'cuda')
            self.assertEqual(config['version'], 'v2ProPlus')
            self.assertTrue(Path(config['t2s_weights_path']).as_posix().endswith('voice/GPT_weights_v2ProPlus/萤_GPT_e8.ckpt'))
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(select_device(False, lambda: True), 'cuda')
            self.assertEqual(select_device(False, lambda: False), 'cpu')
            self.assertEqual(select_device(True, lambda: True), 'cpu')
        with patch.dict(os.environ, {'HOTARU_FORCE_CPU': '1'}):
            self.assertEqual(select_device(False, lambda: True), 'cpu')

    def test_history_and_cache_use_real_relocated_files(self):
        from open_llm_vtuber import chat_history_manager as history
        from open_llm_vtuber.tts.tts_interface import TTSInterface
        class TTS(TTSInterface):
            def generate_audio(self, text, file_name_no_ext=None): pass
        with tempfile.TemporaryDirectory(prefix='萤 data ') as tmp:
            root = Path(tmp)
            with patch.dict(os.environ, {'HOTARU_HISTORY_DIR': str(root/'history'), 'HOTARU_CACHE_DIR': str(root/'cache')}):
                uid = history.create_new_history('hotaru')
                history.store_message('hotaru', uid, 'human', '测试')
                self.assertEqual(history.get_history('hotaru', uid)[0]['content'], '测试')
                self.assertTrue((root/'history/hotaru'/ (uid+'.json')).is_file())
                audio = Path(TTS().generate_cache_file_name('test'))
                audio.write_bytes(b'RIFF')
                self.assertEqual(audio, root/'cache/test.wav')
            with patch.dict(os.environ, {}, clear=True):
                self.assertEqual(history._get_safe_history_path('hotaru', 'test'), os.path.join('chat_history','hotaru','test.json'))
                self.assertEqual(TTS().generate_cache_file_name('test'), os.path.join('cache', 'test.wav'))

    def test_legacy_runtime_default_and_portable_environment(self):
        from hotaru_runtime import runtime_settings
        with patch.dict(os.environ, {}, clear=True):
            settings = runtime_settings()
            self.assertEqual(settings['port'], 12393)
            self.assertEqual(settings['config_path'].name, 'conf.yaml')
        with tempfile.TemporaryDirectory(prefix='萤 root ') as tmp:
            with patch.dict(os.environ, {'HOTARU_BUNDLE_ROOT': tmp, 'HOTARU_APP_PORT': '32001', 'HOTARU_TTS_PORT': '32002'}):
                settings = runtime_settings()
                self.assertEqual(os.environ['PATH'].split(os.pathsep)[0], str(Path(tmp)/'runtime/app'))
                self.assertEqual(settings['root'], Path(tmp)/'backend')
                self.assertEqual(settings['log_dir'], Path(tmp)/'data/logs')
                self.assertEqual(os.environ['HOTARU_HISTORY_DIR'], str(Path(tmp)/'data/chat_history'))
                self.assertEqual(os.environ['HOTARU_CACHE_DIR'], str(Path(tmp)/'data/cache'))

class LauncherTests(unittest.TestCase):
    def test_absolute_voice_entry_writes_only_public_model_yaml(self):
        from portable.launch_voice import main
        import sys
        with tempfile.TemporaryDirectory(prefix='萤 launcher ') as tmp:
            root = Path(tmp); (root/'voice').mkdir()
            cwd = Path.cwd(); old_path = sys.path[:]; old_argv = sys.argv[:]
            try:
                with patch.dict(os.environ, {'HOTARU_FORCE_CPU': '1'}), patch('portable.launch_voice.runpy.run_path') as run:
                    main(['--root', tmp, '--port', '33001'])
                    self.assertEqual(Path.cwd(), root/'voice')
                    self.assertEqual(sys.argv[-4:], ['-a', '127.0.0.1', '-p', '33001'])
                    run.assert_called_once_with(str(root/'voice/api_v2.py'), run_name='__main__')
                    config = yaml.safe_load((root/'data/voice-runtime.yaml').read_text('utf-8'))
                    self.assertFalse(config['custom']['is_half'])
                    self.assertEqual(sys.path[:2], [str(root/'voice'), str(root/'voice/GPT_SoVITS')])
            finally:
                os.chdir(cwd); sys.path[:] = old_path; sys.argv[:] = old_argv

class RelocationEdgeTests(unittest.TestCase):
    def test_default_config_listing_uses_portable_config_without_legacy_file(self):
        from open_llm_vtuber.config_manager.utils import scan_config_alts_directory, read_yaml
        with tempfile.TemporaryDirectory(prefix='萤 config ') as tmp:
            root = Path(tmp); (root / 'config').mkdir(); (root / 'backend').mkdir()
            (root / 'backend/characters').mkdir()
            config = {'system_config': {}, 'character_config': {
                'conf_name': '萤', 'tts_config': {'gpt_sovits_tts': {}},
                'asr_config': {}, 'agent_config': {'llm_configs': {'test': {'api_key': 'dummy'}}}}}
            (root / 'config/config.yaml').write_text(yaml.safe_dump(config), encoding='utf-8')
            original = Path.cwd()
            try:
                os.chdir(root / 'backend')
                with patch.dict(os.environ, {'HOTARU_BUNDLE_ROOT': str(root),
                                              'HOTARU_APP_PORT': '33001', 'HOTARU_TTS_PORT': '33002'}):
                    self.assertEqual(scan_config_alts_directory('characters'),
                                     [{'filename': 'conf.yaml', 'name': '萤'}])
                    self.assertEqual(read_yaml('conf.yaml')['character_config']['tts_config']
                                     ['gpt_sovits_tts']['api_url'], 'http://127.0.0.1:33002/tts')
                    self.assertFalse(Path('conf.yaml').exists())
            finally:
                os.chdir(original)

    def test_whisper_cpp_directory_is_relocated(self):
        from portable.configuration import prepare_backend_config
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root/'config').mkdir()
            config = {'system_config': {}, 'character_config': {'asr_config': {'whisper_cpp': {'model_dir': 'F:/old/models/whisper-cpp'}}}}
            (root/'config/config.yaml').write_text(yaml.safe_dump(config), encoding='utf-8')
            result = prepare_backend_config(root, 32001, 32002)
            self.assertEqual(result['character_config']['asr_config']['whisper_cpp']['model_dir'], str(root/'backend/models/whisper-cpp'))

    def test_asset_paths_cannot_escape_bundle(self):
        from portable.configuration import _asset_path
        with self.assertRaises(ValueError):
            _asset_path(Path('backend'), 'models/../../outside')

class VoiceConsumerTests(unittest.TestCase):
    def test_prepared_endpoint_is_consumed_by_real_tts_engine(self):
        from portable.configuration import prepare_backend_config
        from open_llm_vtuber.tts.gpt_sovits_tts import TTSEngine
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root/'config').mkdir()
            original = {'system_config': {}, 'character_config': {'tts_config': {'gpt_sovits_tts': {}}}}
            (root/'config/config.yaml').write_text(yaml.safe_dump(original), encoding='utf-8')
            config = prepare_backend_config(root, 34001, 34002)
            engine = TTSEngine(**config['character_config']['tts_config']['gpt_sovits_tts'])
            def request(url, params, timeout):
                self.assertEqual(url, 'http://127.0.0.1:34002/tts')
                self.assertEqual(params['ref_audio_path'], str(root/'voice/Hotaru/reference.wav'))
                return SimpleNamespace(status_code=200, content=b'RIFF-test-audio')
            with patch.dict(os.environ, {'HOTARU_CACHE_DIR': str(root/'cache')}), patch('open_llm_vtuber.tts.gpt_sovits_tts.requests.get', side_effect=request):
                audio = engine.generate_audio('こんにちは')
                self.assertEqual(Path(audio).read_bytes(), b'RIFF-test-audio')
