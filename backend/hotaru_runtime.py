"""Start the local Hotaru instance with private configuration-safe logging."""
import os
import sys
from pathlib import Path


def redact_message(message, secrets):
    for secret in secrets:
        if isinstance(secret, str) and secret:
            message = message.replace(secret, '[REDACTED]')
    return message


def runtime_settings():
    legacy = Path(__file__).resolve().parent
    bundle = os.environ.get('HOTARU_BUNDLE_ROOT')
    if not bundle:
        return dict(root=legacy, config_path=legacy / 'conf.yaml',
                    log_dir=legacy / 'logs', port=12393, bundle=None)
    from portable.configuration import validate_port
    root = Path(bundle).resolve()
    os.environ['PATH'] = str(root / 'runtime/app') + os.pathsep + os.environ.get('PATH', '')
    app_port = validate_port(int(os.environ['HOTARU_APP_PORT']))
    voice_port = validate_port(int(os.environ['HOTARU_TTS_PORT']))
    for variable, directory in [('HOTARU_HISTORY_DIR', 'chat_history'), ('HOTARU_CACHE_DIR', 'cache')]:
        target = root / 'data' / directory
        target.mkdir(parents=True, exist_ok=True)
        os.environ[variable] = str(target)
    return dict(root=root / 'backend', config_path=root / 'config/config.yaml',
                log_dir=root / 'data/logs', port=app_port, voice_port=voice_port, bundle=root)


def run():
    settings = runtime_settings()
    root = settings['root']
    os.chdir(root)
    os.environ['NO_PROXY'] = 'localhost,127.0.0.1,::1'
    os.environ['no_proxy'] = os.environ['NO_PROXY']
    os.environ['HF_HOME'] = str(root / 'models')
    os.environ['PYTHONIOENCODING'] = 'utf-8'
    import yaml
    from loguru import logger

    if settings['bundle']:
        from portable.configuration import prepare_backend_config
        config_data = prepare_backend_config(settings['bundle'], settings['port'], settings['voice_port'])
    else:
        config_data = yaml.safe_load(settings['config_path'].read_text('utf-8'))
    llms = config_data['character_config']['agent_config']['llm_configs']
    secrets = [value for provider in llms.values() if isinstance(provider, dict)
               for key, value in provider.items() if 'key' in key.lower()]

    def private_filter(record):
        record['message'] = redact_message(record['message'], secrets)
        return True

    logger.remove()
    options = dict(level='INFO', filter=private_filter, backtrace=False, diagnose=False,
                   format='{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}')
    logger.add(sys.stderr, **options)
    settings['log_dir'].mkdir(parents=True, exist_ok=True)
    logger.add(settings['log_dir'] / 'hotaru.log', rotation='10 MB', retention=7, **options)

    import asyncio
    import uvicorn
    from src.open_llm_vtuber.config_manager import validate_config
    from src.open_llm_vtuber.server import WebSocketServer

    config = validate_config(config_data)
    server = WebSocketServer(config=config)
    asyncio.run(server.initialize())
    logger.info('萤服务已就绪：中文输入 / 日语配音 / 中文字幕 / AI动作')
    uvicorn.run(server.app, host='127.0.0.1', port=settings['port'], log_level='warning')


if __name__ == '__main__':
    run()
