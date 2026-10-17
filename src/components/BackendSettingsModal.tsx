import { friendlyProviderLabel } from '../utils/providerLabels';
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
import { saveKeysLocalFirst } from '../services/settingsSave';
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
  'muapiKey',
  'kreaKey',
  'togetherKey',
  'aimlapiKey',
  'novitaKey',
  'veniceKey',
  'wavespeedKey',
  'sogniKey',
  'runwareKey',
  'runwareBaseUrl',
  'modelslabKey',
  'modelslabBaseUrl',
  'replicateKey',
]);

interface BackendSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKeys: ApiKeysState;
  onSaveKeys: (newKeys: ApiKeysState) => void;
  /** When opening from missing-key toast: select this provider in the left list. */
  initialProvider?: string;
  /** Open Model Hub for the active provider (empty popularModels CTA). */
  onOpenModelHub?: (providerId?: ProviderId) => void;
}

export const BackendSettingsModal: React.FC<BackendSettingsModalProps> = ({
  isOpen,
  onClose,
  apiKeys,
  onSaveKeys,
  initialProvider,
  onOpenModelHub,
}) => {
  const [keys, setKeys] = React.useState<ApiKeysState>(apiKeys);
  const initialKeysRef = React.useRef<ApiKeysState>(apiKeys);
  const [activeMainTab, setActiveMainTab] = React.useState<'providers' | 'pool' | 'balance' | 'admin'>('providers');
  const [activeProviderTab, setActiveProviderTab] = React.useState<ProviderId>('fal');
  const [testResults, setTestResults] = React.useState<Record<string, { status: string; message: string; latency?: number }>>({});
  const [testingProvider, setTestingProvider] = React.useState<string | null>(null);
  const [testingSingleKeyIndex, setTestingSingleKeyIndex] = React.useState<number | null>(null);
  const [isSavingAll, setIsSavingAll] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
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
  const [isLoadingStats, setIsLoadingStats] = React.useState(false);
  const [readError, setReadError] = React.useState<string | null>(null);
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
    setIsLoadingStats(true);
    setReadError(null);
    try {
      const data = await fetchKeyPoolStats(adminToken);
      if (!Object.keys(data).length) throw new Error('密钥池未返回数据，请检查网站连接与访问权限后重试。');
      setPoolStats(data);
    }
    catch (err) { setReadError(err instanceof Error ? err.message : '密钥池读取失败'); }
    finally { setIsLoadingStats(false); }
  }, [adminToken]);

  const refreshBalances = React.useCallback(async () => {
    setIsLoadingBalances(true);
    setReadError(null);
    try {
      const b = await fetchCloudBalances(adminToken);
      if (!Object.keys(b).length) throw new Error('余额查询未返回数据，请检查网站连接与访问权限后重试。');
      setBalances(b);
    } catch (err) {
      setReadError(err instanceof Error ? err.message : '余额读取失败');
    } finally {
      setIsLoadingBalances(false);
    }
  }, [adminToken]);

  // S7: opening the modal only syncs local state; stats/balances/settings load on explicit button clicks.
  React.useEffect(() => {
    setKeys(apiKeys);
    initialKeysRef.current = apiKeys;
  }, [apiKeys, isOpen]);

  // Focus the provider that triggered "去 API 设置" (missing-key toast), else leave last tab.
  React.useEffect(() => {
    if (!isOpen) return;
    const id = String(initialProvider || '').trim().toLowerCase();
    if (!id) return;
    const known: ProviderId[] = [
      'fal', 'gemini', 'openai_compat', 'grok_compat', 'agnes', 'sensenova', 'civitai',
      'huggingface', 'modelscope', 'modelscope_ai', 'nanogpt', 'tensorart', 'muapi',
      'wavespeed', 'krea', 'together', 'aimlapi', 'novita', 'venice', 'sogni',
      'runware', 'modelslab', 'replicate',
    ];
    if (!known.includes(id as ProviderId)) return;
    setActiveMainTab('providers');
    setActiveProviderTab(id as ProviderId);
    const t = window.setTimeout(() => {
      const el = document.querySelector(`[data-provider-tab="${id}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, 0);
    return () => window.clearTimeout(t);
  }, [isOpen, initialProvider]);

  if (!isOpen) return null;

  const providers: ProviderConfig[] = [
    {
      id: 'fal',
      name: friendlyProviderLabel('fal'),
      badge: '模型端点 / 多密钥',
      docsUrl: 'https://docs.fal.ai',
      description: '每个 Fal 模型使用独立端点。LoRA 等参数须由该端点支持；选择端点后再配置参数。',
      apiUrl: 'https://fal.run',
      keyName: 'falKey',
      keyPlaceholder: 'fal_key_xxxxxxxxxxxxxxxxxxxxxxxx (支持换行/逗号输入多个 Key)',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'gemini',
      name: friendlyProviderLabel('gemini'),
      badge: 'Google GenAI SDK',
      docsUrl: 'https://ai.google.dev',
      description: '图像生成与提示词推理分别使用用户选定的模型。请核对模型 ID 与账户权限。',
      apiUrl: 'Google GenAI SDK / generateContent',
      keyName: 'geminiKey',
      keyPlaceholder: '系统自动注入环境变量 GEMINI_API_KEY (或填入自定义多 Key)',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'openai_compat',
      name: friendlyProviderLabel('openai_compat'),
      badge: '兼容中转（自填 Base URL，不是官方 OpenAI）',
      docsUrl: 'https://platform.openai.com/docs/api-reference/images/create',
      description: 'OpenAI Images 兼容中转：gpt-image-2 文生图 / 图生图。须自填 Base URL（通常以 /v1 结尾）与 API Key。不是官方 OpenAI，不硬编码任何中转域名。',
      apiUrl: '（用户自填 Base URL）',
      keyName: 'openaiCompatKey',
      keyPlaceholder: 'sk-xxxx（兼容中转 Key）',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'grok_compat',
      name: friendlyProviderLabel('grok_compat'),
      badge: '兼容中转（自填 Base URL，不是官方 xAI）',
      docsUrl: 'https://docs.x.ai/docs/guides/image-generations',
      description: 'Grok / xAI Imagine 兼容中转：生图、图生图、文生视频、图生视频、对话。须自填 Base URL 与 API Key。不是官方 xAI。HTTP 503 grok_media_no_eligible_account 原样暴露，不换商。',
      apiUrl: '（用户自填 Base URL，缺 /v1 时服务端补 /v1）',
      keyName: 'grokCompatKey',
      keyPlaceholder: 'sk-xxxx（兼容中转 Key）',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'agnes',
      name: friendlyProviderLabel('agnes'),
      badge: '聚合引擎 / 2.5 Flash / 3.0 推理',
      docsUrl: 'https://apihub.agnes-ai.com',
      description: '配置 Agnes API 地址与密钥。图像、视频与推理任务分别按选定模型提交。',
      apiUrl: 'https://apihub.agnes-ai.com/v1',
      keyName: 'agnesKey',
      keyPlaceholder: 'sk-xxxx',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'sensenova',
      name: friendlyProviderLabel('sensenova'),
      badge: '提示词推理',
      docsUrl: 'https://token.sensenova.cn',
      description: '用于提示词推理与扩写。需显式选择模型，推理结果可连接至图像生成工作流。',
      apiUrl: 'https://token.sensenova.cn/v1',
      keyName: 'sensenovaKey',
      keyPlaceholder: 'sk-xxxx',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'civitai',
      name: friendlyProviderLabel('civitai'),
      badge: 'C站 LoRA 与底模库',
      docsUrl: 'https://developer.civitai.com',
      description: '直连 Civitai.com 官方开放接口，检索与下载社区数以万计的真实 LoRA、触发词与 Checkpoints。',
      apiUrl: 'https://civitai.com/api/v1',
      keyName: 'civitaiKey',
      keyPlaceholder: 'Civitai 个人 API Key (检索公开模型可免填)',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'huggingface',
      name: friendlyProviderLabel('huggingface'),
      badge: '抱脸开源大模型社区',
      docsUrl: 'https://huggingface.co/docs',
      description: '模型仓库与在线推理不同。请在模型节点中明确选择 HF Inference 或 fal-ai 路由；fal-ai 会产生对应推理费用。Space 的能力单独核实。',
      apiUrl: 'https://router.huggingface.co（所选路由）',
      keyName: 'hfToken',
      keyPlaceholder: 'YOUR_API_KEY',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'modelscope',
      name: friendlyProviderLabel('modelscope'),
      badge: '国内站 / 消耗国内魔粒',
      docsUrl: 'https://modelscope.cn/docs',
      description: '国内站密钥与额度独立于国际站。目录中的资源是否可在线推理，以及 LoRA 能力，需按所选模型核实。',
      apiUrl: 'https://api-inference.modelscope.cn/v1',
      keyName: 'modelscopeToken',
      keyPlaceholder: '国内站 Access Token (ms-xxxxxxxx，从 modelscope.cn 获取)',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'modelscope_ai',
      name: friendlyProviderLabel('modelscope_ai'),
      badge: '国际站 / 消耗国际魔粒',
      docsUrl: 'https://modelscope.ai/docs',
      description: '魔搭社区国际站 (modelscope.ai) 官方推理接口，需绑定阿里云账号激活，消耗国际站魔粒。',
      apiUrl: 'https://api-inference.modelscope.ai/v1',
      keyName: 'modelscopeAiToken',
      keyPlaceholder: '国际站 Access Token (ms-xxxxxxxx，从 modelscope.ai 获取)',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'nanogpt',
      name: friendlyProviderLabel('nanogpt'),
      badge: '模型能力动态校验',
      docsUrl: 'https://docs.nano-gpt.com',
      description: '生成前读取选定模型的能力。resolution 与像素宽高须按该模型要求填写，不支持的字段会明确报错。',
      apiUrl: 'https://api.nano-gpt.com/api/v1/images',
      keyName: 'nanogptKey',
      keyPlaceholder: 'NanoGPT API Key (sk-nano-xxxxxxxx)',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'tensorart',
      name: 'Tensor.Art OpenWorks',
      badge: 'OpenWorks 真出图',
      docsUrl: 'https://github.com/Tensor-Art/tensorart-skills/tree/master/skills/tensorart-generate',
      description: '仅 OpenWorks 真出图：基址 openapi.tensor.art/openworks/v1（ak_tusi → openapi.tusiart.cn）。\n鉴权头 Echo-Access-Key；目录 POST /tool/list；创建 POST /task；轮询 POST /task/query。\n密钥填 ak_tensor_…（或 ak_tusi…）。画布选服务商「Tensor.Art OpenWorks」。\n已下线 TAMS 双轨入口，不再要求另配 Bearer。',
      apiUrl: 'https://openapi.tensor.art/openworks/v1',
      keyName: 'tensorartKey',
      keyPlaceholder: 'OpenWorks Access Key（ak_tensor_…；https://tensor.art/settings/access-key）',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'muapi',
      name: friendlyProviderLabel('muapi'),
      badge: '动态模型目录',
      docsUrl: 'https://muapi.ai',
      description: '使用 MuAPI API Key。模型选择来自供应商目录，不预设模型；目录或连通性失败时显示真实错误。',
      apiUrl: 'MuAPI Models API',
      keyName: 'muapiKey',
      keyPlaceholder: 'MuAPI API Key',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'wavespeed',
      name: friendlyProviderLabel('wavespeed'),
      badge: '动态模型目录',
      docsUrl: 'https://wavespeed.ai/docs',
      description: '使用 WaveSpeed API Key。模型选择来自供应商目录，不预设模型；目录或连通性失败时显示真实错误。',
      apiUrl: 'WaveSpeed Models API',
      keyName: 'wavespeedKey',
      keyPlaceholder: 'WaveSpeed API Key',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'krea',
      name: friendlyProviderLabel('krea'),
      badge: '官方 OpenAPI 目录',
      docsUrl: 'https://docs.krea.ai/developers/introduction',
      description: '使用 Krea API Token（Bearer）。模型目录来自官方 https://api.krea.ai/openapi.json 的 /generate/* 端点；LoRA 来自官方 GET /styles，按 styles[{id,strength}] 提交。失败原样显示状态码与响应体。',
      apiUrl: 'https://api.krea.ai',
      keyName: 'kreaKey',
      keyPlaceholder: 'Krea API Token',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'together',
      name: friendlyProviderLabel('together'),
      badge: '官方 /v1/models',
      docsUrl: 'https://docs.together.ai/docs/inference/images/overview',
      description: '使用 Together API Key（Bearer，环境变量 TOGETHER_API_KEY）。目录来自 GET https://api.together.ai/v1/models（image/video）；图像 POST /v1/images/generations（同步）；视频 POST/GET https://api.together.ai/v2/videos（异步）。serverless image_loras：官方参数指南明文 no longer available，挂 LoRA 本地拦截。失败原样显示状态码与响应体。',
      apiUrl: 'https://api.together.ai/v1',
      keyName: 'togetherKey',
      keyPlaceholder: 'Together API Key',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'aimlapi',
      name: friendlyProviderLabel('aimlapi'),
      badge: '官方 /v1/models',
      docsUrl: 'https://docs.aimlapi.com/',
      description: '使用 AIMLAPI Key（Bearer，环境变量 AIMLAPI_KEY，支持逗号多 Key）。目录来自 GET https://api.aimlapi.com/v1/models；图像 POST /v1/images/generations（同步）；视频 POST/GET /v2/video/generations（异步 generation_id）。LoRA 字段为 loras[{path,scale}]（0–4，最多 3，无默认 scale），仅官方声明的模型（如 alibaba/z-image-turbo-lora）。欠费按官方文档可能返回 403。失败原样显示状态码与响应体。',
      apiUrl: 'https://api.aimlapi.com/v1',
      keyName: 'aimlapiKey',
      keyPlaceholder: 'AIMLAPI API Key',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'novita',
      name: friendlyProviderLabel('novita'),
      badge: '官方 /v3/model',
      docsUrl: 'https://docs.novita.ai/',
      description: '使用 Novita API Key（Bearer，环境变量 NOVITA_API_KEY）。目录 GET https://api.novita.ai/v3/model；SD 出图 POST /v3/async/txt2img（或 img2img）后轮询 GET /v3/async/task-result。LoRA 字段为 request.loras[{model_name,strength}]（strength [0,1]，须显式传，最多 5）。欠费官方多为 HTTP 400 BILLING_BALANCE_NOT_ENOUGH。失败原样显示状态码与响应体。',
      apiUrl: 'https://api.novita.ai',
      keyName: 'novitaKey',
      keyPlaceholder: 'Novita API Key',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'venice',
      name: friendlyProviderLabel('venice'),
      badge: '官方 /models',
      docsUrl: 'https://docs.venice.ai/',
      description: '使用 Venice API Key（Bearer，环境变量 VENICE_API_KEY）。目录 GET https://api.venice.ai/api/v1/models?type=all；图像 POST /image/generate（同步 base64）；视频 POST /video/queue → POST /video/retrieve（异步）。官方无自定义 LoRA（仅捆绑模型 lora_strength）；挂自定义 LoRA 会本地拦截（未发请求）。视频不发 seed。欠费 HTTP 402 INSUFFICIENT_BALANCE。失败原样显示状态码与响应体。',
      apiUrl: 'https://api.venice.ai/api/v1',
      keyName: 'veniceKey',
      keyPlaceholder: 'Venice API Key',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'sogni',
      name: friendlyProviderLabel('sogni'),
      badge: 'REST Creative Workflows',
      docsUrl: 'https://docs.sogni.ai',
      description: '使用 Sogni API Key 与 Creative Workflows。模型从 Sogni 目录动态读取，不预设快捷模型。',
      apiUrl: 'https://api.sogni.ai',
      keyName: 'sogniKey',
      keyPlaceholder: 'Sogni API Key',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'runware',
      name: friendlyProviderLabel('runware'),
      badge: '极速统一 API',
      docsUrl: 'https://runware.ai/docs/',
      description: '使用 Runware API Key。统一高性能推理端点，支持 FLUX、SDXL、Qwen 等模型与 LoRA。',
      apiUrl: 'https://api.runware.ai/v1',
      keyName: 'runwareKey',
      keyPlaceholder: 'Runware API Key',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'modelslab',
      name: friendlyProviderLabel('modelslab'),
      badge: '开放模型库',
      docsUrl: 'https://docs.modelslab.com',
      description: '使用 ModelsLab API Key。支持 Flux、SDXL 等 10,000+ 社区模型生图与 LoRA 融合。',
      apiUrl: 'https://modelslab.com/api/v6/images/text2img',
      keyName: 'modelslabKey',
      keyPlaceholder: 'ModelsLab API Key',
      status: 'unconfigured',
      popularModels: [],
    },
    {
      id: 'replicate',
      name: friendlyProviderLabel('replicate'),
      badge: '官方 API / 云端模型',
      docsUrl: 'https://replicate.com/docs',
      description: '配置 Replicate API Token (r8_...)。支持直接调用 Flux、Ideogram、SDXL 等 Replicate 云端模型与部署。',
      apiUrl: 'https://api.replicate.com/v1',
      keyName: 'replicateKey',
      keyPlaceholder: 'r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (REPLICATE_API_TOKEN)',
      status: 'unconfigured',
      popularModels: [],
    },
  ];

  const currentProvider = providers.find((p) => p.id === activeProviderTab) || providers[0];

  // Helper to get raw key string for current provider
  const rawKeyString = String((keys as any)[currentProvider.keyName] || '');
  const parsedKeyList = rawKeyString
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  const currentStrategy: 'round_robin' = 'round_robin';

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

  const handleStrategyChange = async (strat: 'round_robin') => {
    setKeys((prev) => ({
      ...prev,
      [`${currentProvider.id}_strategy`]: strat,
    }));
    const saved = await updateKeyPoolStrategy(currentProvider.id, strat, adminToken);
    if (!saved) setSaveError('轮询策略未保存到网站，请重试。');
    else {setSaveError(null); refreshStats();}
  };

  const handleTestSingle = async (key: string, index: number) => {
    setTestingSingleKeyIndex(index);
    try {
      const res = await testSingleKey(currentProvider.id, key, adminToken);
      setTestResults((prev) => ({
        ...prev,
        [`${currentProvider.id}_${index}`]: {
          status: res.status === 'active' || res.status === 'ok' ? 'ok' : res.status === 'warning' || res.status === 'unsupported' ? 'warning' : 'error',
          message: res.message,
          latency: res.latency,
        },
      }));
      refreshStats();
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [`${currentProvider.id}_${index}`]: { status: 'error', message: err instanceof Error ? err.message : '密钥测试失败' } }));
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

  const handleSave = async () => {
    if (isSavingAll) return;
    setIsSavingAll(true); setSaveError(null);
    try {
      const { cloud } = await saveKeysLocalFirst({
        // 浏览器本地密钥是主存储（逐请求从 localStorage 读取），必须先保存；
        // 云端同步需管理令牌，失败不阻塞本地、不静默，错误原样展示。
        saveLocal: () => {
          if (keys.replicateKey !== undefined) {
            localStorage.setItem('comfycanvas_replicate_key', keys.replicateKey);
          }
          onSaveKeys(keys);
        },
        syncCloud: async () => {
          const payload: Record<string, string> = {};
          for (const field of ALLOWED_CLOUD_SETTINGS_FIELDS) {
            const value = (keys as any)[field];
            if (typeof value === 'string' && value.trim() && !value.includes('...') && !value.includes('***')) payload[field] = value.trim();
          }
          const result = await saveCloudServerSettings(payload, adminToken);
          if (!result.ok) return { ok: false, status: result.status, error: result.error || `HTTP ${result.status}: 保存未完成` };
          for (const provider of providers) {
            const strategy = keys[`${provider.id}_strategy`];
            if (strategy && strategy !== poolStats[provider.id]?.strategy) {
              if (!await updateKeyPoolStrategy(provider.id, strategy, adminToken)) return { ok: false, error: `${provider.name} 的轮询策略保存失败` };
            }
          }
          return { ok: true };
        },
      });
      if (cloud.ok) {
        onClose();
      } else {
        setSaveError(`浏览器本地密钥已保存（可用于生成）；云端同步未完成：${cloud.error}`);
      }
    } catch (error: any) {setSaveError(`浏览器本地密钥已保存（可用于生成）；云端同步异常：${error.message || '保存失败，请重试'}`);}
    finally {setIsSavingAll(false);}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div role="dialog" aria-modal="true" aria-labelledby="api-settings-title" className="studio-readable api-settings bg-[#181920] border border-[#2e303c] rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#272935] bg-[#121318]">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 text-white font-bold shadow-lg shadow-cyan-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="api-settings-title" className="text-base font-bold text-white tracking-wide">
                  API 与密钥设置
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                  连接配置
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                管理服务商地址、密钥和余额。只读测试通过不代表某个模型已获生成权限。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTestAll}
              disabled={testingAll || Boolean(testingProvider) || testingSingleKeyIndex !== null || isSavingAll}
              className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md shadow-cyan-600/20 disabled:opacity-50 transition-all"
            >
              {testingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>测试已配置连接</span>
            </button>
            <button
              aria-label="关闭 API 设置"
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
            <span>已接入服务商: {providers.length} 处</span>
          </div>
        </div>

        {readError && <div role="alert" className="px-6 py-3 bg-rose-950/40 text-rose-200 break-words">读取失败：{readError}</div>}
        {/* Modal Body */}
        {activeMainTab === 'providers' && (
          <div className="settings-body flex-1 flex min-h-0 overflow-hidden">
            {/* Provider Sidebar */}
            <div className="settings-providers w-64 shrink-0 border-r border-[#242631] bg-[#121318] p-3 space-y-1.5 overflow-y-auto">
              {providers.map((p) => {
                const test = testResults[p.id];
                const keyStr = String((keys as any)[p.keyName] || '');
                const count = keyStr.split(/[\n,;]+/).filter(Boolean).length;
                const isActive = activeProviderTab === p.id;

                return (
                  <button
                    key={p.id}
                    type="button"
                    data-provider-tab={p.id}
                    data-testid={p.id === activeProviderTab ? 'api-settings-active-provider' : undefined}
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
            <div className="min-w-0 flex-1 p-6 overflow-y-auto bg-[#171820] space-y-4">
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
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed whitespace-pre-line space-y-0">
                    {currentProvider.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleTest(currentProvider.id)}
                  disabled={Boolean(testingProvider) || testingAll || isSavingAll}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-cyan-600/20 disabled:opacity-50 shrink-0 ml-3"
                  title={`测试 ${currentProvider.name} 连通性`}
                >
                  {testingProvider === currentProvider.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>测试连通性</span>
                </button>
              </div>

              {/* Endpoint & Models */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#111216] border border-[#252733] rounded-xl p-2.5 text-xs font-mono text-slate-300 flex flex-col justify-center">
                  <span className="text-slate-400 text-[10px]">接口基址 (API Endpoint):</span>
                  <span className="text-cyan-400 font-semibold break-all whitespace-normal mt-0.5" title={currentProvider.apiUrl}>{currentProvider.apiUrl}</span>
                  {currentProvider.id === 'tensorart' && (
                    <span className="text-[9px] text-slate-500 mt-1 leading-snug break-words [overflow-wrap:anywhere]">OpenWorks；密钥槽 tensorartKey 共用，画布选 openworks</span>
                  )}
                </div>
                <div className="bg-[#111216] border border-[#252733] rounded-xl p-2.5 text-xs">
                  <span className="text-slate-400 text-[10px] block mb-1">模型目录:</span>
                  {currentProvider.popularModels.length === 0 ? (
                    <div className="mt-0.5 space-y-1.5">
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        目录请用模型中心，此处不维护假热门列表。compat 中转以你配置的 Base URL 与模型名为准。
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            onOpenModelHub?.(currentProvider.id);
                            onClose();
                          }}
                          title={`打开模型中心 · ${currentProvider.name}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-700/50 bg-cyan-950/40 px-2 py-1 text-[10px] font-semibold text-cyan-300 hover:bg-cyan-900/50 whitespace-normal break-words text-left min-w-0 max-w-full [overflow-wrap:anywhere]"
                        >
                          <Sparkles className="w-3 h-3 shrink-0" />
                          <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">打开模型中心 · {currentProvider.name}</span>
                        </button>
                        <span className="inline-flex items-center rounded-lg border border-slate-700 bg-[#0d0e12] px-2 py-1 text-[10px] text-slate-400">
                          或按 ID 粘贴到画布节点
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-[9px] text-amber-400/80 w-full mb-0.5">以下仅为示例，非实时目录：</span>
                      {currentProvider.popularModels.map((m, mIdx) => (
                        <span
                          key={`pop-${currentProvider.id}-${m}-${mIdx}`}
                          className="text-[10px] font-mono bg-[#20222a] border border-[#2e313d] text-slate-300 px-1.5 py-0.5 rounded"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {(currentProvider.id === 'openai_compat' ||
                currentProvider.id === 'grok_compat' ||
                currentProvider.id === 'agnes' ||
                currentProvider.id === 'sensenova' ||
                currentProvider.id === 'runware' ||
                currentProvider.id === 'modelslab') && (
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
                              : currentProvider.id === 'sensenova'
                                ? 'sensenovaBaseUrl'
                                : currentProvider.id === 'runware'
                                  ? 'runwareBaseUrl'
                                  : 'modelslabBaseUrl'
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
                              : currentProvider.id === 'sensenova'
                                ? 'sensenovaBaseUrl'
                                : currentProvider.id === 'runware'
                                  ? 'runwareBaseUrl'
                                  : 'modelslabBaseUrl';
                      setKeys((prev) => ({ ...prev, [field]: e.target.value }));
                    }}
                    placeholder={
                      currentProvider.id === 'openai_compat'
                        ? 'https://your-relay.example/v1'
                        : currentProvider.id === 'grok_compat'
                          ? 'https://your-relay.example  （缺 /v1 时服务端补 /v1）'
                          : currentProvider.id === 'runware'
                            ? 'https://api.runware.ai/v1'
                            : currentProvider.id === 'modelslab'
                              ? 'https://modelslab.com'
                              : 'https://...'
                    }
                    className="w-full bg-[#0d0e12] border border-[#2b2d38] focus:border-cyan-500 rounded-lg px-2.5 py-1.5 text-slate-200 text-[11px] font-mono outline-none"
                  />
                  <p className="text-[10px] text-slate-500">
                    保存在本浏览器；同步至云端时写入 settings.json。自定义 Base URL 必须同时提供自定义 Key，服务端密钥不会发到用户填的主机。
                  </p>
                  <div className="mt-1.5 px-2.5 py-1.5 rounded-lg bg-[#0d0e12] border border-[#252733] text-[10px] font-mono text-slate-300 flex items-start gap-2">
                    <span className="text-slate-500 shrink-0">当前服务端 Base URL</span>
                    <span className="text-cyan-300/90 break-all">
                      {poolStats[currentProvider.id]?.serverBaseUrl
                        ? String(poolStats[currentProvider.id].serverBaseUrl)
                        : '（未配置 / 点击刷新服务端 key 池）'}
                    </span>
                  </div>
                </div>
              )}

              <div className="bg-[#121317] border border-[#272935] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-purple-400" />
                    多 Key 分配策略
                  </span>
                  <span className="text-slate-400 text-[10px] font-mono">
                    {poolLabel(currentProvider.id)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleStrategyChange('round_robin')}
                  className={`w-full p-2.5 rounded-lg text-left transition-all border ${currentStrategy === 'round_robin' ? 'bg-purple-500/20 border-purple-500/60 text-purple-200 shadow-sm' : 'bg-[#181921] border-[#292b37] text-slate-400 hover:text-slate-200'}`}
                >
                  <div className="font-bold text-[11px]">🔄 顺序轮询 (Round-Robin)</div>
                  <div className="text-[10px] text-slate-400 mt-1 leading-tight">每个独立新请求按配置顺序选择 Key；历史失败状态只用于展示，不会触发故障切换、低延迟改路或自动重试。</div>
                </button>
                <p className="text-[10px] text-amber-300/80 leading-relaxed">已禁用 Failover / Best Latency：失败请求不会因为 401/403/429/网络错误自动换另一把 Key。异步任务仍必须使用提交时绑定的凭据引用继续轮询。</p>
              </div>

              {/* Server key pool (masked) — read-only, above browser custom keys */}
              {Array.isArray(poolStats[currentProvider.id]?.keys) && (
                <div className="space-y-2.5">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                    服务端密钥池 ({poolStats[currentProvider.id].keys.length})
                  </label>
                  {poolStats[currentProvider.id].keys.length === 0 ? (
                    <div className="p-3 rounded-xl border border-dashed border-[#2d2f3d] bg-[#121317] text-center text-slate-500 text-[11px]">
                      服务端暂无密钥（设置 / .env）
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {poolStats[currentProvider.id].keys.map((k: any, idx: number) => (
                        <div
                          key={`srv-k-${idx}`}
                          className="bg-[#121318] border border-[#272935] rounded-xl p-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-[#20222a] text-slate-400 flex items-center justify-center text-[10px] font-mono shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-mono text-xs text-slate-200 truncate" title={k.maskedKey || ''}>
                              {k.maskedKey || '***'}
                            </span>
                            <span
                              className={`text-[8px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                                k.source === 'env'
                                  ? 'bg-sky-950 text-sky-400 border border-sky-800/40'
                                  : 'bg-violet-950 text-violet-400 border border-violet-800/40'
                              }`}
                            >
                              {k.source === 'env' ? '服务端：.env' : '服务端：设置'}
                            </span>
                          </div>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                              k.status === 'active'
                                ? 'bg-emerald-950 text-emerald-400'
                                : k.status === 'rate_limited'
                                  ? 'bg-amber-950 text-amber-400'
                                  : 'bg-rose-950 text-rose-400'
                            }`}
                          >
                            {k.status || 'unknown'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500">仅显示掩码与来源，永不展示完整密钥。下方可另加本浏览器自定义密钥。</p>
                </div>
              )}

              {/* Key List & Editor */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-cyan-400" />
                    本浏览器自定义密钥 ({parsedKeyList.length})
                  </label>
                  <button
                    onClick={refreshStats}
                    disabled={isLoadingStats}
                    className="text-[11px] px-2.5 py-1 rounded bg-[#20222a] hover:bg-[#2c2f3b] text-slate-200 border border-[#313442] flex items-center gap-1 ml-auto mr-2"
                    title="读取服务端 key 池（仅数量/掩码/来源，不访问上游）"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>刷新服务端 key 池</span>
                  </button>
                  <button
                    onClick={() => handleTest(currentProvider.id)}
                    disabled={testingAll || Boolean(testingProvider) || testingSingleKeyIndex !== null || isSavingAll}
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
                              disabled={testingAll || Boolean(testingProvider) || testingSingleKeyIndex !== null || isSavingAll}
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
          <div className="min-w-0 flex-1 p-6 overflow-y-auto bg-[#171820] space-y-4">
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
                    disabled={isLoadingStats}
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
          <div className="min-w-0 flex-1 p-6 overflow-y-auto bg-[#171820] space-y-4">
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
          <div className="min-w-0 flex-1 p-6 overflow-y-auto bg-[#171820] space-y-5">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                云端服务配置管理
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {import.meta.env.VITE_SITES_DEPLOYMENT === 'true' ? '已通过你的 ChatGPT 账号验证，仅网站所有者可以管理云端设置。' : '云端配置需要管理令牌，令牌保存在当前浏览器中。'}
              </p>
            </div>

            {/* Token Input Bar */}
            <div className="bg-[#121318] border border-[#272935] rounded-xl p-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                {import.meta.env.VITE_SITES_DEPLOYMENT === 'true' ? '账号访问验证' : '管理令牌 (Admin Token)'}
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showAdminToken ? 'text' : 'password'}
                    value={import.meta.env.VITE_SITES_DEPLOYMENT === 'true' ? '' : adminToken}
                    disabled={import.meta.env.VITE_SITES_DEPLOYMENT === 'true'}
                    onChange={handleAdminTokenChange}
                    placeholder={import.meta.env.VITE_SITES_DEPLOYMENT === 'true' ? '已通过 ChatGPT 账号登录，无需另填令牌' : '输入服务端配置的 CANVAS_ADMIN_TOKEN...'}
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
                    {import.meta.env.VITE_SITES_DEPLOYMENT === 'true' ? '请确认使用网站所属的 ChatGPT 账号登录，然后重试。' : '请检查服务端管理令牌是否配置，以及当前令牌是否匹配。'}
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

        {saveError && <p role="alert" className="px-6 py-3 text-rose-300 text-sm bg-rose-950/30">{saveError}</p>}
        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-[#242631] bg-[#121318] flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-mono">
            点击保存后加密同步到网站；留空保留已有网站密钥
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
              disabled={isSavingAll || testingAll || Boolean(testingProvider) || testingSingleKeyIndex !== null}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-xs font-bold text-white shadow-lg shadow-cyan-600/20 transition-all"
            >
              {isSavingAll ? '正在保存到网站…' : '保存配置到网站'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};