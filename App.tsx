import React, { useState, useEffect, useMemo } from 'react';
import { 
  Character, 
  DEFAULT_CHARACTERS, 
  ScenePrompt, 
  PlatformType, 
  PLATFORM_CONFIGS, 
  ApiConfig, 
  GenerationState,
  OptionalParams,
  ApiStatus,
  SHOT_TYPES,
  CAMERA_MOVEMENTS,
  CAMERA_ANGLES,
  CameraGrammar
} from './types';
import { generateScenePrompts, testApiEngine } from './services/geminiService';

const SMART_DEFAULT_TITLE = "Tom and Jerry Get Into Trouble in a Bangladeshi Village";
const DEFAULT_EMOTIONS_CYCLE = ["Playful", "Suspenseful", "Excited", "Curious", "Mischievous"];

const DEFAULT_PARAMS: OptionalParams = {
  temperature: 1.0,
  maxTokens: 4096,
  safetyThreshold: "BLOCK_NONE",
  topP: 0.95,
  topK: 40,
  endpointType: "chat",
  resolution: "1024x1024",
  responseFormat: "json"
};

const App: React.FC = () => {
  // --- NODE 1: PLATFORM SELECTION ---
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('Gemini');
  const [activePlatform, setActivePlatform] = useState<PlatformType | null>(null);

  // --- NODE 7: STATUS MANAGER ---
  const [configs, setConfigs] = useState<Record<PlatformType, ApiConfig>>({
    Gemini: { apiKey: '', platformType: 'Gemini', modelName: PLATFORM_CONFIGS.Gemini.models[0], optionalParams: { ...DEFAULT_PARAMS }, status: 'UNSET' },
    OpenAI: { apiKey: '', platformType: 'OpenAI', modelName: PLATFORM_CONFIGS.OpenAI.models[0], optionalParams: { ...DEFAULT_PARAMS }, status: 'UNSET' },
    DeepSeek: { apiKey: '', platformType: 'DeepSeek', modelName: PLATFORM_CONFIGS.DeepSeek.models[0], optionalParams: { ...DEFAULT_PARAMS }, status: 'UNSET' }
  });

  // --- PROJECT STATE ---
  const [videoTitle, setVideoTitle] = useState("");
  const [isLocalized, setIsLocalized] = useState(false);
  const [sceneCount, setSceneCount] = useState(5); 
  const [sceneDuration, setSceneDuration] = useState(8);
  const [characters, setCharacters] = useState<Character[]>(DEFAULT_CHARACTERS);
  const [emotions, setEmotions] = useState<string[]>([]);
  const [cameraGrammar, setCameraGrammar] = useState<CameraGrammar>({
    shotType: SHOT_TYPES[1], // Medium
    movement: CAMERA_MOVEMENTS[0], // Static
    angle: CAMERA_ANGLES[0] // Eye-level
  });

  // --- RUNTIME STATE ---
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [statusMessage, setStatusMessage] = useState("");
  const [results, setResults] = useState<ScenePrompt[]>([]);
  const [activeTab, setActiveTab] = useState<'api' | 'config' | 'results'>('api');
  const [selectedScenes, setSelectedScenes] = useState<Set<number>>(new Set());
  const [filterText, setFilterText] = useState("");

  const currentConfig = configs[selectedPlatform];

  /**
   * Node 4: VALIDATION NODE
   */
  const validateApiKey = (p: PlatformType, key: string): { status: ApiStatus; error?: string } => {
    const trimmedKey = key.trim();
    if (!trimmedKey) return { status: 'UNSET' };

    const commonPattern = /^[a-zA-Z0-9\-_]{20,}$/;

    switch (p) {
      case 'OpenAI':
        if (!/^sk-[a-zA-Z0-9\-_]{15,}$/.test(trimmedKey)) {
          return { status: 'INVALID', error: "OPENAI KEYS MUST START WITH 'SK-' AND MAY CONTAIN HYPHENS." };
        }
        break;
      case 'DeepSeek':
        if (!commonPattern.test(trimmedKey)) {
          return { status: 'INVALID', error: "DEEPSEEK KEYS MUST BE AT LEAST 20 CHARACTERS." };
        }
        break;
      case 'Gemini':
        if (trimmedKey.length < 20) {
          return { status: 'INVALID', error: "GEMINI KEYS MUST BE AT LEAST 20 CHARACTERS." };
        }
        break;
    }
    return { status: 'SAVED_UNTESTED' };
  };

  const handlePlatformChange = (p: PlatformType) => {
    setSelectedPlatform(p);
  };

  /**
   * Node 2 & 3: API KEY INPUT & SAVE
   */
  const handleApiKeyChange = (key: string) => {
    const { status, error } = validateApiKey(selectedPlatform, key);

    setConfigs(prev => ({
      ...prev,
      [selectedPlatform]: { 
        ...prev[selectedPlatform], 
        apiKey: key.trim(), 
        status, 
        message: error 
      }
    }));

    if (activePlatform === selectedPlatform) {
      setActivePlatform(null);
    }
  };

  /**
   * Node 6: API TEST ENGINE
   */
  const handleTestConnection = async () => {
    if (currentConfig.status === 'INVALID' || currentConfig.status === 'UNSET' || !currentConfig.apiKey) return;

    setConfigs(prev => ({ ...prev, [selectedPlatform]: { ...prev[selectedPlatform], status: 'TESTING', message: "INITIATING HANDSHAKE..." } }));
    
    try {
      const result = await testApiEngine(selectedPlatform, currentConfig.apiKey);
      setConfigs(prev => ({
        ...prev,
        [selectedPlatform]: { 
          ...prev[selectedPlatform], 
          status: result.success ? 'HEALTHY' : 'FAILED',
          latency: result.latency,
          message: result.message
        }
      }));
      setStatusMessage(result.message);
    } catch (e: any) {
      setConfigs(prev => ({ 
        ...prev, 
        [selectedPlatform]: { ...prev[selectedPlatform], status: 'FAILED', message: `PROTOCOL ERROR: ${e.message}` } 
      }));
    }
  };

  /**
   * Node 8: ACTIVATE PLATFORM
   */
  const handleActivatePlatform = () => {
    if (currentConfig.status !== 'HEALTHY') return;
    setActivePlatform(selectedPlatform);
    setStatusMessage(`Engine Authorized: ${selectedPlatform}`);
    setTimeout(() => setStatusMessage(""), 3000);
  };

  const assembleMasterPrompt = (s: ScenePrompt): string => {
    const charSummary = characters.map(c => `${c.name}: ${c.role} (${c.color}, ${c.outline}px outline)`).join(', ');
    const castDepth = `Foreground: ${s.characters.split(',')[0] || 'Jerry'}; Midground: ${s.characters.split(',')[1] || 'Tom'}; Background: ${s.characters.split(',')[2] || 'Spike, rickshaw, mud huts'}`;
    const actionAssembled = s.actionBeats.map(b => `${b.timeRange} ${b.action}`).join('; ');
    const beatsTimeline = s.actionBeats.map(b => `${b.timeRange}\n${b.action}`).join('\n');

    const cameraBlock = `Camera:\n${s.camera.shotType} shot, ${s.camera.movement}, ${s.camera.angle} angle.\nClassic 2D camera behavior.`;

    return `SCENE ${s.sceneNumber}: 
Metadata: Duration ${s.metadata.duration}s, Tone ${s.metadata.tone}, Localization ${s.metadata.localization}. 
Style: 1940s 2D hand-drawn, 4-5px outlines, watercolor BG. 
${cameraBlock}
Action: ${actionAssembled}. 
Spatial: ${s.spatialRules}. 
Physics: ${s.physics.squashStretch}, ${s.physics.elasticity}, ${s.physics.impactHold}. 
Sync: ${s.textAudioSync}. 
Mood: ${s.mood}. 
Negative: ${s.avoidRules}. 
Camera Shot: ${s.camera.shotType}, Camera Angle: ${s.camera.angle}, Physics Mode: ${s.physics.squashStretch}, Elasticity: ${s.physics.elasticity}, Cast & Depth Protocol: ${charSummary}, ${castDepth}, Environment Art Node: ${s.background}, Sync Node (Text/Audio): ${s.textAudioSync}, Action Beats Timeline: 
${beatsTimeline}`;
  };

  const copyIndividualScene = (s: ScenePrompt) => {
    const prompt = assembleMasterPrompt(s);
    navigator.clipboard.writeText(prompt);
    setStatusMessage(`Scene ${s.sceneNumber} Master Copied`);
    setTimeout(() => setStatusMessage(""), 2000);
  };

  const filteredResults = useMemo(() => {
    return results.filter(r => 
      r.setup.toLowerCase().includes(filterText.toLowerCase()) || 
      r.metadata.tone.toLowerCase().includes(filterText.toLowerCase())
    );
  }, [results, filterText]);

  /**
   * Node 9: SESSION API LOCK
   */
  const handleGenerate = async () => {
    if (!activePlatform) {
      setActiveTab('api');
      setStatusMessage("ERR: No Engine Activated");
      return;
    }

    const sessionPlatform = activePlatform; 
    const activeConfig = configs[sessionPlatform];
    
    setIsGenerating(true);
    setResults([]);
    setActiveTab('results');

    try {
      const state: GenerationState = {
        videoTitle: videoTitle || SMART_DEFAULT_TITLE,
        isLocalized,
        emotions,
        characters,
        sceneCount,
        sceneDuration,
        currentPlatform: sessionPlatform,
        apiConfigs: configs,
        apiKey: activeConfig.apiKey,
        modelName: activeConfig.modelName,
        optionalParams: activeConfig.optionalParams,
        cameraGrammar
      };

      const prompts = await generateScenePrompts(state, (current, total, message) => {
        setProgress({ current, total });
        setStatusMessage(message || "");
      });
      setResults(prompts);
      setSelectedScenes(new Set(prompts.map(p => p.sceneNumber)));
    } catch (e: any) {
      alert("Pipeline Disruption: " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const exportData = (type: 'JSON' | 'TXT' | 'CSV') => {
    const exportScenes = results.filter(s => selectedScenes.has(s.sceneNumber));
    const download = (content: string, ext: string, mime: string) => {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${videoTitle.replace(/\s+/g, '_') || 'Vexa_Export'}.${ext}`;
        a.click();
    };

    if (type === 'JSON') {
      download(JSON.stringify(exportScenes.map(s => ({ ...s, masterPrompt: assembleMasterPrompt(s) })), null, 2), 'json', 'application/json');
    } else if (type === 'TXT') {
      const txt = exportScenes.map(s => assembleMasterPrompt(s)).join('\n\n' + '-'.repeat(40) + '\n\n');
      download(txt, 'txt', 'text/plain');
    } else if (type === 'CSV') {
      const header = "Scene,Duration,Tone,Script\n";
      const rows = exportScenes.map(s => `${s.sceneNumber},${s.metadata.duration},${s.metadata.tone},"${s.setup.replace(/"/g, '""')}"`).join('\n');
      download(header + rows, 'csv', 'text/csv');
    }
  };

  useEffect(() => {
    setEmotions(Array.from({ length: sceneCount }, (_, i) => DEFAULT_EMOTIONS_CYCLE[i % DEFAULT_EMOTIONS_CYCLE.length]));
  }, [sceneCount]);

  return (
    <div className="min-h-screen bg-[#0a0b10] text-gray-100 font-sans selection:bg-blue-600/40">
      <header className="sticky top-0 z-50 bg-[#0a0b10]/90 backdrop-blur-xl border-b border-gray-800/50 px-8 py-5 no-print">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/30 ring-1 ring-white/10">
              <i className="fas fa-layer-group text-white text-2xl"></i>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter uppercase italic leading-none text-white">Vexa Toon</h1>
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-blue-500 mt-1.5">Authority Configuration Node</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl border ${activePlatform ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-500'}`}>
              <i className={`fas ${activePlatform ? 'fa-check-circle' : 'fa-exclamation-triangle'}`}></i>
              <span className="text-[10px] font-black uppercase tracking-widest">{activePlatform ? `CONNECTED: ${activePlatform}` : 'OFFLINE'}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-10">
        <nav className="flex border-b border-gray-800 mb-12 gap-2 overflow-x-auto no-scrollbar no-print">
          {(['api', 'config', 'results'] as const).map(t => (
            <button 
              key={t} onClick={() => setActiveTab(t)}
              className={`px-10 py-5 text-[11px] font-black uppercase tracking-[0.2em] transition-all border-b-2 whitespace-nowrap ${activeTab === t ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              {t === 'api' ? '1. Authority' : t === 'config' ? '2. Assembly' : '3. Output'}
            </button>
          ))}
        </nav>

        {activeTab === 'api' && (
          <section className="space-y-12 animate-in fade-in slide-in-from-top-4 duration-500 no-print">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {(Object.keys(PLATFORM_CONFIGS) as PlatformType[]).map((p) => (
                  <button 
                    key={p} onClick={() => handlePlatformChange(p)}
                    className={`p-10 rounded-[2.5rem] border-2 transition-all flex flex-col items-center group relative overflow-hidden ${selectedPlatform === p ? 'border-blue-600 bg-blue-600/10 shadow-2xl shadow-blue-500/20' : 'border-gray-800 bg-gray-950/40 hover:border-gray-700'}`}
                  >
                    <i className={`fab ${PLATFORM_CONFIGS[p].icon} text-6xl mb-6 ${selectedPlatform === p ? 'text-blue-400' : 'text-gray-700'} transition-transform group-hover:scale-110`}></i>
                    <span className="text-sm font-black uppercase tracking-widest mb-2 text-white">{PLATFORM_CONFIGS[p].label}</span>
                    <p className="text-[10px] font-bold text-gray-500 text-center uppercase tracking-tighter">{PLATFORM_CONFIGS[p].description}</p>
                    {activePlatform === p && <div className="absolute top-4 right-4 text-green-500"><i className="fas fa-link"></i></div>}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 bg-gray-950/50 p-12 rounded-[3rem] border border-gray-800/60 backdrop-blur-md space-y-10">
                  <div className="flex items-center justify-between border-b border-gray-800 pb-8">
                    <h3 className="text-[12px] font-black text-blue-400 uppercase tracking-[0.3em] flex items-center gap-4">
                      <i className="fas fa-terminal text-xl"></i> ENGINE CREDENTIAL NODE
                    </h3>
                  </div>

                  <div className="space-y-8">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-3">
                          <i className="fas fa-shield-alt"></i> API AUTHORITY KEY
                        </label>
                        {currentConfig.status === 'INVALID' && (
                          <span className="text-[9px] font-black text-red-500 uppercase flex items-center gap-1">
                            <i className="fas fa-times-circle"></i> Invalid Format
                          </span>
                        )}
                      </div>
                      <div className="relative group">
                        <input 
                          type="password"
                          value={currentConfig.apiKey}
                          onChange={(e) => handleApiKeyChange(e.target.value)}
                          placeholder={`Enter ${selectedPlatform} API Key`}
                          className={`w-full bg-gray-900/80 border-2 rounded-3xl pl-12 pr-6 py-6 text-sm font-bold text-white outline-none transition-all placeholder:text-gray-700 ${currentConfig.status === 'INVALID' ? 'border-red-500/50 focus:border-red-500' : 'border-gray-800 focus:border-blue-600'}`}
                        />
                        <i className="fas fa-key absolute left-5 top-1/2 -translate-y-1/2 text-gray-700 group-focus-within:text-blue-500"></i>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4">
                      <button 
                        onClick={handleTestConnection}
                        disabled={currentConfig.status === 'INVALID' || currentConfig.status === 'UNSET' || currentConfig.status === 'TESTING'}
                        className="flex-1 py-5 bg-gray-800 border-2 border-gray-700 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:border-blue-500 hover:text-blue-400 transition-all disabled:opacity-20 disabled:grayscale text-white"
                      >
                        {currentConfig.status === 'TESTING' ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-bolt mr-2 text-blue-400"></i>}
                        Measure Engine Response
                      </button>
                      <button 
                        onClick={handleActivatePlatform}
                        disabled={currentConfig.status !== 'HEALTHY'}
                        className="flex-1 py-5 bg-blue-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 disabled:grayscale"
                      >
                        <i className="fas fa-power-off mr-2"></i> Authorize Engine
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-10 border-t border-gray-800">
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Inference Model</h4>
                      <select 
                        value={currentConfig.modelName}
                        onChange={(e) => setConfigs(prev => ({ ...prev, [selectedPlatform]: { ...prev[selectedPlatform], modelName: e.target.value } }))}
                        className="w-full bg-gray-900 border-2 border-gray-800 rounded-2xl px-6 py-4 text-xs font-black text-gray-400 outline-none focus:border-blue-500 appearance-none cursor-pointer"
                      >
                        {PLATFORM_CONFIGS[selectedPlatform].models.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Creativity (Temp)</h4>
                      <div className="flex items-center gap-6">
                        <input 
                          type="range" min="0" max="2" step="0.1"
                          value={currentConfig.optionalParams.temperature}
                          onChange={(e) => setConfigs(prev => ({ ...prev, [selectedPlatform]: { ...prev[selectedPlatform], optionalParams: { ...prev[selectedPlatform].optionalParams, temperature: parseFloat(e.target.value) } } }))}
                          className="flex-1 h-1.5 bg-gray-800 rounded-full appearance-none accent-blue-600"
                        />
                        <span className="text-[11px] font-black text-blue-500 w-8">{currentConfig.optionalParams.temperature.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-8">
                  <div className="bg-gray-900/50 p-10 rounded-[3rem] border border-gray-800 space-y-8 flex flex-col h-full">
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Node 7: Status Manager</h3>
                    <div className="space-y-4 flex-1">
                      <div className="flex justify-between items-center py-4 px-6 bg-gray-950 rounded-2xl border border-gray-800">
                        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">System Health</span>
                        <span className={`text-[9px] font-black uppercase ${currentConfig.status === 'HEALTHY' ? 'text-green-500' : currentConfig.status === 'INVALID' || currentConfig.status === 'FAILED' ? 'text-red-500' : 'text-orange-500'}`}>
                           {currentConfig.status === 'UNSET' ? 'Dormant' : currentConfig.status === 'SAVED_UNTESTED' ? 'Ready' : currentConfig.status === 'HEALTHY' ? 'Healthy' : currentConfig.status}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-4 px-6 bg-gray-950 rounded-2xl border border-gray-800">
                        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Engine Latency</span>
                        <span className={`text-[9px] font-black uppercase ${currentConfig.latency && currentConfig.latency < 500 ? 'text-blue-400' : 'text-orange-400'}`}>
                          {currentConfig.latency ? `${currentConfig.latency}ms` : 'N/A'}
                        </span>
                      </div>
                      
                      <div className="mt-6 p-6 bg-gray-950/80 rounded-2xl border border-gray-800/50 flex-1 min-h-[150px]">
                        <h4 className="text-[8px] font-black text-gray-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                           <i className="fas fa-list-ul"></i> Authority Log
                        </h4>
                        <div className="text-[10px] font-bold text-gray-500 uppercase leading-relaxed font-mono">
                          {currentConfig.message ? (
                            <div className="flex gap-2">
                              <span className="text-gray-700">[{new Date().toLocaleTimeString()}]</span>
                              <span className={currentConfig.status === 'FAILED' ? 'text-red-900' : 'text-blue-900'}>
                                {currentConfig.message}
                              </span>
                            </div>
                          ) : (
                            <span className="italic">No events recorded. Waiting for handshake...</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
          </section>
        )}

        {activeTab === 'config' && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 no-print">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-8 space-y-10">
                <div className="bg-gray-950/50 p-10 rounded-[3rem] border border-gray-800/60 space-y-10">
                  <div className="space-y-4">
                    <h3 className="text-[11px] font-black text-gray-600 uppercase tracking-widest">Production Title</h3>
                    <input 
                      type="text" value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)}
                      placeholder={SMART_DEFAULT_TITLE}
                      className="w-full bg-gray-900/50 border-2 border-gray-800 rounded-3xl px-8 py-6 text-sm font-bold text-white outline-none focus:border-blue-600 transition-all"
                    />
                  </div>
                  <div className="flex items-center justify-between p-8 bg-blue-600/5 rounded-3xl border border-blue-500/10">
                    <div className="flex items-center gap-6">
                      <div className="w-12 h-12 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-400">
                        <i className="fas fa-globe-asia text-xl"></i>
                      </div>
                      <div>
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-white">Bangladeshi Village Mode</h4>
                        <p className="text-[9px] font-bold text-gray-500 uppercase mt-1">Mud huts, rickshaws, lungis, Bengali script</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsLocalized(!isLocalized)}
                      className={`w-14 h-8 rounded-full transition-all flex items-center px-1 ${isLocalized ? 'bg-blue-600' : 'bg-gray-800'}`}
                    >
                      <div className={`w-6 h-6 rounded-full bg-white transition-all ${isLocalized ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>

                <div className="bg-gray-950/50 p-10 rounded-[3rem] border border-gray-800/60 space-y-8">
                  <div className="flex items-center justify-between border-b border-gray-800/50 pb-6">
                    <h3 className="text-[11px] font-black text-gray-600 uppercase tracking-widest flex items-center gap-3">
                      <i className="fas fa-video text-blue-500"></i> Camera Grammar Node
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-3">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Shot Type</label>
                      <select 
                        value={cameraGrammar.shotType}
                        onChange={(e) => setCameraGrammar(prev => ({ ...prev, shotType: e.target.value }))}
                        className="w-full bg-gray-900 border-2 border-gray-800 rounded-2xl px-6 py-4 text-xs font-black text-gray-400 outline-none focus:border-blue-500 appearance-none cursor-pointer"
                      >
                        {SHOT_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Camera Motion</label>
                      <select 
                        value={cameraGrammar.movement}
                        onChange={(e) => setCameraGrammar(prev => ({ ...prev, movement: e.target.value }))}
                        className="w-full bg-gray-900 border-2 border-gray-800 rounded-2xl px-6 py-4 text-xs font-black text-gray-400 outline-none focus:border-blue-500 appearance-none cursor-pointer"
                      >
                        {CAMERA_MOVEMENTS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Angle</label>
                      <select 
                        value={cameraGrammar.angle}
                        onChange={(e) => setCameraGrammar(prev => ({ ...prev, angle: e.target.value }))}
                        className="w-full bg-gray-900 border-2 border-gray-800 rounded-2xl px-6 py-4 text-xs font-black text-gray-400 outline-none focus:border-blue-500 appearance-none cursor-pointer"
                      >
                        {CAMERA_ANGLES.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="p-6 bg-blue-600/5 rounded-2xl border border-blue-500/10">
                    <p className="text-[9px] font-bold text-gray-500 uppercase leading-relaxed italic">
                      Rule Enforcement Active: Tracking limited to movement. Zoom limited to impact/emotion beats. 2D multiplane behavior enforced.
                    </p>
                  </div>
                </div>

                <div className="bg-gray-950/50 p-10 rounded-[3rem] border border-gray-800/60 space-y-8">
                  <h3 className="text-[11px] font-black text-gray-600 uppercase tracking-widest">Cast Protocol</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {characters.map(c => (
                      <div key={c.id} className="p-6 bg-gray-900 border border-gray-800 rounded-3xl relative group">
                        <div className="pr-12">
                          <input 
                            type="text" value={c.name} 
                            onChange={(e) => setCharacters(prev => prev.map(ch => ch.id === c.id ? { ...ch, name: e.target.value } : ch))}
                            className="bg-transparent text-sm font-black text-white w-full outline-none mb-2 border-b border-transparent group-focus-within:border-blue-500 transition-all"
                          />
                          <input 
                            type="text" value={c.role} 
                            onChange={(e) => setCharacters(prev => prev.map(ch => ch.id === c.id ? { ...ch, role: e.target.value } : ch))}
                            className="bg-transparent text-[10px] font-black text-gray-500 uppercase tracking-widest w-full outline-none"
                          />
                          <div className="mt-4 border-t border-gray-800/50 pt-3">
                            <label className="text-[8px] font-black text-gray-700 uppercase tracking-widest mb-1 block">Character Traits</label>
                            <input 
                              type="text" value={c.traits} 
                              placeholder="Describe personality..."
                              onChange={(e) => setCharacters(prev => prev.map(ch => ch.id === c.id ? { ...ch, traits: e.target.value } : ch))}
                              className="bg-transparent text-[10px] font-bold text-blue-400/80 w-full outline-none placeholder:text-gray-700"
                            />
                          </div>
                        </div>
                        <div className="absolute right-6 top-6 w-5 h-5 rounded-full" style={{ backgroundColor: c.color }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 space-y-8">
                <div className="bg-gray-950/50 p-10 rounded-[3rem] border border-gray-800/60 space-y-10">
                  <h3 className="text-[11px] font-black text-gray-600 uppercase tracking-widest">Pipeline Logic</h3>
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <label className="text-[10px] font-black text-gray-500 uppercase">Scene Count</label>
                        <span className="text-xs font-black text-blue-500">{sceneCount}</span>
                      </div>
                      <input type="range" min="1" max="15" value={sceneCount} onChange={(e) => setSceneCount(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-800 rounded-full appearance-none accent-blue-600" />
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <label className="text-[10px] font-black text-gray-500 uppercase">Sec/Scene</label>
                        <span className="text-xs font-black text-blue-500">{sceneDuration}s</span>
                      </div>
                      <input type="range" min="1" max="20" value={sceneDuration} onChange={(e) => setSceneDuration(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-800 rounded-full appearance-none accent-blue-600" />
                    </div>
                  </div>
                  <button 
                    onClick={handleGenerate}
                    disabled={isGenerating || !activePlatform}
                    className="w-full py-7 bg-blue-600 text-white rounded-[2rem] text-xs font-black uppercase tracking-[0.3em] shadow-2xl hover:scale-[1.03] active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-20 disabled:grayscale"
                  >
                    {isGenerating ? <i className="fas fa-cog fa-spin"></i> : <i className="fas fa-wand-magic-sparkles"></i>}
                    Execute Generation
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'results' && (
          <section className="space-y-10">
            {isGenerating && (
              <div className="bg-blue-600/5 border border-blue-500/10 p-24 rounded-[4rem] text-center backdrop-blur-sm animate-pulse">
                <div className="w-24 h-24 border-4 border-t-blue-500 border-blue-500/10 rounded-full animate-spin mx-auto mb-10 shadow-2xl shadow-blue-500/20"></div>
                <h3 className="text-3xl font-black uppercase italic tracking-tighter mb-4 text-white">ASSEMBLING NODE {progress.current + 1} OF {progress.total}</h3>
                <p className="text-[12px] font-black uppercase tracking-[0.4em] text-blue-500 animate-bounce">{statusMessage}</p>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-6">Please do not refresh. Pipeline is auto-recovering from bottlenecks.</p>
              </div>
            )}

            {!isGenerating && results.length > 0 && (
              <div className="space-y-12 animate-in fade-in duration-700">
                <div className="flex flex-col md:flex-row justify-between items-center gap-8 bg-gray-900/80 p-10 rounded-[3rem] border border-gray-800 shadow-2xl no-print sticky top-[100px] z-40 backdrop-blur-xl">
                  <div className="flex-1 space-y-4 w-full md:w-auto">
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white">{videoTitle || SMART_DEFAULT_TITLE}</h3>
                    <div className="flex flex-wrap gap-4 items-center">
                      <div className="relative w-full md:w-64">
                        <input 
                          type="text" placeholder="Search prompts..." value={filterText} onChange={(e) => setFilterText(e.target.value)}
                          className="w-full bg-gray-950 border border-gray-800 rounded-2xl pl-10 pr-4 py-3 text-xs font-bold outline-none focus:border-blue-500 transition-all text-white"
                        />
                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-700"></i>
                      </div>
                      <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{selectedScenes.size} Selected</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 justify-center items-center">
                    <div className="flex gap-2 mr-4 border-r border-gray-800 pr-6">
                      <button onClick={() => setSelectedScenes(new Set(filteredResults.map(r => r.sceneNumber)))} className="text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-all">Select All</button>
                      <button onClick={() => setSelectedScenes(new Set())} className="text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-all">Clear</button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => exportData('JSON')} className="px-6 py-3 bg-gray-800 border border-gray-700 rounded-xl text-[10px] font-black uppercase hover:border-blue-600 transition-all text-white">JSON</button>
                        <button onClick={() => exportData('TXT')} className="px-6 py-3 bg-gray-800 border border-gray-700 rounded-xl text-[10px] font-black uppercase hover:border-blue-600 transition-all text-white">TXT</button>
                        <button onClick={() => exportData('CSV')} className="px-6 py-3 bg-gray-800 border border-gray-700 rounded-xl text-[10px] font-black uppercase hover:border-blue-600 transition-all text-white">CSV</button>
                        <button onClick={() => window.print()} className="px-6 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase shadow-xl hover:scale-105 transition-transform">PDF REPORT</button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-12">
                  {filteredResults.map((s) => (
                    <div key={s.sceneNumber} className={`scene-card group bg-gray-900/40 border-2 rounded-[3.5rem] overflow-hidden transition-all ${selectedScenes.has(s.sceneNumber) ? 'border-blue-600 shadow-2xl shadow-blue-500/10' : 'border-gray-800/80 hover:border-gray-700'}`}>
                      <div className="px-12 py-8 bg-gray-950/80 border-b border-gray-800 flex justify-between items-center">
                        <div className="flex items-center gap-8">
                          <button onClick={() => {
                            const next = new Set(selectedScenes);
                            if (next.has(s.sceneNumber)) next.delete(s.sceneNumber); else next.add(s.sceneNumber);
                            setSelectedScenes(next);
                          }} className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${selectedScenes.has(s.sceneNumber) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-900 border-gray-800 text-transparent'}`}>
                            <i className="fas fa-check text-xs"></i>
                          </button>
                          <span className="text-blue-500 font-black text-3xl font-mono tracking-tighter">NODE_{String(s.sceneNumber).padStart(3, '0')}</span>
                          <span className="px-5 py-2 bg-blue-500/10 text-blue-500 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-500/20">{s.metadata.tone}</span>
                          <span className="text-gray-500 text-[10px] font-black uppercase tracking-widest">{s.metadata.duration}s</span>
                        </div>
                        <button onClick={() => copyIndividualScene(s)} className="p-4 bg-gray-900 border border-gray-800 rounded-2xl text-gray-500 hover:text-blue-400 hover:border-blue-500 transition-all flex items-center gap-3 text-[10px] font-black uppercase text-white">
                          <i className="fas fa-copy"></i> Copy Master
                        </button>
                      </div>
                      <div className="p-12 grid grid-cols-1 lg:grid-cols-12 gap-12">
                        <div className="lg:col-span-7 space-y-12">
                           <div className="space-y-5">
                              <h4 className="text-[11px] font-black text-gray-600 uppercase tracking-[0.2em] flex items-center gap-3"><i className="fas fa-align-left text-blue-500"></i> ASSEMBLED SCRIPT</h4>
                              <p className="text-xl font-bold text-gray-100 leading-relaxed bg-gray-950/50 p-10 rounded-3xl border border-gray-800/60 italic ring-1 ring-white/5 shadow-inner">{s.setup}</p>
                           </div>
                           <div className="space-y-5">
                              <h4 className="text-[11px] font-black text-gray-600 uppercase tracking-[0.2em] flex items-center gap-3"><i className="fas fa-stopwatch text-blue-500"></i> ACTION TIMELINE</h4>
                              <div className="space-y-4">
                                {s.actionBeats.map((beat, bidx) => (
                                  <div key={bidx} className="flex gap-8 items-start bg-gray-950/30 p-6 rounded-2xl border border-gray-800/40">
                                    <span className="text-[11px] font-mono font-black text-blue-500 w-20 pt-1 shrink-0">[{beat.timeRange}]</span>
                                    <p className="text-sm font-medium text-gray-300 leading-relaxed">{beat.action}</p>
                                  </div>
                                ))}
                              </div>
                           </div>
                        </div>
                        <div className="lg:col-span-5 space-y-8 bg-gray-950/40 p-10 rounded-[3rem] border border-gray-800/50 self-start">
                          <div className="grid grid-cols-2 gap-10">
                            <div className="space-y-2">
                              <h5 className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Camera Shot</h5>
                              <p className="text-xs font-black text-blue-400 uppercase tracking-wider">{s.camera.shotType}</p>
                            </div>
                            <div className="space-y-2">
                              <h5 className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Angle</h5>
                              <p className="text-xs font-black text-blue-400 uppercase tracking-wider">{s.camera.angle}</p>
                            </div>
                            <div className="space-y-2">
                              <h5 className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Physics Mode</h5>
                              <p className="text-xs font-black text-purple-400 uppercase tracking-wider">{s.physics.squashStretch}</p>
                            </div>
                            <div className="space-y-2">
                              <h5 className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Elasticity</h5>
                              <p className="text-xs font-black text-purple-400 uppercase tracking-wider">{s.physics.elasticity}</p>
                            </div>
                          </div>
                          <div className="pt-8 border-t border-gray-800/50 space-y-4">
                            <h5 className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Environment Art Node</h5>
                            <p className="text-xs font-bold text-gray-400 leading-relaxed bg-gray-900/50 p-5 rounded-2xl italic border border-white/5">{s.background}</p>
                          </div>
                          <div className="pt-8 border-t border-gray-800/50 space-y-4">
                            <h5 className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Sync Node (Text/Audio)</h5>
                            <p className="text-xs font-black text-indigo-400 leading-relaxed bg-indigo-500/5 p-5 rounded-2xl border border-indigo-500/10 italic">"{s.textAudioSync}"</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="mt-32 py-16 border-t border-gray-800/30 text-center no-print">
        <p className="text-[10px] font-black uppercase tracking-[1em] text-gray-700">Vexa Toon • Multi-Scene Prompt Architect V5.0</p>
      </footer>
    </div>
  );
};

export default App;