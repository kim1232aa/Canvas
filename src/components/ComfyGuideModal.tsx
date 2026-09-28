import React, { useState } from 'react';
import {
  HelpCircle,
  BookOpen,
  Sliders,
  Layers,
  Sparkles,
  Cpu,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Copy,
  ExternalLink,
} from 'lucide-react';

interface ComfyGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenModelHub?: () => void;
  onOpenSettings?: () => void;
}

export const ComfyGuideModal: React.FC<ComfyGuideModalProps> = ({
  isOpen,
  onClose,
  onOpenModelHub,
  onOpenSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'lora' | 'params' | 'wiring' | 'faq'>('lora');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#181920] border border-[#2e303c] rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#282a36] bg-[#13141a] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-amber-600 to-rose-600 text-white font-bold shadow-lg shadow-amber-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                新手入门与 ComfyUI 原理秘籍
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  全中文操作指引
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                搞懂各个 LoRA 怎么添加、ComfyUI 参数怎么调、连线怎么接，彻底告别“一脸懵逼”
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-[#252731] transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-2 bg-[#14151b] border-b border-[#252733] flex items-center gap-2 overflow-x-auto">
          {[
            { id: 'lora', label: '1. 各个 LoRA 怎么添加与生效？', icon: Layers },
            { id: 'params', label: '2. ComfyUI 核心参数白话字典', icon: Sliders },
            { id: 'wiring', label: '3. 节点连线规范与数据流向', icon: Zap },
            { id: 'faq', label: '4. 测试 Key 诊断与常见疑问', icon: HelpCircle },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-3 px-3.5 font-bold transition-all relative flex items-center gap-1.5 whitespace-nowrap text-xs ${
                  isActive ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-400 to-rose-500" />
                )}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto bg-[#131419] space-y-4">
          {/* TAB 1: LoRA */}
          {activeTab === 'lora' && (
            <div className="space-y-4">
              <div className="bg-[#1b1c24] border border-[#282a35] rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  什么是 LoRA？它和底模 (Checkpoint) 有什么区别？
                </h3>
                <p className="text-slate-300 leading-relaxed text-xs">
                  底模（如 <strong className="text-cyan-300">FLUX.1</strong>、<strong className="text-cyan-300">SDXL 1.0</strong>、<strong className="text-cyan-300">Wan 2.1</strong>）相当于画师的基础画工与综合知识库；
                  而 <strong>LoRA (微调特征包)</strong> 则相当于画师掌握的<strong>专属画风滤镜、特定人物角色或特定光影质感</strong>。
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div className="bg-[#13141a] p-3 rounded-lg border border-[#262833]">
                    <span className="font-bold text-amber-300 block mb-1">画风 LoRA:</span>
                    <span className="text-slate-400">
                      例如赛博朋克霓虹风、新海诚动漫风、复古胶片感。让整张画呈现统一的艺术风格。
                    </span>
                  </div>
                  <div className="bg-[#13141a] p-3 rounded-lg border border-[#262833]">
                    <span className="font-bold text-purple-300 block mb-1">角色/细节 LoRA:</span>
                    <span className="text-slate-400">
                      例如特定二次元角色、发型、衣服配饰或皮肤超细节增强 (Detail Tweaker XL)。
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-[#1b1c24] border border-[#282a35] rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  在本项目中，如何极速添加各个 LoRA？
                </h3>
                <div className="space-y-3 text-xs">
                  <div className="flex items-start gap-3 bg-[#13141a] p-3.5 rounded-lg border border-[#252733]">
                    <div className="px-2 py-1 rounded bg-purple-600 text-white font-bold shrink-0">
                      方式 1
                    </div>
                    <div>
                      <h4 className="font-bold text-white mb-1">现代空间帧一键添加 (最推荐)</h4>
                      <p className="text-slate-300 mb-2">
                        在无限画布上点击任意生图帧，在右侧参数总控台的<strong>「LoRA 堆叠」</strong>区域，点击<strong>「添加 LoRA」</strong>。
                      </p>
                      <p className="text-slate-400">
                        系统会打开模型中心，浏览 Civitai、Hugging Face 或 ModelScope，点击<strong>「挂载至当前 LoRA 栈」</strong>，模型即可挂载，推荐权重 (0.8) 和触发词会自动填充！
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-[#13141a] p-3.5 rounded-lg border border-[#252733]">
                    <div className="px-2 py-1 rounded bg-cyan-600 text-white font-bold shrink-0">
                      方式 2
                    </div>
                    <div>
                      <h4 className="font-bold text-white mb-1">节点连线模式添加 (ComfyUI 纯正玩法)</h4>
                      <p className="text-slate-300 mb-2">
                        切换至<strong>「节点图视图」</strong>，点击顶部<strong>「添加节点 ➡️ LoRA 加载器」</strong>。
                      </p>
                      <div className="flex items-center gap-2 text-slate-300 font-mono text-[11px] bg-[#0d0e12] p-2.5 rounded border border-[#21232c]">
                        <span className="text-cyan-400">Checkpoint (底模)</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-purple-400 font-bold">LoRALoader (微调)</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-blue-400">KSampler (采样器)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#1b1c24] border border-[#282a35] rounded-xl p-4 space-y-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  什么是触发词 (Trigger Words)？为什么要写进 Prompt？
                </h3>
                <p className="text-slate-300 leading-relaxed text-xs">
                  LoRA 在训练时绑定了特定的关键词。例如某旗袍 LoRA 的触发词是 <code className="text-purple-300 font-mono bg-purple-950/40 px-1 py-0.5 rounded">qipao, traditional dress</code>。
                  在模型中心中，每个 LoRA 都有<strong>「一键复制触发词」</strong>按钮，粘贴到你的提示词开头，AI 就能 100% 准确命中该 LoRA 的特征！
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: Parameters */}
          {activeTab === 'params' && (
            <div className="space-y-3">
              <div className="bg-[#1b1c24] border border-[#282a35] rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-white">ComfyUI 核心参数白话速查表</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-[#13141a] p-3 rounded-lg border border-[#262833] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-400">STEPS (采样步数)</span>
                      <span className="text-[10px] text-slate-500 font-mono">1 ~ 80</span>
                    </div>
                    <p className="text-slate-300 text-[11px]">
                      AI 降噪去噪的计算循环次数。<strong>FLUX schnell 推荐 4 步</strong>；<strong>FLUX dev 推荐 28 步</strong>；<strong>SDXL 推荐 25~30 步</strong>。步数并不是越高越好，过高会导致过锐化或出现画面杂点。
                    </p>
                  </div>

                  <div className="bg-[#13141a] p-3 rounded-lg border border-[#262833] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-400">CFG SCALE (引导系数)</span>
                      <span className="text-[10px] text-slate-500 font-mono">1.0 ~ 20.0</span>
                    </div>
                    <p className="text-slate-300 text-[11px]">
                      决定画面多大程度服从提示词。<strong>FLUX 推荐 3.5</strong>；<strong>SDXL 推荐 7.0 ~ 8.0</strong>。太低 AI 自由发挥不听话；太高画面色彩过度饱和像烤焦。
                    </p>
                  </div>

                  <div className="bg-[#13141a] p-3 rounded-lg border border-[#262833] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-purple-400">SAMPLER (采样算法)</span>
                      <span className="text-[10px] text-slate-500 font-mono">euler / dpmpp</span>
                    </div>
                    <p className="text-slate-300 text-[11px]">
                      数学解算降噪的方式。<strong>euler</strong> 最快且非常适合 FLUX；<strong>dpmpp_2m</strong> 和 <strong>dpmpp_sde</strong> 质感最细腻细腻，是 SDXL 二次元与写实摄影首选。
                    </p>
                  </div>

                  <div className="bg-[#13141a] p-3 rounded-lg border border-[#262833] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-400">SCHEDULER (调度器)</span>
                      <span className="text-[10px] text-slate-500 font-mono">karras / simple</span>
                    </div>
                    <p className="text-slate-300 text-[11px]">
                      控制不同步数阶段降噪幅度的节奏。<strong>karras</strong> 前期降噪快后期微调，细节极佳；<strong>simple</strong> 匀速线性，适配 FLUX schnell。
                    </p>
                  </div>

                  <div className="bg-[#13141a] p-3 rounded-lg border border-[#262833] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-400">DENOISE (重绘幅度)</span>
                      <span className="text-[10px] text-slate-500 font-mono">0.0 ~ 1.0</span>
                    </div>
                    <p className="text-slate-300 text-[11px]">
                      文生图时请<strong>固定为 1.0</strong>（从纯噪声白纸生成）；图生图或局部重绘时，推荐设为 <strong>0.35 ~ 0.65</strong>（既保留原图构图，又能重绘风格细节）。
                    </p>
                  </div>

                  <div className="bg-[#13141a] p-3 rounded-lg border border-[#262833] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-400">SEED (随机种子)</span>
                      <span className="text-[10px] text-slate-500 font-mono">整数</span>
                    </div>
                    <p className="text-slate-300 text-[11px]">
                      初始噪波的随机编号。相同的种子搭配相同参数，100% 能复现一模一样的画面；想每次换张脸或构图，点击 🎲 骰子摇号随机即可。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Wiring */}
          {activeTab === 'wiring' && (
            <div className="space-y-3">
              <div className="bg-[#1b1c24] border border-[#282a35] rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-white">ComfyUI 纯正节点接线规范</h3>
                <p className="text-slate-300 text-xs">
                  在 ComfyUI 中，不同颜色的接口代表不同的数据类型，<strong>只有相同类型的端口才能安全连线</strong>：
                </p>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[#14151b] border border-[#272935]">
                    <div className="w-3.5 h-3.5 rounded-full bg-[#00f0ff] shrink-0" />
                    <div className="font-mono text-cyan-300 font-bold w-24">MODEL</div>
                    <div className="text-slate-400">扩散模型主干网络。从 CheckpointLoaderSimple 连入 LoRALoader 或 KSampler。</div>
                  </div>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[#14151b] border border-[#272935]">
                    <div className="w-3.5 h-3.5 rounded-full bg-[#ffd700] shrink-0" />
                    <div className="font-mono text-amber-300 font-bold w-24">CLIP</div>
                    <div className="text-slate-400">文本理解器。从 Checkpoint 连入 CLIPTextEncode（正向/负向提示词）。</div>
                  </div>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[#14151b] border border-[#272935]">
                    <div className="w-3.5 h-3.5 rounded-full bg-[#ff7700] shrink-0" />
                    <div className="font-mono text-orange-400 font-bold w-24">CONDITIONING</div>
                    <div className="text-slate-400">提示词条件特征。从 CLIPTextEncode 连入 KSampler 的 positive 与 negative 接口。</div>
                  </div>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[#14151b] border border-[#272935]">
                    <div className="w-3.5 h-3.5 rounded-full bg-[#ff0055] shrink-0" />
                    <div className="font-mono text-rose-400 font-bold w-24">LATENT</div>
                    <div className="text-slate-400">潜空间张量。从 EmptyLatentImage 连入 KSampler，再从 KSampler 输出送给 VAEDecode。</div>
                  </div>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[#14151b] border border-[#272935]">
                    <div className="w-3.5 h-3.5 rounded-full bg-[#ff2200] shrink-0" />
                    <div className="font-mono text-red-400 font-bold w-24">VAE</div>
                    <div className="text-slate-400">解码器。将数学潜空间转化为人眼可见的像素图像。从 Checkpoint 连入 VAEDecode。</div>
                  </div>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[#14151b] border border-[#272935]">
                    <div className="w-3.5 h-3.5 rounded-full bg-[#00ffaa] shrink-0" />
                    <div className="font-mono text-emerald-400 font-bold w-24">IMAGE</div>
                    <div className="text-slate-400">最终渲染成品图像。从 VAEDecode 输出连入 SaveImagePreview 预览保存。</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FAQ */}
          {activeTab === 'faq' && (
            <div className="space-y-3">
              <div className="bg-[#1b1c24] border border-[#282a35] rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  你刚才提供的测试 Key 运行状况说明
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-lg bg-[#14151c] border border-emerald-900/40 text-slate-300">
                    <span className="font-bold text-emerald-400 block mb-1">🟢 Civitai 密钥 (29d6...):</span>
                    <span>100% 验证成功！已直接接入 C 站全网十万级 Checkpoints 和 LoRAs 原始 API，支持触发词、下载量与评分实时拉取。</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#14151c] border border-emerald-900/40 text-slate-300">
                    <span className="font-bold text-emerald-400 block mb-1">🟢 Hugging Face 密钥 (hf_nw...):</span>
                    <span>100% 验证成功！认证用户为 @setaub，具备 Serverless 推理与全量开源 Hub 读取权限。</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#14151c] border border-emerald-900/40 text-slate-300">
                    <span className="font-bold text-emerald-400 block mb-1">🟢 魔搭社区 ModelScope (ms-b6...):</span>
                    <span>100% 验证成功！已直连阿里魔搭社区官方推理接口，支持 Wan 2.1 视频与视觉大模型。</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#14151c] border border-amber-900/40 text-slate-300">
                    <span className="font-bold text-amber-400 block mb-1">🟡 Fal.ai 密钥 (a437...):</span>
                    <span>密钥合法且已被服务器识别，但 Fal.ai 官方返回 <code>User is locked. Reason: TOP_UP</code>（账户余额不足需充值）。在充值前，建议优先使用内置 Google Imagen 3 或魔搭运行！</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#14151c] border border-rose-900/40 text-slate-300">
                    <span className="font-bold text-rose-400 block mb-1">🔴 NanoGPT 密钥 (sk-nano...):</span>
                    <span>NanoGPT 官方接口提示 <code>Invalid session/key</code>。如果需要使用 NanoGPT，请前往 nano-gpt.com 个人中心重新复制有效的 API Key。</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#262832] bg-[#14151b] flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            随时在顶部导航栏点击「新手指南」重新唤起本帮助卡片
          </span>
          <div className="flex gap-2">
            {onOpenModelHub && (
              <button
                onClick={() => {
                  onClose();
                  onOpenModelHub();
                }}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-md shadow-cyan-600/20"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>进入模型中心</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-[#252834] hover:bg-[#323646] text-white font-bold text-xs transition-colors"
            >
              我知道了
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
