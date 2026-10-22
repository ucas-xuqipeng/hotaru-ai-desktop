# 萤 AI 对话 · Windows 透明桌宠与语音对话

基于 **Open-LLM-VTuber** 和 **GPT-SoVITS** 整理、修改的 Live2D 语音对话桌面应用：你说中文，萤使用日语回答，并显示中文字幕，配合表情、动作与口型。

本项目是对现有开源项目和社区素材的集成，不是从零实现的语音引擎、Live2D 引擎或角色模型。感谢上游维护者、贡献者，以及分享模型与声音素材的群友。

![实际运行界面](docs/desktop.png)

## 功能与运行方式

| 项目 | 当前支持 |
| --- | --- |
| 桌面界面 | Windows x64 透明置顶桌宠，可切换完整窗口；一键启动后台与声音服务 |
| 中文输入 | 键盘输入，或通过 SenseVoice 识别麦克风语音 |
| 日语回答 | AI 生成日语台词，使用萤的 GPT-SoVITS 音色合成 |
| 中文字幕 | 与日语台词配对生成，显示在聊天记录和模型下方 |
| 模型表现 | AI 选择表情与动作，播放音频时驱动口型 |
| 空闲注视 | 空闲约 2.5 秒后眼睛和头部跟随鼠标，输入、拖动和说话时暂停 |
| 完整人设 | 合并角色分析档案与灵魂核心，保留第 20 话之后的状态 |
| 对话接口 | 使用者自己的 OpenAI 兼容 API，默认模型标识为 `Qwen3.8-Flash-Next-NVFP4` |

语音识别、声音合成和 Live2D 显示在电脑本地运行；对话文本发送到配置的 AI API，由该接口生成回复。语音合成可以使用 GPU 或 CPU，实际速度取决于电脑配置。

## 下载与使用

