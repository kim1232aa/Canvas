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
      name: 'Civitai',
      badge: 'PASS_GENERATION',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      description: '公开 API 可读取模型/版本/作品元数据；当前已用特定 SD1 Checkpoint AIR + LoRA AIR 从前端真实生成。不能外推全部 Civitai 资源。',
      models: [
        { name: 'urn:air:sd1:checkpoint:civitai:4384@128713', steps: '按请求/recipe', resolution: '按请求/recipe', speed: '已实测' },
        { name: 'urn:air:sd1:lora:civitai:82098@87153 · 0.7', steps: '同工作流', resolution: '同工作流', speed: '已实测' },
      ],
      loraSupport: '保留真实 AIR / version / 权重。缺失字段不猜；目录可见不代表在线生成可用。',
      promptLanguage: '由所选模型决定',
      keyFormat: 'Civitai API Key；秘密值不进入日志/工作流',
      features: ['公开资源元数据', 'AIR/version 保真', '真实前端生成'],
    },
    {
      name: 'WaveSpeed',
      badge: 'PASS_GENERATION',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      description: '按实时目录 model_id 执行；只有目录实际提供 model_run Schema 时才把字段标为已核实。已有带 LoRA 的真实前端生成证据。',
      models: [{ name: '实时 model_id', steps: 'model_run Schema', resolution: 'model_run Schema', speed: '已有真实生成' }],
      loraSupport: '按具体端点 Schema 透传 path / scale；目录缺失 Schema 时保持 unknown。',
      promptLanguage: '由所选模型决定',
      keyFormat: 'WaveSpeed Bearer Key',
      features: ['实时目录', 'model_run Schema', '生成结果持久化'],
    },
    {
      name: 'MuAPI',
      badge: 'PASS_BILLING',
      badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
      description: '执行使用真实 endpoint_url；普通路由和 LoRA 专用路由均到达真实上游，当前账户返回 INSUFFICIENT_CREDITS。',
      models: [{ name: 'flux-1-dev-style-lora-inference', steps: 'OpenAPI Schema', resolution: 'OpenAPI Schema', speed: '当前余额不足' }],
      loraSupport: 'LoRA 专用端点已验证 lora_url + lora_weight=0.65；不把目录展示名当执行 ID。',
      promptLanguage: '由所选端点决定',
      keyFormat: 'MuAPI API Key',
      features: ['endpoint_url 保真', 'OpenAPI Schema', 'LoRA 402 真实证据'],
    },
    {
      name: 'Sogni',
      badge: 'PASS_BILLING',
      badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
      description: 'selector 来自固定版本官方工具 Schema；worker namespace 与 hosted selector 不自动互换。真实 task 已创建，当前账户 insufficient_credit。',
      models: [{ name: '官方工具 Schema selector', steps: 'Schema', resolution: 'Schema', speed: '当前余额不足' }],
      loraSupport: '已核实 loras + loraStrengths 协议；LoRA 顺序与权重保持原样。',
      promptLanguage: '由所选 selector 决定',
      keyFormat: 'Sogni Bearer Key',
      features: ['版本化工具 Schema', 'LoRA ID/strengths', '任务轮询'],
    },
    {
      name: 'Fal.ai',
      badge: 'PASS_BILLING',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      description: '每个 Fal 端点有独立 Schema。当前 fal-ai/flux-lora 已验证 LoRA path/scale 接线；账户返回 TOP_UP。',
      models: [
        { name: 'fal-ai/flux-lora', steps: '端点 Schema', resolution: '端点 Schema', speed: '已到上游 · TOP_UP' },
        { name: '其他 Fal 端点', steps: '实时 Schema', resolution: '实时 Schema', speed: '逐端点验收' },
      ],
      loraSupport: '仅当端点 Schema 声明 LoRA 时发送；不把 Civitai ID 无依据转换成 Fal 路径。',
      promptLanguage: '按所选端点；不自动调用其他供应商翻译/扩写',
      keyFormat: 'Fal API Key；实际格式以上游设置为准',
      features: ['端点级 Schema', 'LoRA path/scale', 'TOP_UP 原文可见'],
    },
    {
      name: 'ModelScope CN / AI',
      badge: '账户分离',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      description: 'CN 与 AI 国际站使用不同域名与账户。当前 CN 图像路由为 PASS_BILLING；AI 国际站为 BLOCKED_AUTH。',
      models: [
        { name: 'Tongyi-MAI/Z-Image-Turbo · CN', steps: '按端点', resolution: '按端点', speed: 'insufficient balance' },
        { name: 'Tongyi-MAI/Z-Image-Turbo · AI', steps: '按端点', resolution: '按端点', speed: '账户绑定阻塞' },
      ],
      loraSupport: '无统一 LoRA 载荷；只有所选在线端点契约明确支持时才发送。',
      promptLanguage: '由所选模型/端点决定；不自动翻译 Prompt',
      keyFormat: 'CN / AI 独立 Token',
      features: ['CN/AI 路由隔离', '真实 endpoint 可见', '账户/额度分开分类'],
    },
    {
      name: 'Hugging Face',
      badge: 'Hub ≠ 在线推理',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      description: 'Hub 用于资源和元数据；在线推理必须存在明确的 HF Inference / Inference Provider / Space 路由。旧 Z-Image Space 证据为 BLOCKED_ENV，当前仍待复验。',
      models: [
        { name: 'Hub 模型', steps: '由推理路由决定', resolution: '由推理路由决定', speed: 'Hub 可见 ≠ 可推理' },
        { name: 'Inference Provider / Space', steps: '路由契约', resolution: '路由契约', speed: '逐路由验收' },
      ],
      loraSupport: '只在明确 adapter/provider mapping 或目标端点支持时发送；保留原 repo ID / URL。',
      promptLanguage: '由所选模型/路由决定',
      keyFormat: 'Hugging Face User Access Token',
      features: ['Hub 元数据', 'Inference mapping', '显式路由选择'],
    },
    {
      name: 'NanoGPT',
      badge: 'BLOCKED_AUTH',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      description: '模型级 endpoint 元数据决定可用字段。当前真实前端请求已到达 NanoGPT，但凭据返回 Invalid session / invalid_api_key。',
      models: [{ name: 'qwen-image-2.1/text-to-image', steps: 'endpoint 元数据', resolution: '1k / endpoint 元数据', speed: '当前凭据 401' }],
      loraSupport: '不声明全局 LoRA 支持；以具体模型 endpoint 能力元数据或真实响应为准。',
      promptLanguage: '由所选模型决定',
      keyFormat: 'NanoGPT API Key',
      features: ['endpoint 元数据', '模型级参数校验', '401 原文可见'],
    },
    {
      name: 'Tensor.Art / TAMS',
      badge: 'BLOCKED_AUTH',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      description: '按真实模型 ID 查询；不抓 HTML 目录，不用 OpenWorks 工具结果冒充 TAMS。当前应用授权返回 unauthorized / app not found。',
      models: [{ name: '真实 TAMS 模型 ID', steps: '待授权后核实', resolution: '待授权后核实', speed: '当前 app 未授权' }],
      loraSupport: 'TAMS LoRA ID/weight 要等正确应用授权后做真实生成验收。',
      promptLanguage: '由所选模型决定',
      keyFormat: 'TAMS 应用凭据',
      features: ['模型 ID 查询', 'OpenWorks/TAMS 分离', '鉴权业务体保留'],
    },
    {
      name: 'Google Gemini',
      badge: '待当前前端验收',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      description: '图像生成走 Gemini 原生 generateContent / imageConfig 语义；不要把 ComfyUI 的 Sampler、Steps、CFG、LoRA 伪装成 Gemini 已接收字段。',
      models: [{ name: '当前模型选择器中的 Gemini Image 模型', steps: '不适用', resolution: 'imageConfig', speed: '待当前凭据实测' }],
      loraSupport: '当前 Gemini 路由不映射 LoRA；画布 LoRA 节点不能假称已生效。',
      promptLanguage: '自然语言 Prompt；是否润色由用户显式选择',
      keyFormat: '当前运行环境实际配置的 Gemini 凭据',
      features: ['原生图像接口', 'imageConfig', '不伪造扩散参数'],
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
                <span className="font-bold text-white">💡 核心规则：</span>
                供应商由用户明确选择，系统不根据画风、语言、余额或失败原因自动改 Provider。模型目录只用于选择真实目标；LoRA、Steps、CFG、Sampler、参考图等字段是否可用，以具体模型/端点 Schema 或真实上游响应为准。
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
                  <span>已核实路由与未核实字段边界：LoRA / 参数映射对比</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  不同供应商、甚至同一供应商的不同端点，都可能使用不同 LoRA 与参数 Schema。下表只把已核实字段写成确定值；其余保持 route-specific / unknown，不用统一归一化层把未知字段猜成已支持。
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
                            仅接受该端点可读取的真实 LoRA path / URL + scale
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
                          <code>无统一 LoRA 载荷</code>
                          <div className="text-slate-500 text-[9px] mt-0.5">按具体 ModelScope 在线端点契约核实后才发送</div>
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
                          <code>无 Hub 全局 LoRA Schema</code>
                          <div className="text-slate-500 text-[9px] mt-0.5">由 adapter mapping / Inference Provider / Space 端点决定</div>
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
                            保留 repo / adapter / provider 路由，不猜统一映射
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
                          <div className="text-slate-500 text-[9px] mt-0.5">按单模型 endpoint 能力元数据核实</div>
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
                          <code>当前 Gemini 路由不映射 LoRA</code>
                          <div className="text-slate-500 text-[9px] mt-0.5">LoRA 节点不能假装转成 Gemini 风格权重</div>
                        </td>
                        <td className="p-3 font-mono text-cyan-300">
                          <code>不适用</code>
                        </td>
                        <td className="p-3 font-mono text-amber-300">
                          <code>不伪造 CFG</code>
                        </td>
                        <td className="p-3 font-mono text-emerald-300 text-[10px]">
                          <div>自适应扩散算法</div>
                          <div className="text-slate-500"><code>config.aspectRatio ("1:1", "16:9")</code></div>
                        </td>
                        <td className="p-3 text-slate-300">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/40 font-mono text-[10px]">
                            只映射官方图像配置；不合成 LoRA/Steps/Sampler
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
                    <span>双强度只在有真实目标字段时映射</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    ComfyUI 可以同时保存 <code className="text-yellow-300">strength_model</code> 和 <code className="text-yellow-300">strength_clip</code>。外部端点若只声明一个 LoRA 强度，只发送那个已核实字段；没有对应字段时不把另一条强度偷偷折算、塞进 Prompt 或假称已生效。
                  </p>
                </div>

                <div className="bg-[#14161f] border border-[#232635] p-4 rounded-xl space-y-2">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span className="text-purple-400 font-mono text-xs">02</span>
                    <span>Civitai ID / AIR 与外部 URL 不自动互换</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Civitai 的 AIR、Model Version ID 和下载 URL 是不同资源表示。只有目标供应商明确接受某种 URL/ID 且项目实际完成了解析时才转换；否则保留来源标识并要求用户在目标供应商 LoRA 中心重新选择。
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
