import React from 'react';
import {
  ExternalLink,
  Key,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Layers,
  Plus,
  Trash2,
  Activity,
  Coins,
  Cpu,
  Clock,
  Check,
  Lock,
  Eye,
  EyeOff,
  ShieldAlert,
} from 'lucide-react';
import { ApiKeysState, ProviderConfig, ProviderId } from '../types/providers';
import {
  testProviderConnection,
  fetchKeyPoolStats,
  updateKeyPoolStrategy,
  testSingleKey,
  fetchCloudBalances,
  getStoredAdminToken,
  saveStoredAdminToken,
  fetchCloudServerSettings,
  saveCloudServerSettings,
} from '../services/api';

const ALLOWED_CLOUD_SETTINGS_FIELDS = new Set([
  'falKey',
  'agnesKey',
  'sensenovaKey',
  'civitaiToken',
  'civitaiKey',
  'hfToken',
  'modelscopeToken',
  'modelscopeAiToken',
  'nanogptKey',
  'tensorartKey',
  'geminiKey',
  'agnesBaseUrl',
  'sensenovaBaseUrl',
  'openaiCompatKey',
  'openaiCompatBaseUrl',
  'grokCompatKey',
  'grokCompatBaseUrl',
]);

interface BackendSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKeys: ApiKeysState;
  onSaveKeys: (newKeys: ApiKeysState) => void;
}

