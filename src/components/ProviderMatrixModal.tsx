import React, { useState } from 'react';
import {
  Cpu,
  Layers,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  ExternalLink,
  ShieldAlert,
  Sliders,
  Share2,
  Table,
  Check,
} from 'lucide-react';
import { SOCKET_COLORS } from '../types/graph';

interface ProviderMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export const ProviderMatrixModal: React.FC<ProviderMatrixModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'providers' | 'connections' | 'routing' | 'normalization'>('normalization');

  if (!isOpen) return null;

  const providerData = [
    {
      name: 'Fal.ai',
      badge: '首选商业推理引擎',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      description: '提供当今业界最顶尖的极速 GPU 推理，原生深度支持 FLUX.1 全系列与 SDXL 1.0。',
      models: [
        { name: 'FLUX.1-schnell', steps: '4 ~ 8 步', resolution: '512 ~ 2048', speed: '1~2秒' },
        { name: 'FLUX.1-dev', steps: '25 ~ 50 步', resolution: '1024 ~ 2048', speed: '5~8秒' },
        { name: 'SDXL 1.0 Base', steps: '25 ~ 35 步', resolution: '1024x1024', speed: '3~4秒' },
        { name: 'Animagine XL 3.1', steps: '28 ~ 35 步', resolution: '1152x768', speed: '3~4秒' },
      ],
      loraSupport: '✅ 完全支持 Civitai LoRA 直接挂载，支持多 LoRA 权重动态调节 (0.1 ~ 2.0)',
      promptLanguage: '英文（若输入中文，系统将自动调用 Gemini 扩写翻译为大师级英文）',
      keyFormat: '格式: KeyID:SecretKey (例: xxxxxxxx-...:xxxxxxx...)',
      features: ['支持 Civitai safetensors 直连', '单反级毛孔微距', '最高达 2K 超清分辨率'],
    },
    {
      name: 'ModelScope (阿里魔搭社区)',
      badge: '国产大模型第一极',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      description: '阿里巴巴官方开源社区生态，全面支持通义万相 Wan 2.1 与 Qwen 图像编辑模型。',
      models: [
        { name: 'damo/wan2.1-t2i', steps: '25 ~ 35 步', resolution: '720p / 1080p', speed: '4~8秒' },
        { name: 'MusePublic/Qwen-Image-Edit', steps: '20 ~ 30 步', resolution: '1024x1024', speed: '5秒' },
        { name: 'damo/cv_diffusion_text-to-image', steps: '25 步', resolution: '768x768', speed: '3秒' },
      ],
      loraSupport: '✅ 内置 Wan 2.1 顶级东方写意水墨国风与东方仙侠风格算法',
      promptLanguage: '✅ 原生完美支持纯正中文自然语言提示词，无需任何翻译！',
      keyFormat: '格式: ms-xxxxxxxx-... (阿里魔搭 Access Token)',
      features: ['原汁原味中文理解', '水墨云海与东方人物极佳', '中国大陆区域极低延迟'],
    },
    {
      name: 'Google Gemini (官方直连)',
      badge: '官方直连',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      description: 'Google 官方 Gemini 生图模型 (generateContent)，不支持负向提示词/seed/steps/CFG/LoRA。',
      models: [
        { name: 'gemini-2.5-flash-image', steps: '不适用', resolution: '按 aspect_ratio', speed: '—' },
        { name: 'gemini-3.1-flash-image', steps: '不适用', resolution: '按 aspect_ratio', speed: '—' },
        { name: 'gemini-3-pro-image', steps: '不适用', resolution: '按 aspect_ratio', speed: '—' },
      ],
      loraSupport: '系统集成超高细节写真引擎（无需额外挂载 LoRA）',
      promptLanguage: '中英文双语均可（支持自然语言智能意图扩展）',
      keyFormat: '无需用户提供！由 AI Studio 服务端原生代理与配额直供',
      features: ['零门槛开箱即用', 'Google 官方原生高精度生成引擎', '超逼真微距质感'],
    },
    {
      name: 'Hugging Face Hub',
      badge: '开源社区旗舰',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      description: '全球最大 AI 开源社区，支持通过 Inference API 直接调用各类开源 Checkpoint。',
      models: [
        { name: 'black-forest-labs/FLUX.1-schnell', steps: '4 步', resolution: '1024x1024', speed: '4秒' },
        { name: 'stabilityai/stable-diffusion-xl-base-1.0', steps: '30 步', resolution: '1024x1024', speed: '5秒' },
      ],
      loraSupport: '支持 Hugging Face Hub 上的 LoRA 权重映射',
      promptLanguage: '英文提示词',
      keyFormat: '格式: hf_xxxxxxxxxxxxxxxxxxxxx (Hugging Face User Access Token)',
      features: ['开源模型生态最全', '支持私有与微调权重', '全球分发节点'],
    },
    {
      name: 'NanoGPT',
      badge: '按量极速 API',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      description: '聚合多种顶尖生成模型的极速轻量 API，按次计费。',
      models: [
        { name: 'flux-schnell', steps: '4 步', resolution: '1024x1024', speed: '2秒' },
        { name: 'flux-dev', steps: '28 步', resolution: '1024x1024', speed: '6秒' },
      ],
      loraSupport: '基础模型渲染',
      promptLanguage: '英文',
      keyFormat: '格式: sk-nano-xxxxxxxxxxxxxxxx (NanoGPT API Key)',
      features: ['极速响应', '支持 flux-dev 深度解算'],
    },
    {
      name: 'Tensor.Art (OpenWorks 算力)',
      badge: 'OpenWorks 官方 OpenAPI',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      description: 'Tensor.Art / 吐司 OpenWorks 官方 OpenAPI 算力链，支持 ak_tensor 与 ak_tusi 密钥及 23 款生图、生视频工具。',
      models: [
        { name: 'oc_character_illustration (角色插画)', steps: 'OpenWorks', resolution: '1024x1024', speed: '3~5秒' },
        { name: 'strong_text2image_wan27 (Wan2.7 生图)', steps: 'OpenWorks', resolution: '1024x1024', speed: '4~8秒' },
        { name: 'text2video_wan27 (Wan2.7 视频)', steps: 'OpenWorks', resolution: '720P / 1080P', speed: '15~30秒' },
      ],
      loraSupport: '✅ 支持 OpenWorks 规范多维输入',
      promptLanguage: '中英文均可',
      keyFormat: '格式: ak_tensor_... 或 ak_tusi_... (Echo-Access-Key)',
      features: ['23 款 OpenWorks 官方工具链', '支持 Echo-Access-Key 鉴权与国内吐司/国际站自动解算', '全透明异步 Task 状态轮询'],
    },
    {
      name: 'Civitai (C 站模型中心)',
      badge: '全球最大 LoRA 库',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      description: '数十万社区创作者共享的风格、人物、艺术 LoRA 宝库，提供权重与触发词。',
      models: [
        { name: 'Checkpoint 底模库', steps: '-', resolution: '各类', speed: '实时检索' },
        { name: 'LoRA 风格适配器', steps: '-', resolution: '各类', speed: '实时挂载' },
      ],
      loraSupport: '⭐ 核心定位：LoRA 资产发源地，一键抽取触发词与权重',
      promptLanguage: '各类提示词',
      keyFormat: '格式: 32位十六进制字符串 (Civitai API Key)',
      features: ['海量二次元/写实LoRA', '一键提取 Trigger Words 触发词', '精美样例作品对比'],
    },
  ];

  const wireRules = [
    {
      type: 'MODEL',
      color: SOCKET_COLORS.MODEL,
      name: '模型主干 (MODEL)',
      from: 'CheckpointLoaderSimple / LoRALoader',
      to: 'LoRALoader / KSampler / ModelScopeNode',
      desc: '传递底层扩散大模型神经网络权重。支持将 Checkpoint 输出注入 LoRA 串联增强。',
      example: 'Checkpoint [MODEL] ➔ LoRA [model] ➔ KSampler [model]',
    },
    {
      type: 'CLIP',
      color: SOCKET_COLORS.CLIP,
      name: '文本编码 (CLIP)',
      from: 'CheckpointLoaderSimple / LoRALoader',
      to: 'LoRALoader / CLIPTextEncode (正向/负向)',
      desc: '传递文本语义理解器。经过 LoRA 增强后，将文本语义准确映射至潜空间。',
      example: 'Checkpoint [CLIP] ➔ LoRA [clip] ➔ CLIPTextEncode [clip]',
    },
    {
      type: 'CONDITIONING',
      color: SOCKET_COLORS.CONDITIONING,
      name: '条件提示词 (CONDITIONING)',
      from: 'CLIPTextEncode (正向) / CLIPTextEncodeNegative (负向)',
      to: 'KSampler (positive / negative)',
      desc: '传递编码后的正向特征与负向特征，指导扩散采样器塑造画面细节。',
      example: 'CLIP正向 [CONDITIONING] ➔ KSampler [positive]',
    },
    {
      type: 'LATENT',
      color: SOCKET_COLORS.LATENT,
      name: '潜空间张量 (LATENT)',
      from: 'EmptyLatentImage / KSampler',
      to: 'KSampler (latent_image) / VAEDecode (samples)',
      desc: '未解压缩的潜空间低维张量。EmptyLatent 提供初始高斯噪波，KSampler 逐步降噪。',
      example: 'EmptyLatent [LATENT] ➔ KSampler [latent_image] ➔ VAEDecode [samples]',
    },
    {
      type: 'VAE',
      color: SOCKET_COLORS.VAE,
      name: '变分自编码器 (VAE)',
      from: 'CheckpointLoaderSimple',
      to: 'VAEDecode (vae)',
      desc: '负责将降噪完毕的 Latent 潜空间张量高保真还原解码为肉眼可见的 RGB 像素。',
      example: 'Checkpoint [VAE] ➔ VAEDecode [vae]',
    },
    {
      type: 'IMAGE',
      color: SOCKET_COLORS.IMAGE,
      name: 'RGB图像数据 (IMAGE)',
      from: 'VAEDecode / ModelScopeNode',
      to: 'SaveImage / PreviewImage',
      desc: '解算输出的最终高清成品图像，支持保存为 PNG 或送入图生图分支。',
      example: 'VAEDecode [IMAGE] ➔ SaveImage [images]',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#15161c] border border-[#2b2d3a] rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#252733] bg-[#111216] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white tracking-wide">
                  云端供应商调度矩阵与连线兼容性手册
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Routing & Sockets Guide
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                彻底搞清楚：哪个供应商支持什么模型、能传什么参数、各个节点怎么连线才合法
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenSettings && (
              <button
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 transition-all"
              >
                配置各供应商 Key
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-[#22242e] hover:bg-[#2c2e3b] text-slate-400 hover:text-white text-xs font-semibold transition-colors"
            >
              关闭 (Esc)
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="px-6 py-2.5 bg-[#171820] border-b border-[#242632] flex items-center gap-2 text-xs">
          <button
            onClick={() => setActiveTab('providers')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'providers'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white hover:bg-[#22242e]'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>1. 供应商能力与模型对应矩阵</span>
          </button>

          <button
            onClick={() => setActiveTab('connections')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'connections'
                ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md shadow-purple-500/20'
                : 'text-slate-400 hover:text-white hover:bg-[#22242e]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2. ComfyUI 节点线缆连接规范 (能连哪个)</span>
          </button>

          <button
            onClick={() => setActiveTab('routing')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'routing'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white hover:bg-[#22242e]'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>3. 严格意图遵从与透明报错</span>
          </button>

          <button
            onClick={() => setActiveTab('normalization')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'normalization'
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white hover:bg-[#22242e]'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>4. 各引擎 LoRA 与参数形状归一化全景对比</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#0f1014] text-xs">
          {/* TAB 1: 供应商矩阵 */}
          {activeTab === 'providers' && (
            <div className="space-y-6">
              <div className="bg-[#171822] border border-[#272936] rounded-xl p-4 text-slate-300 leading-relaxed">
                <span className="font-bold text-white">💡 核心一览：</span>
                每个云端服务商有其专属优势：需要极速极致的赛博朋克与写实人像时，优选{' '}
                <span className="text-cyan-400 font-semibold">Fal.ai (FLUX.1 + Civitai LoRA)</span>；需要纯正中文国风山水仙侠时，优选{' '}
                <span className="text-emerald-400 font-semibold">ModelScope (阿里魔搭 Wan 2.1)</span>；系统还支持{' '}
                <span className="text-blue-400 font-semibold">Google Gemini 官方直连高保真写真引擎</span>，各引擎严格独立路由，错误透明直传！
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {providerData.map((p, idx) => (
                  <div
                    key={idx}
                    className="bg-[#15161f] border border-[#272937] hover:border-cyan-500/40 rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                          <span>{p.name}</span>
                        </h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${p.badgeColor}`}>
                          {p.badge}
                        </span>
                      </div>

                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        {p.description}
                      </p>

                      {/* Supported Models table */}
                      <div className="bg-[#101116] rounded-xl p-2.5 border border-[#22232e] space-y-1.5 font-mono text-[10px]">
                        <div className="text-slate-500 font-bold flex justify-between border-b border-[#1c1d27] pb-1">
                          <span>支持大模型</span>
                          <span>建议步数</span>
                          <span>支持分辨率</span>
                        </div>
                        {p.models.map((m, mIdx) => (
                          <div key={mIdx} className="flex justify-between items-center text-slate-300">
                            <span className="text-cyan-400 font-semibold truncate max-w-[150px]">{m.name}</span>
                            <span>{m.steps}</span>
                            <span className="text-slate-400">{m.resolution}</span>
                          </div>
                        ))}
                      </div>

                      {/* LoRA & Prompt specs */}
                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex items-start gap-1.5 text-slate-300">
                          <span className="text-purple-400 font-bold shrink-0">LoRA 能力:</span>
                          <span className="text-slate-300">{p.loraSupport}</span>
                        </div>
                        <div className="flex items-start gap-1.5 text-slate-300">
                          <span className="text-amber-400 font-bold shrink-0">语言支持:</span>
                          <span className="text-slate-300">{p.promptLanguage}</span>
                        </div>
                        <div className="flex items-start gap-1.5 text-slate-400 font-mono text-[10px]">
                          <span className="text-slate-500 shrink-0">Key 规范:</span>
                          <span className="truncate">{p.keyFormat}</span>
                        </div>
                      </div>
                    </div>

                    {/* Features pill tags */}
                    <div className="pt-3 border-t border-[#20222e] flex flex-wrap gap-1">
                      {p.features.map((f, fIdx) => (
                        <span
                          key={fIdx}
                          className="px-2 py-0.5 rounded text-[10px] bg-[#1d1f2b] text-slate-300 border border-[#282a3b]"
                        >
                          ✓ {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: 线缆连接规范 */}
          {activeTab === 'connections' && (
            <div className="space-y-6">
              <div className="bg-[#171822] border border-[#272936] rounded-xl p-4 text-slate-300 leading-relaxed">
                <span className="font-bold text-white">🔌 ComfyUI 严格类型系统：</span>
                每个端口都有明确的数据类型（颜色一致的端口才允许连接）。系统会在你拖拽连线时自动高亮合法的目标端口，杜绝错误接线！
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {wireRules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="bg-[#15161f] border border-[#272937] rounded-xl p-4 space-y-2.5 shadow-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full shadow-sm"
                          style={{ backgroundColor: rule.color }}
                        />
                        <h4 className="font-bold text-white text-xs">{rule.name}</h4>
                      </div>
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
                        style={{ color: rule.color, backgroundColor: `${rule.color}15` }}
                      >
                        {rule.type}
                      </span>
                    </div>

                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      {rule.desc}
                    </p>

                    <div className="bg-[#101116] p-2.5 rounded-lg border border-[#20222d] space-y-1 font-mono text-[10px]">
                      <div className="text-slate-400">
                        <span className="text-slate-500">来源端口 (From): </span>
                        <span className="text-cyan-300">{rule.from}</span>
                      </div>
                      <div className="text-slate-400">
                        <span className="text-slate-500">目标端口 (To): </span>
                        <span className="text-amber-300">{rule.to}</span>
                      </div>
                      <div className="text-emerald-400 pt-1 border-t border-[#1d1f2a]">
                        <span>经典拓扑: {rule.example}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: 严格意图遵从与透明报错体系 */}
          {activeTab === 'routing' && (
            <div className="max-w-3xl mx-auto space-y-5">
              <div className="bg-[#171822] border border-[#272936] rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">严格意图遵从与透明报错体系 (Zero Fake Fallback & Strict Execution)</h3>
                    <p className="text-xs text-slate-400">
                      拒绝假图欺骗与静默降级：100% 遵从用户的编排意图，错误透明直观透传
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="p-3.5 bg-[#121319] border border-[#232532] rounded-xl space-y-1.5">
                    <div className="font-bold text-white text-xs flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span>1. 真实节点与服务商优先路由</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      系统严格按照画布节点连接的真实服务商路由（Google Gemini / Fal.ai / ModelScope / NanoGPT 等），绝不擅自篡改 Provider 目标，精准应用用户配置的 LoRA 权重与 KSampler 采样参数。
                    </p>
                  </div>

                  <div className="p-3.5 bg-[#121319] border border-[#232532] rounded-xl space-y-1.5">
                    <div className="font-bold text-white text-xs flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-400" />
                      <span>2. 零假图、零静默兜底欺骗</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      彻底剔除任何形式的“从图库抓预置假图假装成功”的欺瞒逻辑。缺失 Key 时直接返回明确的 HTTP 400（指引在设置中填写）；上游 API 报错（如 429 额度耗尽或排队超时）直接透明透传，保障技术真实性。
                    </p>
                  </div>

                  <div className="p-3.5 bg-[#121319] border border-[#232532] rounded-xl space-y-1.5">
                    <div className="font-bold text-white text-xs flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>3. 可视化错误诊断与一键重试</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      执行遇到异常时，节点边框变红并提示详细原因，取景框中直接弹出包含真实错误信息的诊断面板与一键重试按钮，让故障排查透明可控。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: 各引擎 LoRA 与参数形状归一化全景对比 */}
          {activeTab === 'normalization' && (
            <div className="space-y-6">
              <div className="bg-[#171822] border border-[#272936] rounded-xl p-4 text-slate-300 leading-relaxed space-y-2">
                <div className="font-bold text-white flex items-center gap-2 text-sm">
                  <span className="p-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <Table className="w-4 h-4" />
                  </span>
                  <span>官方 API 深度实证：各引擎 LoRA 载荷形状与参数规范对比矩阵</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  不同云端服务商和原生 ComfyUI 对 LoRA 的承载形状各不相同。我们经过真实网络搜索与接口规范核实，设计了统一的{' '}
                  <code className="text-cyan-300 font-mono">EngineParameterNormalizer</code> 归一化层，抹平参数异构：
                </p>
              </div>

              {/* Matrix Table */}
              <div className="border border-[#262835] rounded-2xl overflow-hidden bg-[#13141a] shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#191b24] text-[11px] font-mono text-slate-400 border-b border-[#292c3a]">
                        <th className="p-3 font-semibold text-white">引擎服务商 / 协议</th>
                        <th className="p-3 font-semibold text-purple-300">LoRA 载荷形状 (LoRA Schema)</th>
                        <th className="p-3 font-semibold text-cyan-300">权重 / 强度字段</th>
                        <th className="p-3 font-semibold text-amber-300">CFG / 引导字段</th>
                        <th className="p-3 font-semibold text-emerald-300">步数 & 尺寸格式</th>
                        <th className="p-3 font-semibold text-rose-300">我们系统的归一化方案</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#20222f] text-[11px]">
                      {/* Fal.ai */}
                      <tr className="hover:bg-[#181a23] transition-colors">
                        <td className="p-3 font-bold text-white">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-cyan-400" />
                            <span>Fal.ai</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">FLUX.1 / SDXL / Krea2</span>
                        </td>
                        <td className="p-3 font-mono text-purple-300 text-[10px]">
                          <code>loras: [&#123; path, scale &#125;]</code>
                          <div className="text-slate-500 text-[9px] mt-0.5">path 需为直链 Safetensors URL 或 HF ID</div>
                        </td>
                        <td className="p-3 font-mono text-cyan-300">
                          <code>scale: float</code>
                          <div className="text-slate-500 text-[9px]">建议范围 0.1 ~ 2.0</div>
                        </td>
                        <td className="p-3 font-mono text-amber-300">
                          <code>guidance_scale</code>
                          <div className="text-slate-500 text-[9px]">FLUX 3.5 / SDXL 6.0</div>
                        </td>
                        <td className="p-3 font-mono text-emerald-300 text-[10px]">
                          <div><code>num_inference_steps</code></div>
                          <div className="text-slate-500"><code>image_size: &#123; width, height &#125;</code></div>
                        </td>
                        <td className="p-3 text-slate-300">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 font-mono text-[10px]">
                            Civitai ID ➔ 真实下载直链 + scale 映射
                          </span>
                        </td>
                      </tr>

                      {/* ComfyUI Native */}
                      <tr className="hover:bg-[#181a23] transition-colors">
                        <td className="p-3 font-bold text-white">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-yellow-400" />
                            <span>ComfyUI 原生 API</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">/prompt 节点链拓扑</span>
                        </td>
                        <td className="p-3 font-mono text-purple-300 text-[10px]">
                          <code>class_type: "LoraLoader"</code>
                          <div className="text-slate-500 text-[9px] mt-0.5">inputs: &#123; lora_name, model, clip &#125; 串联</div>
                        </td>
                        <td className="p-3 font-mono text-cyan-300">
                          <div><code>strength_model: float</code></div>
                          <div><code>strength_clip: float</code></div>
                        </td>
                        <td className="p-3 font-mono text-amber-300">
                          <code>KSampler.inputs.cfg</code>
                        </td>
                        <td className="p-3 font-mono text-emerald-300 text-[10px]">
                          <div><code>KSampler.inputs.steps</code></div>
                          <div className="text-slate-500"><code>EmptyLatentImage.width/height</code></div>
                        </td>
                        <td className="p-3 text-slate-300">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-yellow-950/60 text-yellow-300 border border-yellow-800/40 font-mono text-[10px]">
                            原生拓扑生成、保留双通道独立强度微调
                          </span>
                        </td>
                      </tr>

                      {/* ModelScope */}
                      <tr className="hover:bg-[#181a23] transition-colors">
                        <td className="p-3 font-bold text-white">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span>ModelScope (魔搭)</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">Wan 2.1 / DAMO 扩散</span>
                        </td>
                        <td className="p-3 font-mono text-purple-300 text-[10px]">
                          <code>parameters.loras: [&#123; lora_model_id, lora_weight &#125;]</code>
                          <div className="text-slate-500 text-[9px] mt-0.5">+ 提示词触发词条件注入</div>
                        </td>
                        <td className="p-3 font-mono text-cyan-300">
                          <code>lora_weight: float</code>
                        </td>
                        <td className="p-3 font-mono text-amber-300">
                          <code>语义扩散步数自适应</code>
                        </td>
                        <td className="p-3 font-mono text-emerald-300 text-[10px]">
                          <div><code>input.steps</code></div>
                          <div className="text-slate-500">内置 768 / 1024 尺度</div>
                        </td>
                        <td className="p-3 text-slate-300">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 font-mono text-[10px]">
                            注入触发词到 input.prompt + 映射 loras 参数块
                          </span>
                        </td>
                      </tr>

                      {/* Hugging Face */}
                      <tr className="hover:bg-[#181a23] transition-colors">
                        <td className="p-3 font-bold text-white">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            <span>Hugging Face</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">Serverless Inference</span>
                        </td>
                        <td className="p-3 font-mono text-purple-300 text-[10px]">
                          <code>parameters.cross_attention_kwargs: &#123; scale &#125;</code>
                          <div className="text-slate-500 text-[9px] mt-0.5">配合 LoRA 触发词前置</div>
                        </td>
                        <td className="p-3 font-mono text-cyan-300">
                          <code>scale: float (0.0~1.0)</code>
                        </td>
                        <td className="p-3 font-mono text-amber-300">
                          <code>parameters.guidance_scale</code>
                        </td>
                        <td className="p-3 font-mono text-emerald-300 text-[10px]">
                          <div><code>parameters.num_inference_steps</code></div>
                          <div className="text-slate-500"><code>parameters.width / height</code></div>
                        </td>
                        <td className="p-3 text-slate-300">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40 font-mono text-[10px]">
                            折算最大标量注入 cross_attention + 触发词合成
                          </span>
                        </td>
                      </tr>

                      {/* NanoGPT */}
                      <tr className="hover:bg-[#181a23] transition-colors">
                        <td className="p-3 font-bold text-white">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-purple-400" />
                            <span>NanoGPT</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">按量 API</span>
                        </td>
                        <td className="p-3 font-mono text-purple-300 text-[10px]">
                          <code>loras: [&#123; path, scale &#125;]</code>
                          <div className="text-slate-500 text-[9px] mt-0.5">支持 Anima LoRA 与 FLUX 系列</div>
                        </td>
                        <td className="p-3 font-mono text-cyan-300">
                          <code>scale: float</code>
                        </td>
                        <td className="p-3 font-mono text-amber-300">
                          <code>guidance_scale: float</code>
                        </td>
                        <td className="p-3 font-mono text-emerald-300 text-[10px]">
                          <div><code>num_inference_steps</code></div>
                          <div className="text-slate-500"><code>size: "1024x1024"</code> 字符串</div>
                        </td>
                        <td className="p-3 text-slate-300">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40 font-mono text-[10px]">
                            尺寸转换 "WxH" + 转发真实 LoRA 路径与 scale
                          </span>
                        </td>
                      </tr>

                      {/* Google Gemini / Imagen 3 */}
                      <tr className="hover:bg-[#181a23] transition-colors">
                        <td className="p-3 font-bold text-white">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-400" />
                            <span>Google Gemini</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">官方闭源高保真写真</span>
                        </td>
                        <td className="p-3 font-mono text-purple-300 text-[10px]">
                          <code>语义触发词注入与意图蒸馏 (Prompt Distillation)</code>
                          <div className="text-slate-500 text-[9px] mt-0.5">大模型直接解析 LoRA 特征提示词</div>
                        </td>
                        <td className="p-3 font-mono text-cyan-300">
                          <code>语义权重 + 风格关键词加权</code>
                        </td>
                        <td className="p-3 font-mono text-amber-300">
                          <code>config.guidanceScale</code>
                        </td>
                        <td className="p-3 font-mono text-emerald-300 text-[10px]">
                          <div>自适应扩散算法</div>
                          <div className="text-slate-500"><code>config.aspectRatio ("1:1", "16:9")</code></div>
                        </td>
                        <td className="p-3 text-slate-300">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/40 font-mono text-[10px]">
                            提取触发词/风格词注入 + 宽高折算为原生比例
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Deep Architectural Features */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="bg-[#14161f] border border-[#232635] p-4 rounded-xl space-y-2">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span className="text-cyan-400 font-mono text-xs">01</span>
                    <span>双强度到单标量的智能折算</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    ComfyUI 支持 <code className="text-yellow-300">strength_model</code> 和 <code className="text-yellow-300">strength_clip</code> 独立微调。当向外部单标量引擎（Fal / NanoGPT / HuggingFace）分发时，系统优先保持模型主干权重，并同步增强提示词语义。
                  </p>
                </div>

                <div className="bg-[#14161f] border border-[#232635] p-4 rounded-xl space-y-2">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span className="text-purple-400 font-mono text-xs">02</span>
                    <span>Civitai ID ➔ 真实下载直链</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    在云端引擎中挂载第三方 LoRA 时，不能仅传文件名。系统自动将 Civitai Model Version ID 解析为官方直链 <code className="text-purple-300">https://civitai.com/api/download/models/&#123;id&#125;</code>，确保云端容器能实时拉取。
                  </p>
                </div>

                <div className="bg-[#14161f] border border-[#232635] p-4 rounded-xl space-y-2">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span className="text-emerald-400 font-mono text-xs">03</span>
                    <span>原生 ComfyUI /prompt 导出</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    支持在参数面板中一键复制符合官方规范的 ComfyUI API Prompt JSON 拓扑，包含真实的 CheckpointLoaderSimple、连续串联的 LoraLoader、KSampler 与 Latent 节点链，可直接注入真实 ComfyUI 服务器运行。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