前往 [Releases](https://github.com/ucas-xuqipeng/hotaru-ai-desktop/releases) 下载 Windows x64 便携版。仓库右上角的 **Code → Download ZIP 只包含源码**，不是完整运行包。

完整运行包随附桌面显示引擎、Python、SenseVoice 中文语音识别、萤 Live2D、GPT-SoVITS v2ProPlus 音色和推理依赖，无需另装浏览器、Python 或 Node.js。AI 对话仍需联网调用你自己的 API。

1. 下载同一版本的全部 `.zip.001`、`.zip.002` 等分卷，以及 `Merge-Parts.cmd`，放在同一个文件夹。
2. 双击 `Merge-Parts.cmd` 合并成 ZIP，再完整解压；也可以使用支持分卷的解压工具打开 `.zip.001`。
3. 编辑解压目录下的 `config/config.yaml`，填写自己的 OpenAI 兼容 API 地址、密钥与模型名称。公开包不包含开发者的私人 API 密钥。
4. 下载下方的[完整人设更新包](#完整人设更新2026-10-21)，把其中的 `backend` 文件夹合并到解压目录。
5. 双击 **萤AI对话.exe**，等待本地服务和模型加载；在设置的“角色预设”中选择“萤 · 完整人设（第20话之后）”，新建对话。
6. 输入中文，或点击麦克风并授权，听取日语回答并查看中文字幕。

默认模型字符串保留为 `Qwen3.8-Flash-Next-NVFP4`；这是对接服务端使用的模型标识，需由你选择的 API 服务实际支持，也可改为其他支持结构化回复的模型。API 配置示例见 [config/config.example.yaml](config/config.example.yaml)，具体字段在 `character_config.agent_config.llm_configs.openai_compatible_llm` 下。

只修改现有配置中对应的三个字段，保留其他配置。以下是字段位置示意，不能用它覆盖整个配置文件：

```yaml
character_config:
  agent_config:
    llm_configs:
      openai_compatible_llm:
        base_url: "https://api.example.com/v1"
        llm_api_key: "YOUR_API_KEY"
        model: "Qwen3.8-Flash-Next-NVFP4"
```

请复制**整个解压目录**，不能只复制 EXE。设置、历史记录与日志保存在 `data` 中；关闭窗口会清理本次启动的本地服务。首次加载可能需要几分钟，CPU 合成通常更慢。需要强制 CPU 时先关闭应用，再运行 `CPU模式启动.cmd`。

摄像头和屏幕输入默认收起，普通语音对话无需打开。摄像头需要单独授权；屏幕输入需要在原生对话框中选择共享来源。

## 桌宠更新 v1.1.0（2026-10-22）

![桌宠实际渲染](docs/desktop-pet.png)

新增透明无边框桌宠、置顶、透明区域鼠标穿透、人物拖动与滚轮缩放、托盘控制，以及空闲时平滑看向鼠标。双击人物或按 `Ctrl+Alt+H` 开关中文输入，右键或托盘切回完整设置窗口；原有日语音色、中文字幕、人设、动作和口型保持。

下载 [v1.1.0 桌宠更新包](https://github.com/ucas-xuqipeng/hotaru-ai-desktop/releases/tag/v1.1.0)。**这是更新包，首次使用仍需先下载 v1.0.0 完整便携版**；完整人设继续使用下方的人设小包。退出萤后解压更新包，运行 `Apply-Update.cmd`，输入原完整便携版路径。脚本先备份再更新，不覆盖私人 API 配置、声音、角色素材或历史。详见 [安装、操作与回退说明](docs/desktop-pet-update.md)。

55 项自动化测试通过；真实透明渲染、置顶、模式往返、尺寸调整、输入和注视链路已检查。完整验证范围及 API 503 复测限制见 [桌宠验证记录](docs/desktop-pet-validation.json)。

## 完整人设更新（2026-10-21）

已将使用者提供的两份资料完整合并进[默认配置示例](config/config.example.yaml)和[独立人设配置](backend/characters/hotaru_full_persona.yaml)，继续使用日语配音、中文字幕及表情动作输出。

| 人设资料 | 内容与作用 |
| --- | --- |
| [A_汐见萤.md](backend/characters/hotaru_persona_materials/A_汐见萤.md) | 角色背景、剧情时间线、人物关系、语言习惯、日常喜好与原文依据 |
| [soul.md](backend/characters/hotaru_persona_materials/soul.md) | 核心驱动力、价值观、自责与自我排除等内在心理 |

当前时间锚点为乐队剧情第 20 话及视角故事之后：对外礼貌、纯真、温和而略显迟疑，内在矛盾仍未解决；日常也会自然地谈论音乐、园艺和零食。对同伴保留礼貌称呼，中文字幕中的“某某同学”在日语里自然表达为“○○さん”。不把第 19 话的短暂释怀当作已经完成的成长，也不要求每次闲聊都复述创伤。

**v1.0.0 的原始大分卷尚未内置这次完整人设，首次下载和已经安装的用户都需要另加这个小包。**

1. 下载 [Hotaru-Persona-20261021.zip](https://github.com/ucas-xuqipeng/hotaru-ai-desktop/releases/download/v1.0.0/Hotaru-Persona-20261021.zip)（约 37 KB）。
2. 关闭桌面程序，将小包内的 `backend` 文件夹复制到 **萤AI对话.exe 所在目录**并合并，避免多套一层同名文件夹。
3. 启动程序，在设置的“角色预设”中选择 **萤 · 完整人设（第20话之后）**。
4. 新建对话开始使用；若重启后恢复默认配置，请再次选择此人设。

更新包沿用已有 API、音色、Live2D 和历史记录标识，不覆盖 `config/config.yaml`，无需重新下载大分卷。旧对话已有的内容不会被重写。详细步骤见 [人设更新说明](docs/persona-update.md)。

两份原文按原始字节保存在[人设资料目录](backend/characters/hotaru_persona_materials/)，出处与引用标注均保留。原文副本供查阅，程序实际读取 YAML 中合并后的 `persona_prompt`；只编辑 Markdown 不会自动改变人设。需要自行调整时，修改 `backend/characters/hotaru_full_persona.yaml` 中的 `character_config.persona_prompt`，保持原有双语 JSON、表情与动作输出要求，然后重新选择配置并新建对话。

感谢使用者提供资料，以及原作、资料整理者与社区分享者；未提供可核实的整理者署名，不编造作者名称。

## 本次集成做了什么

- 将现有界面整合到独立的 Electron 桌面窗口，启动时自动加载本地后台和声音服务。
- 在同一结构化回复中生成日语台词、中文字幕、表情与动作，减少独立翻译步骤。
- 修复双语 JSON 返回格式兼容、连接未就绪提示、会话恢复和语音错误处理。
- 为便携包重定位模型路径，动态选择本机端口，支持 GPU / CPU 语音推理。
- 保存跨端口的偏好设置并迁移内置背景地址，默认收起可选视觉工具。
- 限制桌面权限与导航，退出时只停止应用自己启动的进程。

## 模型、音色与特别致谢

**萤的 Live2D 素材和 GPT-SoVITS 音色由群友分享，经本项目使用者提供。** Live2D 素材选自使用者提供的 `OurNotes_v101_Live2D_Full.7z`。感谢提供、制作、整理和分享这些素材的群友及原作者。

目前未提供可核实的原作者姓名或主页，因此这里不编造署名，也不把角色、美术、建模、动作、声音训练成果归为本项目原创。素材的相关权利仍归各自原作者及权利人所有；代码许可证不覆盖这些第三方素材，原素材附带的说明和使用条件继续适用。如需补充准确署名，可提交 Issue 或 PR。

## 参考项目与致谢

| 项目 / 来源 | 本项目使用或参考的部分 |
| --- | --- |
| [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) | Python 后台、对话链路、ASR/TTS 接口、历史记录与 Live2D 协议，是本项目的主要基础 |
| [Open-LLM-VTuber-Web](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber-Web) | React / Electron 前端、聊天界面、音频播放、口型、模型控制与多语言界面 |
| [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) | 日语语音合成、v2ProPlus 推理与预训练资源；感谢 RVC-Boss 和所有贡献者 |
| [Live2D Cubism Web Framework](https://github.com/Live2D/CubismWebFramework) 与 [Cubism SDK for Web](https://www.live2d.com/en/sdk/download/web/) | Live2D 渲染、表情与动作；Core 与 Framework 保留各自条款 |
| [Electron](https://github.com/electron/electron) | 独立桌面窗口、原生权限和进程生命周期；发行包使用官方 44.9.3 win32-x64 运行时 |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) 与 [SenseVoice](https://github.com/QwenAudio/SenseVoice) | 中文语音识别及 ONNX 模型推理 |
| [vad-web](https://github.com/ricky0123/vad) 与 [ONNX Runtime](https://github.com/microsoft/onnxruntime) | 语音活动检测与前端推理 |
| [PyTorch](https://github.com/pytorch/pytorch)、[Transformers](https://github.com/huggingface/transformers)、[Python](https://www.python.org/) | 模型推理与本地运行环境 |
| [BigVGAN](https://github.com/NVIDIA/BigVGAN) | GPT-SoVITS 上游包含的声码器相关实现 |
| [pyopenjtalk](https://github.com/r9y9/pyopenjtalk)、[g2pW](https://github.com/GitYCC/g2pW)、[NLTK](https://github.com/nltk/nltk) | GPT-SoVITS 上游使用的文本、发音和语言处理资源 |
| [CjangCjengh/vits](https://github.com/CjangCjengh/vits) | GPT-SoVITS 日语处理文件注明的参考实现，保留其来源注释 |
| [React](https://github.com/facebook/react)、[Vite](https://github.com/vitejs/vite)、[Chakra UI](https://github.com/chakra-ui/chakra-ui)、[i18next](https://github.com/i18next/i18next) | 前端框架、构建、界面与国际化 |
| [FFmpeg](https://ffmpeg.org/) 与 [7-Zip](https://www.7-zip.org/) | 音频处理，以及便携包打包与完整性检查；FFmpeg 的完整许可、报告版本对应的固定源码和构建信息见 [FFmpeg-SOURCE.md](third_party/FFmpeg-SOURCE.md)，源码副本同时随 Release 提供 |
| 提供素材的群友及原作者 | 萤的 Live2D、美术、动作、音色模型和参考语音 |
| 使用者提供的人设资料、原作及资料整理者 | `A_汐见萤.md` 和 `soul.md`；完整保留角色分析、心理设定、原剧情引用及出处标注 |

更完整的依赖版本和项目链接见 [third_party/DEPENDENCIES.json](third_party/DEPENDENCIES.json)，直接 JavaScript 依赖及锁定的间接依赖见 [frontend/package.json](frontend/package.json) 和 [frontend/package-lock.json](frontend/package-lock.json)；Python 项目声明见 [backend/pyproject.toml](backend/pyproject.toml)。感谢这些项目的所有维护者与贡献者。

## 源码与构建

```text
backend/       Open-LLM-VTuber 后台与本项目对话、便携启动修改
frontend/      Open-LLM-VTuber-Web 前端与 desktop/ 桌面启动器
config/        不含私人密钥的配置示例
docs/          运行截图和验证记录
third_party/   来源、许可证副本与依赖清单
```

源码保留上游结构。前端在 `frontend` 中执行 `npm ci`、`npm run build:web`；Python 环境按 `backend/pyproject.toml` 安装。便携包的布局与输入参数见 [backend/portable/build_bundle.py](backend/portable/build_bundle.py)：需要提供官方 Electron 压缩包、Python 基础环境和已安装依赖的环境、GPT-SoVITS 推理目录、模型、参考音频、编译后的前端和自己的配置文件；这些大文件放在 Release，而不直接提交进 Git 历史。

开发者验证入口 `--verify=绝对路径.json --exit-after-verify` 和 `--verify-pet=绝对路径.json` 只在显式指定时启用，普通启动不自动发测试对话、不采集截图。

## 验证情况与范围

已通过 40 项桌面/前端测试与 49 项 Python 测试，并在本机实际完成 CPU/GPU 日语对话、中文字幕、点头、口型、播放结束、跨端口设置和背景保存、中文与空格目录迁移及退出清理验证。详见 [docs/validation.json](docs/validation.json)。截图来自实际运行的桌面应用。

2026-10-21 完整人设更新后，使用配置的真实 Qwen 接口检查了日常喜好、奏多同学的称呼以及读完日记后尚未释怀的状态；再次运行实际 EXE，确认日语语音合成与播放、中文字幕、害羞表情、点头动作和口型正常，并在退出后清理本次启动的服务。人设原文副本经字节校验，独立人设配置继承原有 API、声音和历史记录标识。

完整便携包在 Windows x64 本机验证；尚未在第二台实体电脑上实测，也没有把实体麦克风和屏幕共享人工验收记作已通过。公开包中的 API 配置为占位值，需要使用者填写自己的有效接口后才能对话。

## 许可证

本项目保留各组件的原许可证和版权声明，不将整个整合包统一声明为 MIT：后台见 [backend/LICENSE](backend/LICENSE)，前端见 [frontend/LICENSE](frontend/LICENSE)，Live2D SDK 及样例见各自许可证，GPT-SoVITS 与 Electron 的副本见 `third_party`。角色模型、音色、预训练权重和其他素材仍适用各自原有条款。完整说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
