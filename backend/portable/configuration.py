"""Configuration transformations for the self-contained Windows bundle."""
from pathlib import Path, PureWindowsPath
import yaml


def validate_port(value):
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 65535:
        raise ValueError('Port must be an integer between 1 and 65535')
    return value


def _asset_path(root, value):
    """Relocate known local assets, including paths copied from Windows installs."""
    parts = PureWindowsPath(value).parts
    if '..' in parts:
        raise ValueError('Local asset path must stay within bundled assets')
    for marker in ('models', 'live2d-models', 'backgrounds', 'avatars'):
        if marker in parts:
            return str(root.joinpath(*parts[parts.index(marker):]))
    if PureWindowsPath(value).is_absolute() or '..' in parts:
        raise ValueError('Local asset path must refer to a bundled asset directory')
    return str(root.joinpath(*parts))


def prepare_backend_config(bundle_root, app_port, voice_port):
    validate_port(app_port); validate_port(voice_port)
    root = Path(bundle_root).resolve()
    config = yaml.safe_load((root / 'config/config.yaml').read_text(encoding='utf-8'))
    config['system_config'].update(host='127.0.0.1', port=app_port)
    character = config['character_config']
    asr = character.get('asr_config', {})
    local_fields = {'model_path', 'model_dir', 'download_root', 'encoder', 'decoder', 'joiner', 'paraformer', 'nemo_ctc', 'wenet_ctc', 'tdnn_model', 'whisper_encoder', 'whisper_decoder', 'sense_voice', 'tokens', 'hotwords_file', 'bpe_vocab', 'fire_red_asr_encoder', 'fire_red_asr_decoder'}
    for provider in asr.values():
        if isinstance(provider, dict):
            for field in local_fields & provider.keys():
                if provider[field]:
                    provider[field] = _asset_path(root / 'backend', provider[field])
    tts = character.get('tts_config', {}).get('gpt_sovits_tts')
    if tts is not None:
        tts['api_url'] = 'http://127.0.0.1:{}/tts'.format(voice_port)
        tts['ref_audio_path'] = str(root / 'voice/Hotaru/reference.wav')
    return config


def build_voice_config(root, device):
    if device not in ('cpu', 'cuda'):
        raise ValueError('Voice device must be cpu or cuda')
    voice = Path(root).resolve() / 'voice'
    custom = {'device': device, 'is_half': device == 'cuda', 'version': 'v2ProPlus',
              't2s_weights_path': str(voice / 'GPT_weights_v2ProPlus/萤_GPT_e8.ckpt'),
              'vits_weights_path': str(voice / 'SoVITS_weights_v2ProPlus/萤_SoVITS_e8.pth'),
              'bert_base_path': str(voice / 'GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large'),
              'cnhuhbert_base_path': str(voice / 'GPT_SoVITS/pretrained_models/chinese-hubert-base')}
    return {'custom': custom}
