"""Dependency-free, explicit-input staging; never reads private configuration contents.

Electron archive provenance/checksum verification and frontend compilation are caller
responsibilities. This helper accepts the verified archive and completed dist/web.
"""
import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path, PurePosixPath, PureWindowsPath


MARKER = '.hotaru-portable-build'
MARKER_VALUE = 'Hotaru portable staging v1\n'
EXCLUDED = {'.git', '.github', '__pycache__', 'cache', '.cache', 'logs', 'log',
            'history', 'chat_history', 'tests', 'test', 'training', 'temp', 'tmp',
            'private', '.env', '.venv', 'node_modules'}


def _allowed(path):
    return not any(part.lower() in EXCLUDED for part in path.parts) and path.suffix.lower() not in {'.pyc', '.pyo', '.log'}


def _copy(source, target):
    if source.is_symlink():
        raise ValueError('Symbolic links are not accepted as staging inputs')
    if source.is_dir():
        for child in sorted(source.iterdir()):
            if _allowed(Path(child.name)):
                _copy(child, target / child.name)
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def _extract(archive, destination):
    with zipfile.ZipFile(archive) as handle:
        for item in handle.infolist():
            name = item.filename.replace('\\', '/')
            parts = PurePosixPath(name).parts
            if name.startswith('/') or '..' in parts or any(':' in p for p in parts):
                raise ValueError('Unsafe Electron ZIP member')
            if (item.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Symbolic links are not accepted in Electron ZIP')
        handle.extractall(destination)


def build_bundle(*, backend_source, backend_assets, voice_source, reference_wav,
                 desktop_source, python_base, app_venv, electron_zip, private_config,
                 destination, ffmpeg_directory=None, vc_runtime_directory=None):
    """Create a bundle in a new/empty or previously marked staging destination.

    The returned/written manifest contains only relative deployed paths, sizes and
    hashes. Private config is deliberately omitted. Existing marked roots are
    updated without deletion; use a fresh destination for reproducible clean builds.
    """
    sources = {name: Path(value).resolve() for name, value in locals().copy().items()
               if name != 'destination' and value is not None}
    dest = Path(destination).resolve()
    for source in sources.values():
        if not source.exists():
            raise ValueError('A required staging input does not exist')
        if dest == source or dest in source.parents or source in dest.parents:
            raise ValueError('Destination and inputs must not overlap')
    if dest.exists():
        marker = dest / MARKER
        if any(dest.iterdir()) and (not marker.is_file() or marker.read_text() != MARKER_VALUE):
            raise ValueError('Refusing an unmarked nonempty destination')
        if any(path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction())
               for path in dest.rglob('*')):
            raise ValueError('Refusing links inside a staging destination')
    # Validate every archive member before creating any staging files.
    with zipfile.ZipFile(sources['electron_zip']) as archive:
        for item in archive.infolist():
            name = item.filename.replace('\\', '/')
            if name.startswith('/') or '..' in PurePosixPath(name).parts or ':' in name:
                raise ValueError('Unsafe Electron ZIP member')
    dest.mkdir(parents=True, exist_ok=True)
    (dest / MARKER).write_text(MARKER_VALUE)
    _extract(sources['electron_zip'], dest)
    (dest / 'electron.exe').replace(dest / '萤AI对话.exe')
    backend = sources['backend_source']
    for name in ['src', 'prompts', 'config_templates', 'mcp_servers.json', 'model_dict.json',
                 'hotaru_runtime.py', 'run_server.py', 'LICENSE', 'LICENSE-Live2D.md']:
        if (backend / name).exists():
            _copy(backend / name, dest / 'backend' / name)
    for file in (backend / 'portable').glob('*.py'):
        if file.name != 'build_bundle.py':
            _copy(file, dest / 'backend/portable' / file.name)
    for name in ['models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17',
                 'live2d-models', 'backgrounds', 'avatars', 'web_tool']:
        _copy(sources['backend_assets'] / name, dest / 'backend' / name)
    desktop = sources['desktop_source']
    _copy(desktop / 'desktop', dest / 'resources/app')
    _copy(desktop / 'dist/web', dest / 'backend/frontend')
    _copy(desktop / 'resources/icon.ico', dest / 'resources/icon.ico')
    base = sources['python_base']
    app = dest / 'runtime/app'
    for file in base.iterdir():
        name = file.name.lower()
        if file.is_file() and ((name.startswith('python') and file.suffix.lower() in {'.exe', '.dll'})
                              or name.startswith('vcruntime') or name.startswith('license')):
            _copy(file, app / file.name)
    _copy(base / 'DLLs', app / 'DLLs')
    for child in (base / 'Lib').iterdir():
        if child.name.lower() != 'site-packages' and _allowed(Path(child.name)):
            _copy(child, app / 'Lib' / child.name)
    _copy(sources['app_venv'] / 'Lib/site-packages', app / 'Lib/site-packages')
    voice = sources['voice_source']
    _copy(voice / 'runtime', dest / 'runtime/voice')
    if 'vc_runtime_directory' in sources:
        for name in ['msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll',
                     'msvcp140_atomic_wait.dll', 'msvcp140_codecvt_ids.dll',
                     'vcruntime140.dll', 'vcruntime140_1.dll',
                     'vcruntime140_threads.dll', 'concrt140.dll', 'vcomp140.dll']:
            source = sources['vc_runtime_directory'] / name
            if source.is_file():
                for directory in [dest, app, dest / 'runtime/voice']:
                    _copy(source, directory / name)
    binaries = sources.get('ffmpeg_directory', voice / 'runtime')
    for name in ['ffmpeg.exe', 'ffprobe.exe']:
        _copy(binaries / name, app / name)
        _copy(binaries / name, dest / 'voice' / name)
    for file in voice.iterdir():
        if file.is_file() and (file.suffix.lower() in {'.py', '.json', '.yaml', '.yml'}
                               or file.name.lower().startswith(('license', 'copying'))):
            _copy(file, dest / 'voice' / file.name)
    for folder, omitted in [('GPT_SoVITS', {'pretrained_models'}), ('tools', {'asr', 'uvr5'})]:
        for child in (voice / folder).iterdir():
            if child.name not in omitted and _allowed(Path(child.name)):
                _copy(child, dest / 'voice' / folder / child.name)
    for name in ['chinese-hubert-base', 'chinese-roberta-wwm-ext-large', 'sv', 'fast_langdetect']:
        _copy(voice / 'GPT_SoVITS/pretrained_models' / name,
              dest / 'voice/GPT_SoVITS/pretrained_models' / name)
    for name in ['GPT_weights_v2ProPlus/萤_GPT_e8.ckpt', 'SoVITS_weights_v2ProPlus/萤_SoVITS_e8.pth']:
        _copy(voice / name, dest / 'voice' / name)
    _copy(sources['reference_wav'], dest / 'voice/Hotaru/reference.wav')
    for runtime in ['app', 'voice']:
        site = dest / 'runtime' / runtime / 'Lib/site-packages'
        for pth in site.glob('*.pth'):
            # Keep installed extension/egg paths, while rejecting paths outside
            # this bundle. Editable source hooks require a known replacement.
            if runtime == 'app' and ('editable' in pth.name.lower() or pth.name == 'users.pth'):
                pth.write_text('../../../../backend/src\n', encoding='utf-8')
            else:
                lines = pth.read_text(encoding='utf-8-sig').splitlines()
                safe = []
                for line in lines:
                    if line.startswith('import ') and '__editable__' not in line:
                        safe.append(line)
                    elif line and not line.startswith('#') and not PureWindowsPath(line).drive and not PurePosixPath(line).is_absolute():
                        target = (pth.parent / line).resolve()
                        if target.is_relative_to(dest) and target.exists():
                            safe.append(line)
                pth.write_text('\n'.join(safe) + '\n', encoding='utf-8')
        if runtime == 'voice':
            (site / 'users.pth').write_text('\n'.join('../../../../' + p for p in
                ['voice', 'voice/GPT_SoVITS', 'voice/GPT_SoVITS/BigVGAN', 'voice/tools']) + '\n', encoding='utf-8')
    _copy(sources['private_config'], dest / 'config/config.yaml')
    (dest / 'data').mkdir(exist_ok=True)
    manifest = []
    for file in sorted(dest.rglob('*')):
        relative = file.relative_to(dest).as_posix()
        if file.is_file() and relative not in {'config/config.yaml', 'source-manifest.json', MARKER}:
            digest = hashlib.sha256()
            with file.open('rb') as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                    digest.update(chunk)
            manifest.append({'path': relative, 'size': file.stat().st_size, 'sha256': digest.hexdigest()})
    (dest / 'source-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg-directory', type=Path,
                        help='Directory with ffmpeg.exe/ffprobe.exe; defaults to voice-source/runtime')
    parser.add_argument('--vc-runtime-directory', type=Path,
                        help='Trusted x64 Microsoft VC release DLL directory for app-local deployment')
    for name in ['backend-source', 'backend-assets', 'voice-source', 'reference-wav',
                 'desktop-source', 'python-base', 'app-venv', 'electron-zip',
                 'private-config', 'destination']:
        parser.add_argument('--' + name, type=Path, required=True)
    build_bundle(**vars(parser.parse_args()))
    print('Portable staging completed; private configuration omitted from manifest.')


if __name__ == '__main__':
    main()
