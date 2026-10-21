import importlib.util
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1] / 'portable' / 'build_bundle.py'


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        spec = importlib.util.spec_from_file_location('build_bundle', MODULE)
        self.builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.builder)

    def put(self, path, value='fixture'):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding='utf-8')
        return path

    def fixture(self):
        paths = {name: self.root / name for name in (
            'backend_source', 'backend_assets', 'voice_source', 'desktop_source',
            'python_base', 'app_venv')}
        for path in paths.values():
            path.mkdir()
        entries = {
            'backend_source': ['hotaru_runtime.py', 'src/main.py', 'portable/configuration.py',
                'portable/build_bundle.py', 'tests/test_secret.py', 'prompts/a.txt',
                'mcp_servers.json', 'model_dict.json', 'LICENSE', 'config_templates/default.yaml',
                'config.yaml', 'chat_history/a.json', 'src/__pycache__/a.pyc'],
            'backend_assets': ['models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/model.int8.onnx',
                'models/unused/model.pt', 'live2d-models/a/model.json',
                'backgrounds/default.png', 'avatars/a.png', 'web_tool/a.js', 'logs/a.log'],
            'voice_source': ['api_v2.py', 'config.yaml', 'LICENSE', 'runtime/python.exe',
                'runtime/Lib/site-packages/users.pth', 'runtime/Lib/site-packages/nltk_data/a',
                'GPT_SoVITS/inference.py', 'GPT_SoVITS/BigVGAN/model.py', 'GPT_SoVITS/pretrained_models/chinese-hubert-base/a',
                'GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large/a',
                'GPT_SoVITS/pretrained_models/sv/a', 'GPT_SoVITS/pretrained_models/fast_langdetect/a',
                'GPT_SoVITS/pretrained_models/unused/a', 'tools/g2p/a.py', 'tools/asr/a.py',
                'tools/uvr5/a.py', 'GPT_weights_v2ProPlus/萤_GPT_e8.ckpt',
                'SoVITS_weights_v2ProPlus/萤_SoVITS_e8.pth', 'logs/a'],
            'desktop_source': ['desktop/main.cjs', 'desktop/package.json', 'dist/web/index.html',
                'resources/icon.ico'],
            'python_base': ['python.exe', 'python312.dll', 'vcruntime140.dll', 'LICENSE.txt',
                'DLLs/a.pyd', 'Lib/os.py', 'Lib/site-packages/unwanted.py', 'Lib/test/a.py'],
            'app_venv': ['Lib/site-packages/package/a.py', 'Lib/site-packages/editable.pth',
                'Lib/site-packages/__pycache__/a.pyc'],
        }
        for name, files in entries.items():
            for file in files:
                self.put(paths[name] / file, 'C:/old/source' if file.endswith('.pth') else 'fixture')
        paths['reference_wav'] = self.put(self.root / 'reference.wav')
        paths['ffmpeg_directory'] = self.root / 'ffmpeg'
        self.put(paths['ffmpeg_directory'] / 'ffmpeg.exe')
        self.put(paths['ffmpeg_directory'] / 'ffprobe.exe')
        paths['private_config'] = self.put(self.root / 'private.yaml', 'api_key: PRIVATE_SENTINEL')
        paths['electron_zip'] = self.root / 'electron.zip'
        with zipfile.ZipFile(paths['electron_zip'], 'w') as archive:
            archive.writestr('electron.exe', b'exe')
            archive.writestr('LICENSE', b'license')
        paths['destination'] = self.root / '中文 relocated bundle'
        return paths

    def test_full_fixture_selection_relocation_and_sanitized_manifest(self):
        paths = self.fixture()
        manifest = self.builder.build_bundle(**paths)
        dest = paths['destination']
        for name in ['萤AI对话.exe', 'backend/src/main.py',
                     'backend/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/model.int8.onnx',
                     'voice/ffmpeg.exe', 'voice/ffprobe.exe',
                     'resources/app/main.cjs', 'backend/frontend/index.html', 'resources/icon.ico',
                     'runtime/app/Lib/site-packages/package/a.py',
                     'runtime/voice/Lib/site-packages/nltk_data/a', 'voice/Hotaru/reference.wav',
                     'voice/GPT_SoVITS/pretrained_models/sv/a']:
            self.assertTrue((dest / name).is_file(), name)
        for name in ['backend/models/unused', 'backend/portable/build_bundle.py', 'backend/tests', 'backend/config.yaml',
                     'backend/chat_history', 'runtime/app/Lib/test',
                     'runtime/app/Lib/site-packages/unwanted.py', 'voice/tools/asr',
                     'voice/tools/uvr5', 'voice/GPT_SoVITS/pretrained_models/unused']:
            self.assertFalse((dest / name).exists(), name)
        self.assertIn('PRIVATE_SENTINEL', (dest / 'config/config.yaml').read_text())
        self.assertNotIn('PRIVATE_SENTINEL', str(manifest))
        self.assertNotIn('config/config.yaml', str(manifest))
        self.assertNotIn(str(self.root), str(manifest))
        relocated = self.root / '另一个 目录' / 'bundle'
        relocated.parent.mkdir()
        shutil.move(str(dest), relocated)
        dest = relocated
        for runtime, pth in [('app', 'editable.pth'), ('voice', 'users.pth')]:
            parent = dest / 'runtime' / runtime / 'Lib/site-packages'
            text = (parent / pth).read_text()
            self.assertNotIn('C:/old', text)
            for line in text.splitlines():
                self.assertTrue((parent / line).resolve().exists(), line)

    def test_marked_destination_can_be_rebuilt(self):
        paths = self.fixture()
        self.builder.build_bundle(**paths)
        self.put(paths['backend_source'] / 'src/main.py', 'updated')
        self.builder.build_bundle(**paths)
        self.assertEqual((paths['destination'] / 'backend/src/main.py').read_text(), 'updated')

    def test_relative_pth_entries_for_installed_extensions_and_eggs_survive(self):
        paths = self.fixture()
        self.put(paths['app_venv'] / 'Lib/site-packages/win32/lib/helper.py')
        self.put(paths['app_venv'] / 'Lib/site-packages/pywin32.pth',
                 'win32\nwin32/lib\nC:/old/python\n../../../../../../outside\nimport pywin32_bootstrap\n')
        self.put(paths['voice_source'] / 'runtime/Lib/site-packages/future.egg')
        self.put(paths['voice_source'] / 'runtime/Lib/site-packages/easy-install.pth', './future.egg\n')
        self.builder.build_bundle(**paths)
        dest = paths['destination']
        entries = (dest / 'runtime/app/Lib/site-packages/pywin32.pth').read_text().splitlines()
        self.assertEqual(entries, ['win32', 'win32/lib', 'import pywin32_bootstrap'])
        self.assertEqual((dest / 'runtime/voice/Lib/site-packages/easy-install.pth').read_text().strip(), './future.egg')

    def test_explicit_microsoft_runtime_is_app_local_and_excludes_debug_binaries(self):
        paths = self.fixture()
        runtime = self.root / 'microsoft-runtime'
        self.put(runtime / 'msvcp140.dll', 'release-cpp')
        self.put(runtime / 'vcruntime140.dll', 'release-c')
        self.put(runtime / 'msvcp140d.dll', 'debug-not-shipped')
        self.builder.build_bundle(**paths, vc_runtime_directory=runtime)
        for directory in ['', 'runtime/app', 'runtime/voice']:
            root = paths['destination'] / directory
            self.assertEqual((root / 'msvcp140.dll').read_text(), 'release-cpp')
            self.assertEqual((root / 'vcruntime140.dll').read_text(), 'release-c')
            self.assertFalse((root / 'msvcp140d.dll').exists())

    def test_reference_cannot_overlap_destination(self):
        paths = self.fixture()
        paths['destination'].mkdir()
        paths['reference_wav'] = self.put(paths['destination'] / 'input.wav')
        with self.assertRaises(ValueError):
            self.builder.build_bundle(**paths)
        self.assertTrue(paths['reference_wav'].exists())

    def test_unrelated_pth_keeps_import_hook_and_drops_absolute_source(self):
        paths = self.fixture()
        self.put(paths['app_venv'] / 'Lib/site-packages/distutils.pth',
                 'C:/old/source\nimport os; os.environ.setdefault("x", "y")\n')
        self.builder.build_bundle(**paths)
        text = (paths['destination'] / 'runtime/app/Lib/site-packages/distutils.pth').read_text()
        self.assertEqual(text.strip(), 'import os; os.environ.setdefault("x", "y")')

    def test_destination_protects_existing_unmarked_and_overlapping_sources(self):
        paths = self.fixture()
        self.put(paths['destination'] / 'precious.txt')
        with self.assertRaises(ValueError):
            self.builder.build_bundle(**paths)
        self.assertTrue((paths['destination'] / 'precious.txt').exists())
        paths['destination'] = paths['backend_source'] / 'nested'
        with self.assertRaises(ValueError):
            self.builder.build_bundle(**paths)

    def test_zip_traversal_is_rejected_before_extraction(self):
        for name in ['../escape', 'C:/escape', '/absolute', '..\\escape']:
            with self.subTest(name=name):
                paths = self.fixture() if not (self.root / 'backend_source').exists() else self.paths
                self.paths = paths
                with zipfile.ZipFile(paths['electron_zip'], 'w') as archive:
                    archive.writestr(name, 'bad')
                with self.assertRaises(ValueError):
                    self.builder.build_bundle(**paths)
                self.assertFalse((self.root / 'escape').exists())


if __name__ == '__main__':
    unittest.main()
