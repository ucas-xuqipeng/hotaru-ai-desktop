"""Python 3.9 compatible bundled GPT-SoVITS entrypoint."""
import argparse
import os
from pathlib import Path
import runpy
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from portable.configuration import build_voice_config, validate_port


def select_device(force_cpu=False, cuda_available=None):
    if force_cpu or os.environ.get('HOTARU_FORCE_CPU') == '1':
        return 'cpu'
    if cuda_available is None:
        import torch
        cuda_available = torch.cuda.is_available
    return 'cuda' if cuda_available() else 'cpu'


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--port', required=True, type=int)
    parser.add_argument('--cpu', action='store_true')
    args = parser.parse_args(argv)
    validate_port(args.port)
    root = Path(args.root).resolve()
    voice = root / 'voice'
    os.chdir(voice)
    sys.path[:0] = [str(voice), str(voice / 'GPT_SoVITS')]
    os.environ['PATH'] = str(root / 'runtime/voice') + os.pathsep + os.environ.get('PATH', '')
    os.environ['HF_HUB_OFFLINE'] = '1'
    import yaml
    config_path = root / 'data/voice-runtime.yaml'
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(yaml.safe_dump(build_voice_config(root, select_device(args.cpu)), allow_unicode=True), encoding='utf-8')
    target = voice / 'api_v2.py'
    sys.argv = [str(target), '-c', str(config_path), '-a', '127.0.0.1', '-p', str(args.port)]
    runpy.run_path(str(target), run_name='__main__')


if __name__ == '__main__':
    main()