export const BackendSettingsModal: React.FC<BackendSettingsModalProps> = ({
  isOpen,
  onClose,
  apiKeys,
  onSaveKeys,
}) => {
  const [keys, setKeys] = React.useState<ApiKeysState>(apiKeys);
  const initialKeysRef = React.useRef<ApiKeysState>(apiKeys);
  const [activeMainTab, setActiveMainTab] = React.useState<'providers' | 'pool' | 'balance' | 'admin'>('providers');
  const [activeProviderTab, setActiveProviderTab] = React.useState<ProviderId>('fal');
  const [testResults, setTestResults] = React.useState<Record<string, { status: string; message: string; latency?: number }>>({});
  const [testingProvider, setTestingProvider] = React.useState<string | null>(null);
  const [testingSingleKeyIndex, setTestingSingleKeyIndex] = React.useState<number | null>(null);
  const [testingAll, setTestingAll] = React.useState(false);

  // Cloud Admin Token & Server Settings State
  const [adminToken, setAdminToken] = React.useState<string>(getStoredAdminToken());
  const [showAdminToken, setShowAdminToken] = React.useState(false);
  const [cloudSettings, setCloudSettings] = React.useState<Record<string, any>>({});
  const [cloudSettingsError, setCloudSettingsError] = React.useState<string | null>(null);
  const [isLoadingCloudSettings, setIsLoadingCloudSettings] = React.useState(false);
  const [isSavingCloudSettings, setIsSavingCloudSettings] = React.useState(false);
  const [cloudSaveMessage, setCloudSaveMessage] = React.useState<string | null>(null);

  // Key Pool Stats & Balances State
  const [poolStats, setPoolStats] = React.useState<Record<string, any>>({});
  const [balances, setBalances] = React.useState<Record<string, { status: string; detail: string; amount?: number | string }>>({});
  const [isLoadingBalances, setIsLoadingBalances] = React.useState(false);
  const [newKeyInput, setNewKeyInput] = React.useState('');

  const refreshCloudSettings = React.useCallback(async (tokenOverride?: string) => {
    setIsLoadingCloudSettings(true);
    setCloudSettingsError(null);
    setCloudSaveMessage(null);
    try {
      const res = await fetchCloudServerSettings(tokenOverride ?? adminToken);
      if (res.ok && res.data) {
        setCloudSettings(res.data);
      } else {
        setCloudSettingsError(`HTTP ${res.status}: ${res.error || '获取云端配置失败'}`);
      }
    } catch (err: any) {
      setCloudSettingsError(err.message || '网络连接异常');
    } finally {
      setIsLoadingCloudSettings(false);
    }
  }, [adminToken]);

  const handleAdminTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAdminToken(val);
    saveStoredAdminToken(val);
    // S7: no automatic upstream requests — user clicks "验证并拉取云端配置" to load.
  };

  const refreshStats = React.useCallback(async () => {
    const stats = await fetchKeyPoolStats(adminToken);
    setPoolStats(stats);
  }, [adminToken]);

  const refreshBalances = React.useCallback(async () => {
    setIsLoadingBalances(true);
    try {
      const b = await fetchCloudBalances(adminToken);
      setBalances(b);
    } finally {
      setIsLoadingBalances(false);
    }
  }, [adminToken]);

  // S7: opening the modal only syncs local state; stats/balances/settings load on explicit button clicks.
  React.useEffect(() => {
    setKeys(apiKeys);
    initialKeysRef.current = apiKeys;
  }, [apiKeys, isOpen]);

  if (!isOpen) return null;

  const providers: ProviderConfig[] = [
    {
      id: 'fal',
      name: 'Fal.ai',
      badge: 'FLUX & SDXL 极速云 (多 Key 轮询)',
      docsUrl: 'https://docs.fal.ai',
      description: '极速无服务器 (Serverless) 推理平台，支持 FLUX.1 dev/schnell 和 SDXL 以及多 LoRA 栈式加载。支持多 Key 负载均衡与并发轮询。',
      apiUrl: 'https://fal.run',
      keyName: 'falKey',
      keyPlaceholder: 'fal_key_xxxxxxxxxxxxxxxxxxxxxxxx (支持换行/逗号输入多个 Key)',
      status: 'unconfigured',
      popularModels: ['fal-ai/flux/dev', 'fal-ai/flux/schnell', 'fal-ai/fast-sdxl', 'fal-ai/flux-lora'],
    },
    {
      id: 'gemini',
      name: 'Google Gemini',
      badge: '官方直连 SDK / Gemini Image / Gemini 3.8',
      docsUrl: 'https://ai.google.dev',
      description: 'Google 官方 Gemini 2.5 Flash Image、Gemini 3.1 Flash Image (Nano Banana 2) 及 Gemini 3.8 Flash 提示词/参数重绘器。已完成系统级深度集成与原生 SDK 路由。',
      apiUrl: 'Google GenAI SDK (Gemini Image / Gemini 3.8 Flash / Nano Banana)',
      keyName: 'geminiKey',
      keyPlaceholder: '系统自动注入环境变量 GEMINI_API_KEY (或填入自定义多 Key)',
      status: 'connected',
      popularModels: ['gemini-2.5-flash-image', 'gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'],
    },
    {
      id: 'openai_compat',
      name: 'OpenAI 兼容中转',
      badge: '兼容中转（自填 Base URL，不是官方 OpenAI）',
      docsUrl: 'https://platform.openai.com/docs/api-reference/images/create',
      description: 'OpenAI Images 兼容中转：gpt-image-2 文生图 / 图生图。须自填 Base URL（通常以 /v1 结尾）与 API Key。不是官方 OpenAI，不硬编码任何中转域名。',
      apiUrl: '（用户自填 Base URL）',
      keyName: 'openaiCompatKey',
      keyPlaceholder: 'sk-xxxx（兼容中转 Key）',
      status: 'unconfigured',
      popularModels: ['gpt-image-2'],
    },
    {
      id: 'grok_compat',
      name: 'Grok 兼容中转',
      badge: '兼容中转（自填 Base URL，不是官方 xAI）',
      docsUrl: 'https://docs.x.ai/docs/guides/image-generations',
      description: 'Grok / xAI Imagine 兼容中转：生图、图生图、文生视频、图生视频、对话。须自填 Base URL 与 API Key。不是官方 xAI。HTTP 503 grok_media_no_eligible_account 原样暴露，不换商。',
      apiUrl: '（用户自填 Base URL，缺 /v1 时服务端补 /v1）',
      keyName: 'grokCompatKey',
      keyPlaceholder: 'sk-xxxx（兼容中转 Key）',
      status: 'unconfigured',
      popularModels: ['grok-imagine-image', 'grok-imagine-image-2.0', 'grok-imagine-video', 'grok-4.3', 'grok-4.5'],
    },
    {
      id: 'agnes',
      name: 'Agnes AI (ApiHub)',
      badge: '聚合引擎 / 2.5 Flash / 3.0 推理',
      docsUrl: 'https://apihub.agnes-ai.com',
      description: 'Agnes AI 官方高并发聚合接口，提供秒级 Flash 生图、动态运镜视频及 3.0 Flash 深度思考推理大模型。',
      apiUrl: 'https://apihub.agnes-ai.com/v1',
      keyName: 'agnesKey',
      keyPlaceholder: 'sk-xxxx',
      status: 'unconfigured',
      popularModels: ['agnes-image-2.5-flash', 'agnes-image-2.1-flash', 'agnes-video-2.5-flash', 'agnes-3.0-flash'],
    },
    {
      id: 'sensenova',
      name: 'SenseNova (商汤日日新)',
      badge: '商汤科技 / DeepSeek V4 / GLM-5.2',
      docsUrl: 'https://token.sensenova.cn',
      description: '商汤日日新大模型开放平台，集成 DeepSeek V4 极速推理思考、清华智谱 GLM-5.2、SenseNova 6.8 及多模态视觉理解。',
      apiUrl: 'https://token.sensenova.cn/v1',
      keyName: 'sensenovaKey',
      keyPlaceholder: 'sk-xxxx',
      status: 'unconfigured',
      popularModels: ['deepseek-v4-flash', 'deepseek-v4-pro', 'glm-5.2', 'sensenova-6.8-flash-lite'],
    },
    {
      id: 'civitai',
      name: 'Civitai API',
      badge: 'C站 LoRA 与底模库',
      docsUrl: 'https://developer.civitai.com',
      description: '直连 Civitai.com 官方开放接口，检索与下载社区数以万计的真实 LoRA、触发词与 Checkpoints。',
      apiUrl: 'https://civitai.com/api/v1',
      keyName: 'civitaiKey',
      keyPlaceholder: 'Civitai 个人 API Key (检索公开模型可免填)',
      status: 'unconfigured',
      popularModels: ['10,000+ SDXL LoRAs', 'FLUX LoRAs', '二次元与写实人物 LoRA'],
    },
    {
      id: 'huggingface',
      name: 'Hugging Face',
      badge: '抱脸开源大模型社区',
      docsUrl: 'https://huggingface.co/docs',
      description: 'Hugging Face 官方推理接口与模型 Hub，覆盖全量开源 Diffusers、SafeTensors 与 PEFT LoRA。',
      apiUrl: 'https://api-inference.huggingface.co',
      keyName: 'hfToken',
      keyPlaceholder: 'hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      status: 'unconfigured',
      popularModels: ['black-forest-labs/FLUX.1-schnell', 'stabilityai/stable-diffusion-xl-base-1.0'],
    },
    {
      id: 'modelscope',
      name: 'ModelScope CN (魔搭国内站)',
      badge: '国内站 / 消耗国内魔粒',
      docsUrl: 'https://modelscope.cn/docs',
      description: '魔搭社区国内站 (modelscope.cn) 官方推理接口，消耗国内魔粒额度，支持 Wan 2.1、Z-Image-Turbo 及国内全量微调 LoRA。',
      apiUrl: 'https://api-inference.modelscope.cn/v1',
      keyName: 'modelscopeToken',
      keyPlaceholder: '国内站 Access Token (ms-xxxxxxxx，从 modelscope.cn 获取)',
      status: 'unconfigured',
      popularModels: ['Tongyi-MAI/Z-Image-Turbo', 'damo/wan2.1-t2i', 'laonansheng Z-Image LoRA'],
    },
    {
      id: 'modelscope_ai',
      name: 'ModelScope AI (魔搭国际站)',
      badge: '国际站 / 消耗国际魔粒',
      docsUrl: 'https://modelscope.ai/docs',
      description: '魔搭社区国际站 (modelscope.ai) 官方推理接口，需绑定阿里云账号激活，消耗国际站魔粒。',
      apiUrl: 'https://api-inference.modelscope.ai/v1',
      keyName: 'modelscopeAiToken',
      keyPlaceholder: '国际站 Access Token (ms-xxxxxxxx，从 modelscope.ai 获取)',
      status: 'unconfigured',
      popularModels: ['Tongyi-MAI/Z-Image-Turbo', 'damo/wan2.1-t2i', 'AI-ModelScope/flux.1-dev'],
    },
    {
      id: 'nanogpt',
      name: 'NanoGPT',
      badge: '按张计费极速 API',
      docsUrl: 'https://docs.nano-gpt.com',
      description: 'NanoGPT.com 图像生成接口，提供超低延迟单次生图，无需维护 GPU 服务器。',
      apiUrl: 'https://nano-gpt.com/api',
      keyName: 'nanogptKey',
      keyPlaceholder: 'NanoGPT API Key (sk-nano-xxxxxxxx)',
      status: 'unconfigured',
      popularModels: ['flux-schnell', 'flux-dev', 'sdxl-turbo', 'midjourney-v6'],
    },
    {
      id: 'tensorart',
      name: 'Tensor.Art / TusiArt',
      badge: '吐司 AI 模型中心',
      docsUrl: 'https://tensor.art',
      description: 'Tensor.Art / 吐司 AI 模型社区，集成 FLUX.1、SDXL、Pony、Illustrious、Wan 2.1 等海量真实开源模型与微调 LoRA。',
      apiUrl: 'https://openapi.tensor.art/openworks/v1 (或 openapi.tusiart.cn)',
      keyName: 'tensorartKey',
      keyPlaceholder: 'Tensor.Art / 吐司 API Key (ak_tensor_... / ak_tusi_...)',
      status: 'unconfigured',
      popularModels: ['FLUX.1 [dev]', 'SDXL 1.0 Base', 'Pony Diffusion V6 XL', 'Illustrious-XL', 'Wan 2.1 Cinematic Video'],
    },
  ];

  const currentProvider = providers.find((p) => p.id === activeProviderTab) || providers[0];

  // Helper to get raw key string for current provider
  const rawKeyString = String((keys as any)[currentProvider.keyName] || '');
  const parsedKeyList = rawKeyString
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  const currentStrategy = keys[`${currentProvider.id}_strategy`] || poolStats[currentProvider.id]?.strategy || 'round_robin';

  // S7: server key counts come only from the pool stats (env + settings merged); null = not loaded yet.
  const poolSummary = (provId: string): { total: number; settings: number; env: number } | null => {
    const s = poolStats[provId];
    if (!s || !Array.isArray(s.keys)) return null;
    const settings = s.keys.filter((k: any) => k.source === 'settings').length;
    return { total: s.keys.length, settings, env: s.keys.length - settings };
  };
  const poolLabel = (provId: string): string => {
    const p = poolSummary(provId);
    if (!p) return '服务端：未加载（点击刷新）';
    return `服务端 ${p.total} 个（设置 ${p.settings} / .env ${p.env}）`;
  };
  // settings.json key field -> pool provider id (civitaiToken is a second civitai field).
  const fieldProvider = (field: string): string | undefined =>
    field === 'civitaiToken' ? 'civitai' : providers.find((p) => p.keyName === field)?.id;

  const handleUpdateKeysForProvider = (newList: string[]) => {
    const joined = newList.join('\n');
    setKeys((prev) => ({
      ...prev,
      [currentProvider.keyName]: joined,
    }));
  };

  const handleAddKey = () => {
    if (!newKeyInput.trim()) return;
    const added = newKeyInput
      .split(/[\n,;]+/)
      .map((k) => k.trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...parsedKeyList, ...added]));
    handleUpdateKeysForProvider(merged);
    setNewKeyInput('');
  };

  const handleDeleteKey = (idx: number) => {
    const copy = [...parsedKeyList];
    copy.splice(idx, 1);
    handleUpdateKeysForProvider(copy);
  };

  const handleStrategyChange = async (strat: 'round_robin' | 'failover' | 'latency_best') => {
    setKeys((prev) => ({
      ...prev,
      [`${currentProvider.id}_strategy`]: strat,
    }));
    await updateKeyPoolStrategy(currentProvider.id, strat, adminToken);
    refreshStats();
  };

  const handleTestSingle = async (key: string, index: number) => {
    setTestingSingleKeyIndex(index);
    try {
      const res = await testSingleKey(currentProvider.id, key, adminToken);
      setTestResults((prev) => ({
        ...prev,
        [`${currentProvider.id}_${index}`]: {
          status: res.status === 'active' || res.status === 'ok' ? 'ok' : 'error',
          message: res.message,
          latency: res.latency,
        },
      }));
      refreshStats();
    } finally {
      setTestingSingleKeyIndex(null);
    }
  };

  const handleTest = async (providerId: ProviderId) => {
    setTestingProvider(providerId);
    const key = (keys as any)[providers.find((p) => p.id === providerId)?.keyName || ''];
    try {
      const res = await testProviderConnection(providerId, key, adminToken);
      setTestResults((prev) => ({
        ...prev,
        [providerId]: {
          status: res.status,
          message: res.message || (res.status === 'ok' ? '连接成功' : '连接失败'),
          latency: res.latency,
        },
      }));
      refreshStats();
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: {
          status: 'error',
          message: e.message || '网络连接异常',
        },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const handleTestAll = async () => {
    setTestingAll(true);
    for (const p of providers) {
      const key = (keys as any)[p.keyName] || '';
      try {
        const res = await testProviderConnection(p.id, key, adminToken);
        setTestResults((prev) => ({
          ...prev,
          [p.id]: {
            status: res.status,
            message: res.message || (res.status === 'ok' ? '连接成功' : '连接失败'),
            latency: res.latency,
          },
        }));
      } catch (err: any) {
        setTestResults((prev) => ({
          ...prev,
          [p.id]: {
            status: 'error',
            message: err.message || '测试失败',
          },
        }));
      }
    }
    setTestingAll(false);
    refreshStats();
  };

  const handleSave = () => {
    onSaveKeys(keys);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#181920] border border-[#2e303c] rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#272935] bg-[#121318]">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 text-white font-bold shadow-lg shadow-cyan-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  云端 API 接入管理 & 多 Key 轮询总控台
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                  Multi-Key Rotation & Balances
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                支持多 Key 轮询分发、故障平滑切换 (Failover)、额度余额实时查询与 Google Gemini 官方引擎直连
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTestAll}
              disabled={testingAll}
              className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md shadow-cyan-600/20 disabled:opacity-50 transition-all"
            >
              {testingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>全量连通测试</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-[#252731] transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Navigation Bar Tabs */}
        <div className="flex items-center justify-between px-6 py-2 border-b border-[#242631] bg-[#14151b]">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveMainTab('providers')}
              className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                activeMainTab === 'providers'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1f2029]'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>服务商密钥配置</span>
            </button>
            <button
              onClick={() => setActiveMainTab('pool')}
              className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                activeMainTab === 'pool'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1f2029]'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>多 Key 负载监控</span>
            </button>
            <button
              onClick={() => setActiveMainTab('balance')}
              className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                activeMainTab === 'balance'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1f2029]'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>余额与额度总览</span>
            </button>
            <button
              onClick={() => setActiveMainTab('admin')}
              className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                activeMainTab === 'admin'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1f2029]'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>云端管理 (Admin)</span>
            </button>
          </div>
          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
            <span>当前可用引擎: {providers.length} 处</span>
          </div>
        </div>

        {/* Modal Body */}
        {activeMainTab === 'providers' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Provider Sidebar */}
            <div className="w-64 border-r border-[#242631] bg-[#121318] p-3 space-y-1.5 overflow-y-auto">
              {providers.map((p) => {
                const test = testResults[p.id];
                const keyStr = String((keys as any)[p.keyName] || '');
                const count = keyStr.split(/[\n,;]+/).filter(Boolean).length;
                const isActive = activeProviderTab === p.id;

                return (
                  <button
                    key={p.id}
                    onClick={() => setActiveProviderTab(p.id)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all ${
                      isActive
                        ? 'bg-cyan-500/15 border border-cyan-500/40 text-white shadow-sm'
                        : 'hover:bg-[#1d1f27] text-slate-300 border border-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate flex items-center gap-1.5">
                        <span>{p.name}</span>
                        {p.id === 'gemini' && (
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-mono">
                            内置直连
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{p.badge}</div>
                      <div className="text-[9px] text-slate-500 font-mono truncate">
                        {poolLabel(p.id)}{count > 0 ? ` · 本浏览器 ${count} 个` : ''}
                      </div>
                    </div>
                    <div>
                      {test?.status === 'ok' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : test?.status === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      ) : test?.status === 'error' ? (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      ) : count > 0 ? (
                        <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Provider Details & Multi-Key Editor */}
            <div className="flex-1 p-6 overflow-y-auto bg-[#171820] space-y-4">
              {/* Header Details */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {currentProvider.name}
                    <a
                      href={currentProvider.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40"
                    >
                      <span>官方接入文档</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {currentProvider.description}
                  </p>
                </div>
              </div>

              {/* Endpoint & Models */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#111216] border border-[#252733] rounded-xl p-2.5 text-xs font-mono text-slate-300 flex flex-col justify-center">
                  <span className="text-slate-400 text-[10px]">接口基址 (API Endpoint):</span>
                  <span className="text-cyan-400 font-semibold truncate mt-0.5">{currentProvider.apiUrl}</span>
                </div>
                <div className="bg-[#111216] border border-[#252733] rounded-xl p-2.5 text-xs">
                  <span className="text-slate-400 text-[10px] block mb-1">支持与常用模型列表:</span>
                  <div className="flex flex-wrap gap-1">
                    {currentProvider.popularModels.map((m, mIdx) => (
                      <span
                        key={`pop-${currentProvider.id}-${m}-${mIdx}`}
                        className="text-[10px] font-mono bg-[#20222a] border border-[#2e313d] text-slate-300 px-1.5 py-0.5 rounded"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {(currentProvider.id === 'openai_compat' ||
                currentProvider.id === 'grok_compat' ||
                currentProvider.id === 'agnes' ||
                currentProvider.id === 'sensenova') && (
                <div className="bg-[#111216] border border-[#252733] rounded-xl p-3 space-y-1.5">
                  <label className="text-slate-300 text-[11px] font-semibold flex items-center gap-1.5">
                    Base URL（{currentProvider.id === 'openai_compat' || currentProvider.id === 'grok_compat' ? '兼容中转，必填，不硬编码域名' : '可选自定义端点'}）
                  </label>
                  <input
                    type="text"
                    value={String(
                      (keys as any)[
                        currentProvider.id === 'openai_compat'
                          ? 'openaiCompatBaseUrl'
                          : currentProvider.id === 'grok_compat'
                            ? 'grokCompatBaseUrl'
                            : currentProvider.id === 'agnes'
                              ? 'agnesBaseUrl'
                              : 'sensenovaBaseUrl'
                      ] || '',
                    )}
                    onChange={(e) => {
                      const field =
                        currentProvider.id === 'openai_compat'
                          ? 'openaiCompatBaseUrl'
                          : currentProvider.id === 'grok_compat'
                            ? 'grokCompatBaseUrl'
                            : currentProvider.id === 'agnes'
                              ? 'agnesBaseUrl'
                              : 'sensenovaBaseUrl';
                      setKeys((prev) => ({ ...prev, [field]: e.target.value }));
                    }}
                    placeholder={
                      currentProvider.id === 'openai_compat'
                        ? 'https://your-relay.example/v1'
                        : currentProvider.id === 'grok_compat'
                          ? 'https://your-relay.example  （缺 /v1 时服务端补 /v1）'
                          : 'https://...'
                    }
                    className="w-full bg-[#0d0e12] border border-[#2b2d38] focus:border-cyan-500 rounded-lg px-2.5 py-1.5 text-slate-200 text-[11px] font-mono outline-none"
                  />
                  <p className="text-[10px] text-slate-500">
                    保存在本浏览器；同步至云端时写入 settings.json。自定义 Base URL 必须同时提供自定义 Key，服务端密钥不会发到用户填的主机。
                  </p>
                </div>
              )}

              {/* Multi-Key Rotation Strategy Selector */}
              <div className="bg-[#121317] border border-[#272935] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-purple-400" />
                    多 Key 负载策略 (Rotation Strategy)
                  </span>
                  <span className="text-slate-400 text-[10px] font-mono">
                    {poolLabel(currentProvider.id)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      id: 'round_robin',
                      title: '🔄 顺序轮询 (Round-Robin)',
                      desc: '按序在多 Key 间轮流分发，最大化并发吞吐与配额利用',
                    },
                    {
                      id: 'failover',
                      title: '🛡️ 主备故障切换 (Failover)',
                      desc: '优先使用首个主 Key，遭遇 429 限流或异常时自动切换备用 Key',
                    },
                    {
                      id: 'latency_best',
                      title: '⚡ 最优低延迟 (Best Latency)',
                      desc: '自动测速并优先选择近期响应耗时最低的高速 Key',
                    },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleStrategyChange(st.id as any)}
                      className={`p-2.5 rounded-lg text-left transition-all border ${
                        currentStrategy === st.id
                          ? 'bg-purple-500/20 border-purple-500/60 text-purple-200 shadow-sm'
                          : 'bg-[#181921] border-[#292b37] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-bold text-[11px]">{st.title}</div>
                      <div className="text-[10px] text-slate-400 mt-1 leading-tight">{st.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Key List & Editor */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-cyan-400" />
                    本浏览器自定义密钥 ({parsedKeyList.length})
                  </label>
                  <button
                    onClick={refreshStats}
                    className="text-[11px] px-2.5 py-1 rounded bg-[#20222a] hover:bg-[#2c2f3b] text-slate-200 border border-[#313442] flex items-center gap-1 ml-auto mr-2"
                    title="读取服务端 key 池（仅数量/掩码/来源，不访问上游）"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>刷新服务端 key 池</span>
                  </button>
                  <button
                    onClick={() => handleTest(currentProvider.id)}
                    disabled={testingProvider === currentProvider.id}
                    className="text-[11px] px-2.5 py-1 rounded bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/30 flex items-center gap-1"
                  >
                    {testingProvider === currentProvider.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    <span>测试全池连通性</span>
                  </button>
                </div>

                {parsedKeyList.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-[#2d2f3d] bg-[#121317] text-center text-slate-400 space-y-1">
                    <p>当前服务商暂未配置自定义密钥</p>
                    <p className="text-[10px] text-cyan-400/80">在下方输入框中粘贴 API Key 并点击「添加至密钥池」</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {parsedKeyList.map((k, kIdx) => {
                      const singleTest = testResults[`${currentProvider.id}_${kIdx}`];
                      const masked = k.length > 10 ? `${k.substring(0, 4)}...${k.substring(k.length - 4)}` : `${k.substring(0, 2)}***`;
                      return (
                        <div
                          key={`k-${kIdx}`}
                          className="bg-[#121318] border border-[#272935] rounded-xl p-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-[#20222a] text-slate-400 flex items-center justify-center text-[10px] font-mono shrink-0">
                              {kIdx + 1}
                            </span>
                            <span className="font-mono text-xs text-slate-200 truncate" title={k}>
                              {masked}
                            </span>
                            {singleTest?.status === 'ok' && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 shrink-0 flex items-center gap-0.5">
                                <Check className="w-2.5 h-2.5" /> 就绪 ({singleTest.latency}ms)
                              </span>
                            )}
                            {singleTest?.status === 'error' && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-400 border border-rose-800/40 shrink-0">
                                异常: {singleTest.message}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleTestSingle(k, kIdx)}
                              disabled={testingSingleKeyIndex === kIdx}
                              className="px-2 py-1 rounded bg-[#1e2029] hover:bg-[#282a36] text-[10px] text-cyan-300 flex items-center gap-1 border border-[#313342] transition-colors"
                              title="对当前单个 Key 进行连通测试"
                            >
                              {testingSingleKeyIndex === kIdx ? (
                                <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                              ) : (
                                <Sparkles className="w-3 h-3 text-cyan-400" />
                              )}
                              <span>单项测试</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteKey(kIdx)}
                              className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-[#1f2029] transition-colors"
                              title="移除此 Key"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add Key Input */}
                <div className="pt-2 flex gap-2">
                  <input
                    type="text"
                    value={newKeyInput}
                    onChange={(e) => setNewKeyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddKey();
                      }
                    }}
                    placeholder={`输入 ${currentProvider.name} API Key (支持一次粘贴多个换行/逗号分隔的 Key)...`}
                    className="flex-1 bg-[#0f1014] border border-[#2b2d38] focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddKey}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center gap-1 text-xs shrink-0 transition-all shadow-md shadow-cyan-600/20"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>添加至密钥池</span>
                  </button>
                </div>
              </div>

              {/* Status Report */}
              {testResults[currentProvider.id] && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2.5 border ${
                    testResults[currentProvider.id].status === 'ok'
                      ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                      : testResults[currentProvider.id].status === 'warning'
                      ? 'bg-amber-950/30 border-amber-800/40 text-amber-300'
                      : 'bg-rose-950/30 border-rose-800/40 text-rose-300'
                  }`}
                >
                  {testResults[currentProvider.id].status === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : testResults[currentProvider.id].status === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <div className="flex-1">
                    <span>{testResults[currentProvider.id].message}</span>
                    {testResults[currentProvider.id].latency && (
                      <span className="ml-2 font-mono opacity-75">
                        ({testResults[currentProvider.id].latency}ms)
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Multi-Key Pool Dashboard Tab */}
        {activeMainTab === 'pool' && (
          <div className="flex-1 p-6 overflow-y-auto bg-[#171820] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" />
                  多 Key 轮询健康状态与调用统计
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  监控各服务商当前激活的 Key 数量、限流冷却状态、平均请求延迟及成功率
                </p>
              </div>
              <button
                onClick={refreshStats}
                className="px-3 py-1.5 rounded-lg bg-[#20222a] hover:bg-[#2c2f3b] text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-[#313442]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>刷新监控指标</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {providers.map((p) => {
                const stats = poolStats[p.id];
                const keyCount = stats?.totalKeys || 0;
                const activeCount = stats?.activeKeys || 0;
                const rateLimitedCount = stats?.rateLimitedKeys || 0;
                const invalidCount = stats?.invalidKeys || 0;

                return (
                  <div
                    key={p.id}
                    className="bg-[#121318] border border-[#262834] rounded-xl p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{p.name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                          策略: {stats?.strategy || 'round_robin'}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        共 {keyCount} 个 Key
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
                      <div className="bg-[#181a22] p-2 rounded-lg border border-[#272a38]">
                        <span className="text-emerald-400 font-bold text-xs block">{activeCount}</span>
                        <span className="text-slate-400">🟢 正常可用</span>
                      </div>
                      <div className="bg-[#181a22] p-2 rounded-lg border border-[#272a38]">
                        <span className="text-amber-400 font-bold text-xs block">{rateLimitedCount}</span>
                        <span className="text-slate-400">🟡 限流冷却</span>
                      </div>
                      <div className="bg-[#181a22] p-2 rounded-lg border border-[#272a38]">
                        <span className="text-rose-400 font-bold text-xs block">{invalidCount}</span>
                        <span className="text-slate-400">🔴 鉴权异常</span>
                      </div>
                    </div>

                    {/* Key Details Mini-Table */}
                    {Array.isArray(stats?.keys) && stats.keys.length > 0 && (
                      <div className="space-y-1 pt-1">
                        {stats.keys.map((k: any, idx: number) => (
                          <div
                            key={idx}
                            className="text-[10px] font-mono bg-[#161720] px-2 py-1 rounded flex items-center justify-between text-slate-300"
                          >
                            <span className="truncate max-w-[150px]">{k.maskedKey}</span>
                            <span className={`text-[8px] px-1 py-0.2 rounded font-mono ${k.source === 'env' ? 'bg-sky-950 text-sky-400 border border-sky-800/40' : 'bg-violet-950 text-violet-400 border border-violet-800/40'}`}>
                              {k.source === 'env' ? '服务端：.env' : '服务端：设置'}
                            </span>
                            <div className="flex items-center gap-2 text-slate-400">
                              <span>调用: {k.totalCalls}次</span>
                              <span>延迟: {k.avgLatencyMs}ms</span>
                              <span
                                className={`px-1 rounded ${
                                  k.status === 'active'
                                    ? 'bg-emerald-950 text-emerald-400'
                                    : k.status === 'rate_limited'
                                    ? 'bg-amber-950 text-amber-400'
                                    : 'bg-rose-950 text-rose-400'
                                }`}
                              >
                                {k.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Balances & Quota Overview Tab */}
        {activeMainTab === 'balance' && (
          <div className="flex-1 p-6 overflow-y-auto bg-[#171820] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Coins className="w-4 h-4 text-emerald-400" />
                  云端各服务商额度与余额管理
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  实时探测魔搭社区魔粒、Fal.ai 算力额度、Google Gemini 等各服务商的额度健康状态
                </p>
              </div>
              <button
                onClick={refreshBalances}
                disabled={isLoadingBalances}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50 transition-all"
              >
                {isLoadingBalances ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>查询最新余额</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {providers.map((p) => {
                const bal = balances[p.id];
                return (
                  <div
                    key={p.id}
                    className="bg-[#121318] border border-[#262834] rounded-xl p-4 space-y-2 flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-white text-xs flex items-center gap-1.5">
                          <span>{p.name}</span>
                          <span className="text-[10px] text-slate-400">({p.badge})</span>
                        </div>
                        <div className="text-[11px] text-slate-300 mt-1">
                          {bal ? bal.detail : '点击右上角「查询最新余额」探测状态'}
                        </div>
                      </div>
                      <div>
                        {bal?.status === 'ok' ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/50 font-semibold">
                            🟢 额度正常
                          </span>
                        ) : bal?.status === 'exhausted' ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800/50 font-semibold">
                            🔴 额度耗尽
                          </span>
                        ) : bal?.status === 'low' ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800/50 font-semibold">
                            🟡 额度偏低
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
                            ⚪ 未查询
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#222430] flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>端点: {p.apiUrl}</span>
                      <a
                        href={p.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
                      >
                        充值/查询控制台 <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cloud Admin Token & Server Settings Tab */}
        {activeMainTab === 'admin' && (
          <div className="flex-1 p-6 overflow-y-auto bg-[#171820] space-y-5">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                云端服务配置管理与接口鉴权 (CANVAS_ADMIN_TOKEN)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                服务端 /api/cloud/settings 接口受环境变量 <span className="font-mono text-amber-300">CANVAS_ADMIN_TOKEN</span> 保护。管理令牌保存在本地浏览器中，请求时通过 Authorization: Bearer 头传递。
              </p>
            </div>

            {/* Token Input Bar */}
            <div className="bg-[#121318] border border-[#272935] rounded-xl p-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                管理令牌 (Admin Token)
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showAdminToken ? 'text' : 'password'}
                    value={adminToken}
                    onChange={handleAdminTokenChange}
                    placeholder="输入服务端配置的 CANVAS_ADMIN_TOKEN..."
                    className="w-full bg-[#1a1b24] border border-[#313444] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 font-mono pr-10 focus:outline-none focus:border-amber-500/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminToken(!showAdminToken)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showAdminToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <button
                  onClick={() => {
                    // Both are server-local reads (settings.json masked + pool counts); no upstream calls.
                    refreshCloudSettings();
                    refreshStats();
                  }}
                  disabled={isLoadingCloudSettings}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-600/20 disabled:opacity-50 transition-all shrink-0"
                >
                  {isLoadingCloudSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>验证并拉取云端配置</span>
                </button>
              </div>
            </div>

            {/* Real Server Error Banner (401 / 503 / Network errors) */}
            {cloudSettingsError && (
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs">
                  <div className="font-bold text-rose-200">服务端鉴权失败或服务异常</div>
                  <div className="font-mono mt-1 text-[11px] bg-rose-950/70 p-2 rounded border border-rose-800/40 text-rose-200 break-all">
                    {cloudSettingsError}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    提示：若状态码为 503 说明服务端未设置 CANVAS_ADMIN_TOKEN 环境变量；若为 401 说明管理令牌不匹配。
                  </p>
                </div>
              </div>
            )}

            {/* Save Status Banner */}
            {cloudSaveMessage && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 flex items-center gap-2 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{cloudSaveMessage}</span>
              </div>
            )}

            {/* Server Settings Status (Masked Keys) */}
            {Object.keys(cloudSettings).length > 0 && !cloudSettingsError && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>云端已鉴权：配置状态清单 (明文密钥已脱敏掩码)</span>
                  </h4>
                  <button
                    onClick={async () => {
                      setIsSavingCloudSettings(true);
                      setCloudSaveMessage(null);
                      setCloudSettingsError(null);
                      try {
                        const payload: Record<string, string> = {};
                        for (const field of ALLOWED_CLOUD_SETTINGS_FIELDS) {
                          const val = (keys as any)[field];
                          if (typeof val !== 'string') continue;
                          const trimmed = val.trim();
                          if (!trimmed) continue; // 不发空字符串
                          // 拒绝掩码值
                          if (/^.{2,4}(\.\.\.|\*\*\*).{2,4}$/.test(trimmed) || trimmed.includes('...') || trimmed.includes('***')) continue;

                          const initialVal = (initialKeysRef.current as any)?.[field];
                          const trimmedInitial = typeof initialVal === 'string' ? initialVal.trim() : '';
                          const cloudVal = cloudSettings[field];
                          const isCloudConfigured = typeof cloudVal === 'object' && cloudVal !== null && 'configured' in cloudVal
                            ? cloudVal.configured
                            : Boolean(cloudVal);

                          // 只发非空且有改动的已知字段（相对初次打开有改动，或云端尚未配置）
                          if (trimmed !== trimmedInitial || !isCloudConfigured) {
                            payload[field] = trimmed;
                          }
                        }

                        if (Object.keys(payload).length === 0) {
                          setCloudSaveMessage('没有需要同步的新增或改动字段');
                          return;
                        }

                        const res = await saveCloudServerSettings(payload, adminToken);
                        if (res.ok && res.data) {
                          setCloudSettings(res.data);
                          setCloudSaveMessage('已成功将当前改动配置同步至云端存储 (POST /api/cloud/settings)');
                          initialKeysRef.current = { ...keys };
                        } else {
                          setCloudSettingsError(`HTTP ${res.status}: ${res.error || '保存云端配置失败'}`);
                        }
                      } finally {
                        setIsSavingCloudSettings(false);
                      }
                    }}
                    disabled={isSavingCloudSettings}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all"
                  >
                    {isSavingCloudSettings ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    <span>同步本地配置至云端 (POST)</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(cloudSettings).map(([k, v]) => {
                    const isKeyObj = typeof v === 'object' && v !== null && 'configured' in v;
                    const configured = isKeyObj ? v.configured : Boolean(v);
                    const masked = isKeyObj ? v.masked : '';
                    const prov = isKeyObj ? fieldProvider(k) : undefined;
                    return (
                      <div
                        key={k}
                        className="bg-[#121318] border border-[#272935] rounded-xl p-3 flex items-center justify-between"
                      >
                        <div className="min-w-0 flex-1 mr-2">
                          <div className="font-mono font-bold text-slate-200 text-xs truncate">{k}</div>
                          {isKeyObj ? (
                            <>
                              <div className="font-mono text-[11px] text-amber-300/80 mt-0.5">
                                服务端：设置 — {masked ? `掩码 ${masked}` : '未填写'}
                              </div>
                              {prov && (
                                <div className="font-mono text-[10px] text-slate-400 mt-0.5">{poolLabel(prov)}</div>
                              )}
                            </>
                          ) : typeof v === 'string' ? (
                            <div className="font-mono text-[11px] text-slate-400 mt-0.5 truncate">
                              {v}
                            </div>
                          ) : null}
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border shrink-0 ${
                            configured
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/50'
                              : 'bg-slate-800/80 text-slate-400 border-slate-700'
                          }`}
                        >
                          {configured ? '🟢 设置中已填' : '⚪ 设置中未填'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-[#242631] bg-[#121318] flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-mono">
            所有密钥与轮询策略均实时同步至本地及服务端安全存储中
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#20222b] hover:bg-[#2b2d39] text-xs font-semibold text-slate-300 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-xs font-bold text-white shadow-lg shadow-cyan-600/20 transition-all"
            >
              保存所有配置与密钥池
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
