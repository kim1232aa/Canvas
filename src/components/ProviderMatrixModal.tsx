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
      badge: '端点能力以 Schema 为准',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      description: 'Fal.ai 每个模型端点有独立输入 Schema。当前已从前端验证 fal-ai/flux-lora 的 LoRA path/scale 接线；账户处于 TOP_UP，其他端点不能由此自动判定通过。',
      models: [
        { name: 'fal-ai/flux-lora', steps: '端点 Schema', resolution: '端点 Schema', speed: '已到达上游 · TOP_UP' },
        { name: '其他 Fal 端点', steps: '实时 Schema', resolution: '实时 Schema', speed: '逐端点验收' },
      ],
      loraSupport: '仅当所选 Fal 端点 Schema 声明 LoRA 时发送；fal-ai/flux-lora 已核实为 loras: [{ path, scale }]。Civitai ID 不会被无依据自动转换。',
      promptLanguage: '按所选端点；系统不会未经用户选择自动调用其他供应商翻译或扩写。',
      keyFormat: '格式: KeyID:SecretKey (例: xxxxxxxx-...:xxxxxxx...)',
      features: ['端点级 Schema', 'LoRA URL/path 透传', '真实上游错误可见'],
    },
    {
      name: 'ModelScope (阿里魔搭社区)',
      badge: 'CN / AI 独立账户',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      description: 'ModelScope CN 与 ModelScope AI 使用不同域名与账户。目录、模型可见性和在线推理权限分开判断；当前 CN 为额度不足，AI 国际站为账户绑定阻塞。',
      models: [
        { name: 'Tongyi-MAI/Z-Image-Turbo · CN', steps: '未核实字段不伪造', resolution: '按端点', speed: '上游额度不足' },
        { name: 'Tongyi-MAI/Z-Image-Turbo · AI', steps: '未核实字段不伪造', resolution: '按端点', speed: '账户绑定阻塞' },
      ],
      loraSupport: '不声明统一 LoRA 载荷。只有所选在线推理端点的官方契约明确支持时才发送 LoRA 字段。',
      promptLanguage: '由所选模型/端点决定；不自动翻译或改写用户 Prompt。',
      keyFormat: '格式: ms-xxxxxxxx-... (阿里魔搭 Access Token)',
      features: ['CN/AI 路由隔离', '真实 endpoint 可见', '账户/额度错误分开分类'],
    },
    {
      name: 'Google Gemini (官方直连)',
      badge: '官方直连',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      description: 'Google Gemini 图像生成走原生 generateContent / imageConfig 语义。不要把 ComfyUI 的 Sampler、Steps、CFG、LoRA 等扩散参数伪装成 Gemini 已接收字段。',
      models: [
        { name: '当前模型选择器中的 Gemini Image 模型', steps: '不适用', resolution: 'imageConfig', speed: '待当前凭据实测' },
      ],
      loraSupport: '当前 Gemini 路由不映射 LoRA；LoRA 节点不能因为存在于画布就假称已生效。',
      promptLanguage: '自然语言 Prompt；是否扩写由用户明确启用的润色功能决定。',
      keyFormat: '使用当前运行环境实际配置的 Gemini 凭据；是否可用以真实上游响应为准',
      features: ['原生图像接口', 'imageConfig / Prompt', '不伪造扩散参数'],
    },
    {
      name: 'Hugging Face Hub',
      badge: 'Hub ≠ 在线推理',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      description: 'Hugging Face Hub 用于资源与元数据；在线推理必须存在明确的 HF Inference / Inference Provider / Space 路由。仓库可下载不代表当前模型可以直接生成。',
      models: [
        { name: 'Hub 模型', steps: '由实际推理路由决定', resolution: '由实际推理路由决定', speed: 'Hub 可见 ≠ 可推理' },
        { name: 'Inference Provider / Space', steps: '路由契约', resolution: '路由契约', speed: '逐路由验收' },
      ],
      loraSupport: 'LoRA 仅在明确的 adapter / provider mapping 或目标端点支持时发送；保留原 repo ID / URL，不做静默跨供应商替换。',
      promptLanguage: '英文提示词',
      keyFormat: '格式: hf_xxxxxxxxxxxxxxxxxxxxx (Hugging Face User Access Token)',
      features: ['Hub 元数据', 'Inference Provider 映射', 'Space / Provider 路由显式选择'],
    },
    {
      name: 'NanoGPT',
      badge: '按量极速 API',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      description: '模型目录与单模型 endpoint 元数据决定可用字段。当前真实前端调用已到达 NanoGPT，但凭据返回 Invalid session / invalid_api_key。',
      models: [
        { name: 'qwen-image-2.1/text-to-image', steps: 'endpoint 元数据', resolution: '1k / endpoint 元数据', speed: '当前凭据 401' },
        { name: '其他 NanoGPT 模型', steps: 'endpoint 元数据', resolution: 'endpoint 元数据', speed: '逐模型验收' },
      ],
      loraSupport: '不声明全局 LoRA 支持；必须以具体模型 endpoint 能力元数据或上游响应为证据。',
      promptLanguage: '英文',
      keyFormat: '格式: sk-nano-xxxxxxxxxxxxxxxx (NanoGPT API Key)',
      features: ['模型级 endpoint 元数据', '真实鉴权错误可见'],
    },
    {
      name: 'Tensor.Art 模型 API',
      badge: 'TAMS',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      description: '按真实模型 ID 查询底模或 LoRA。官方暂不提供全量模型列表 API，网页目录不能作为稳定 API。',
      models: [],
      loraSupport: 'LoRA 是否可用于生成必须等 TAMS 应用授权恢复后按实际 job Schema 验证；当前只确认真实模型 ID 查询路径。',
      promptLanguage: '由所选模型决定',
      keyFormat: 'TAMS 模型 API 凭据；授权状态以上游响应为准',
      features: ['模型 ID 查询', '实际请求与错误可见', '与 OpenWorks 工具接口分开'],
    },
    {
      name: 'MuAPI',
      badge: 'PASS_BILLING',
      badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
      description: '模型目录与 OpenAPI Schema 分开读取，执行时使用真实 endpoint_url。当前真实前端提交返回 INSUFFICIENT_CREDITS。',
      models: [{ name: '实时目录 endpoint_url', steps: 'OpenAPI Schema', resolution: 'OpenAPI Schema', speed: '当前余额不足' }],
      loraSupport: '只按所选端点的 Schema 映射 URL/ID 与权重；不把目录展示名当执行 ID。',
      promptLanguage: '由所选端点决定',
      keyFormat: 'MuAPI API Key；任务凭据需保持同一账户语义',
      features: ['实时目录', 'OpenAPI Schema', 'endpoint_url 保真'],
    },
    {
      name: 'WaveSpeed',
      badge: 'PASS_GENERATION',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      description: '按实时目录 model_id 执行；只有目录实际提供 model_run POST Schema 时才把参数标记为已核实。已有带 LoRA 的真实前端生成证据。',
      models: [{ name: '实时 model_id', steps: 'model_run Schema', resolution: 'model_run Schema', speed: '已有真实生成' }],
      loraSupport: '按具体端点 Schema 透传 path / scale；目录缺失 Schema 时保持 unknown，不伪装 unsupported 或 supported。',
      promptLanguage: '由所选模型决定',
      keyFormat: 'WaveSpeed Bearer Key',
      features: ['实时目录', 'model_run Schema', '生成结果持久化'],
    },
    {
      name: 'Sogni',
      badge: 'PASS_BILLING',
      badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
      description: '模型 selector 来自固定版本官方工具 Schema，worker namespace 与 hosted-tool selector 不自动互换。真实任务已创建，当前因 insufficient_credit 等待用户。',
      models: [{ name: '官方工具 Schema selector', steps: 'Schema', resolution: 'Schema', speed: '当前余额不足' }],
      loraSupport: '已核实 loras + loraStrengths 协议；LoRA 顺序与权重保持原样。私有参考图没有已核实上传流程时直接拒绝，不假称已上传。',
      promptLanguage: '由所选 selector / 工具 Schema 决定',
      keyFormat: 'Sogni Bearer Key；提交与轮询保持同一凭据引用',
      features: ['版本化官方 Schema', 'LoRA ID/strengths', '任务轮询'],
    },
    {
      name: 'Civitai (C 站模型中心)',
      badge: '社区资源 + Orchestration',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      description: 'Civitai API 可读取公开模型、版本、作品与资源元数据；Orchestration 是否能生成取决于具体 AIR、recipe、账户与当前上游。',
      models: [
        { name: 'urn:air:sd1:checkpoint:civitai:4384@128713', steps: '已实测', resolution: '按 recipe / 请求', speed: 'PASS_GENERATION' },
        { name: 'urn:air:sd1:lora:civitai:82098@87153 · 0.7', steps: '同工作流', resolution: '同工作流', speed: 'PASS_GENERATION' },
      ],
      loraSupport: '保留真实 AIR / version / 权重。公开元数据可辅助导入，但不能把缺失字段猜成真实生成参数。',
      promptLanguage: '各类提示词',
      keyFormat: '格式: 32位十六进制字符串 (Civitai API Key)',
      features: ['公开资源元数据', 'AIR / version 保真', '历史实际参数可追溯'],
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
                供应商由用户明确选择，系统不根据画风、语言、余额或失败原因自动改 Provider。模型目录只用于选择真实目标；是否支持 LoRA、Steps、CFG、Sampler、参考图等字段，必须以该模型/端点的当前 Schema 或真实上游响应为准。
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
                      拒绝假图欺骗与静默降级：严格遵从用户明确选择的编排意图，错误透明直观透传
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
                  不同供应商、甚至同一供应商的不同端点，都可能使用不同 LoRA 与参数 Schema。下表只把<strong>已经核实的字段写成确定值</strong>；其余保持 route-specific / unknown，不用统一归一化层把未知字段猜成已支持：
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
                          <div className="text-slate-500 text-[9px]">以所选 Fal 端点 Schema 的范围/默认值为准</div>
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
                          <code>endpoint-specific</code>
                        </td>
                        <td className="p-3 font-mono text-amber-300">
                          <code>未核实则不发送</code>
                        </td>
                        <td className="p-3 font-mono text-emerald-300 text-[10px]">
                          <div><code>endpoint-specific</code></div>
                          <div className="text-slate-500">尺寸/Steps 由实际端点契约决定</div>
                        </td>
                        <td className="p-3 text-slate-300">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 font-mono text-[10px]">
                            只发送已核实字段；unknown 不伪装 supported
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
                          <code>route-specific</code>
                        </td>
                        <td className="p-3 font-mono text-amber-300">
                          <code>route-specific</code>
                        </td>
                        <td className="p-3 font-mono text-emerald-300 text-[10px]">
                          <div><code>Inference Provider schema</code></div>
                          <div className="text-slate-500">字段由实际 provider mapping 决定</div>
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
                          <code>无全局固定 LoRA Schema</code>
                          <div className="text-slate-500 text-[9px] mt-0.5">按单模型 endpoint 能力元数据核实</div>
                        </td>
                        <td className="p-3 font-mono text-cyan-300">
                          <code>scale: float</code>
                        </td>
                        <td className="p-3 font-mono text-amber-300">
                          <code>model-specific</code>
                        </td>
                        <td className="p-3 font-mono text-emerald-300 text-[10px]">
                          <div><code>endpoint metadata</code></div>
                          <div className="text-slate-500">如当前模型 resolution=1k；不能外推全目录</div>
                        </td>
                        <td className="p-3 text-slate-300">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40 font-mono text-[10px]">
                            按 endpoint 元数据校验并原样提交已支持字段
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
                          <code>当前路由不映射 LoRA</code>
                          <div className="text-slate-500 text-[9px] mt-0.5">LoRA 节点不能假装转成 Gemini 风格权重</div>
                        </td>
                        <td className="p-3 font-mono text-cyan-300">
                          <code>不适用</code>
                        </td>
                        <td className="p-3 font-mono text-amber-300">
                          <code>不伪造 CFG</code>
                        </td>
                        <td className="p-3 font-mono text-emerald-300 text-[10px]">
                          <div>原生 imageConfig</div>
                          <div className="text-slate-500">按当前官方图像模型支持的配置项</div>
                        </td>
                        <td className="p-3 text-slate-300">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/40 font-mono text-[10px]">
                            仅映射官方图像配置；不合成 LoRA/Steps/Sampler
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
                    Civitai 的 AIR、Model Version ID 和下载 URL 是不同资源表示。只有目标供应商明确接受某种 URL/ID 且项目实际完成了解析时才转换；否则保留来源标识并要求用户在目标供应商 LoRA 中心重新选择，不保证云端容器一定可拉取。
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