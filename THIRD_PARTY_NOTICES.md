# 来源、许可证与致谢

本项目是在现有项目上进行的个人桌面整合与功能修改。以下信息用于保留来源和版权，不表示获得原项目官方背书，也不更改各组件自身的许可条件。

| 范围 | 来源 | 保留的许可位置 |
| --- | --- | --- |
| Python 后台 | Open-LLM-VTuber，Yi-Ting Chiu 与贡献者 | `backend/LICENSE`，MIT；Live2D 样例另见 `backend/LICENSE-Live2D.md` |
| React / Electron 前端 | Open-LLM-VTuber-Web 与贡献者 | `frontend/LICENSE`，Open-LLM-VTuber License 1.0（Apache 2.0 附加条件）；请查阅该文件全文 |
| Live2D Cubism Core / Framework | Live2D Inc. | `frontend/src/renderer/WebSDK/Core/LICENSE.md`、`Framework/LICENSE.md` 及相邻说明 |
| GPT-SoVITS 推理 | RVC-Boss 与贡献者 | `third_party/GPT-SoVITS-LICENSE`；发行包 `voice/LICENSE` |
| Electron 运行时 | Electron contributors | `third_party/Electron-LICENSE`；发行包 `LICENSE` 和 `LICENSES.chromium.html` |
| FFmpeg / ffprobe | FFmpeg developers；历史 BtbN Windows LGPL 构建 | `third_party/COPYING.LGPLv3`、`COPYING.GPLv3`、`FFmpeg-SOURCE.md`；报告版本对应的固定源码归档随 Release 提供 |
| Python、PyTorch、CUDA 相关运行库和其他依赖 | 各组件维护者及权利人 | 发行包保留原运行环境中的许可、dist-info 元数据和声明；依赖索引见 `third_party/DEPENDENCIES.json` |
| 预训练 ASR、语音和文本模型 | sherpa-onnx、SenseVoice、GPT-SoVITS 及其引用的预训练项目 | 原模型目录内说明及各上游项目；不因本次打包而改用代码许可证 |
| 萤 Live2D、动作、美术、音色与参考语音 | 群友分享，经使用者提供；Live2D 选自 `OurNotes_v101_Live2D_Full.7z` | 原素材附带说明；相关权利归各原作者及权利人，未纳入本仓库代码授权 |
| 汐见萤人设资料与灵魂核心 | 使用者提供的 `A_汐见萤.md` 与 `soul.md`；保留文件内的原剧情引用与来源标注 | 原文保存在 `backend/characters/hotaru_persona_materials/`；角色、剧情和引用的权利归各自权利人，不因集成而成为本项目原创 |

特别感谢提供、制作、整理和分享萤模型及声音素材的群友与原作者。没有提供可核实的姓名或主页时，以此如实记录来源，不虚构署名、不声称素材为本项目原创。

README 列出了直接参考项目。GPT-SoVITS 等上游自身引用的工具、预训练模型与文本资源，还请保留并参考其原 README、源码注释和许可证；依赖清单是版本/来源索引，不是统一授权声明。
