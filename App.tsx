
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Character, 
  DEFAULT_CHARACTERS, 
  EMOTION_OPTIONS, 
  ScenePrompt, 
  PlatformType, 
  PLATFORM_CONFIGS, 
  ApiConfig, 
  GenerationState,
  OptionalParams
} from './types';
import { generateScenePrompts, testConnection } from './services/geminiService';

const SMART_DEFAULT_TITLE = "Tom and Jerry Get Into Trouble in a Bangladeshi Village";
const DEFAULT_EMOTIONS_CYCLE = ["Playful", "Suspenseful", "Excited", "Curious"];

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
  // --- PROJECT STATE ---
  const [videoTitle, setVideoTitle] = useState("");
  const [isLocalized, setIsLocalized] = useState(false);
  const [sceneCount, setSceneCount] = useState(5); 
  const [sceneDuration, setSceneDuration] = useState(8);
  const [characters, setCharacters] = useState<Character[]>(DEFAULT_CHARACTERS);
  const [emotions, setEmotions] = useState<string[]>([]);

  // --- API CONFIG STATE ---
  const [platformType, setPlatformType] = useState<PlatformType>('Gemini');
  const [configs, setConfigs] = useState<Record<PlatformType, ApiConfig>>({
    Gemini: {
      apiKey: '',
      platformType: 'Gemini',
      modelName: PLATFORM_CONFIGS.Gemini.models[0],
      optionalParams: { ...DEFAULT_PARAMS }
    },
    OpenAI: {
      apiKey: '',
      platformType: 'OpenAI',
      modelName: PLATFORM_CONFIGS.OpenAI.models[0],
      optionalParams: { ...DEFAULT_PARAMS }
    },
    DeepSeek: {
      apiKey: '',
      platformType: 'DeepSeek',
      modelName: PLATFORM_CONFIGS.DeepSeek.models[0],
      optionalParams: { ...DEFAULT_PARAMS }
    }
  });

  // Security/Auth State
  const [hasKey, setHasKey] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [handshakeData, setHandshakeData] = useState<{ success: boolean; latency: number; message: string } | null>(null);
  const [isTestingHandshake, setIsTestingHandshake] = useState(false);
  
  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [statusMessage, setStatusMessage] = useState("");
  const [results, setResults] = useState<ScenePrompt[]>([]);
  const [activeTab, setActiveTab] = useState<'api' | 'config' | 'results'>('api');
  const [filterSearch, setFilterSearch] = useState("");
  const [filterEmotion, setFilterEmotion] = useState("All");
  const [selectedScenes, setSelectedScenes] = useState<Set<number>>(new Set());

  const currentConfig = configs[platformType];
  const isKeyValid = currentConfig.apiKey.length > 20 || platformType === 'Gemini';

  // Sync key status on mount
  useEffect(() => {
    const checkKeyStatus = async () => {
      try {
        const ok = await (window as any).aistudio.hasSelectedApiKey();
        setHasKey(ok);
      } catch (e) {
        console.error("Auth check failed", e);
      }
    };
    checkKeyStatus();
  }, []);

  const runHandshake = async () => {
    if (platformType === 'Gemini' && !hasKey) {
      setIsApiKeyModalOpen(true);
      return;
    }
    
    setIsTestingHandshake(true);
    setHandshakeData(null);
    try {
      const result = await testConnection(currentConfig.apiKey);
      setHandshakeData(result);
      if (result.success) {
        setStatusMessage("Handshake Successful");
        setTimeout(() => setStatusMessage(""), 3000);
      }
    } catch (e) {
      setHandshakeData({ success: false, latency: 0, message: "Handshake failed. Protocol rejected." });
    } finally {
      setIsTestingHandshake(false);
    }
  };

  const handleSaveConfig = () => {
    if (!isKeyValid) return;
    setStatusMessage(`Authority Saved for ${platformType}`);
    setTimeout(() => setStatusMessage(""), 3000);
  };

  const updateCurrentConfig = (updates: Partial<ApiConfig>) => {
    setConfigs(prev => ({
      ...prev,
      [platformType]: { ...prev[platformType], ...updates }
    }));
  };

  const updateCurrentParams = (updates: Partial<OptionalParams>) => {
    setConfigs(prev => ({
      ...prev,
      [platformType]: { 
        ...prev[platformType], 
        optionalParams: { ...prev[platformType].optionalParams, ...updates }
      }
    }));
  };

  const handleOpenKeyPicker = async () => {
    try {
      await (window as any).aistudio.openSelectKey();
      setHasKey(true);
      setIsApiKeyModalOpen(false);
      runHandshake();
    } catch (e) {
      console.error("Key picker failed", e);
    }
  };

  const filteredResults = useMemo(() => {
    return results.filter(scene => {
      const matchesSearch = filterSearch.trim() === "" || scene.setup.toLowerCase().includes(filterSearch.toLowerCase());
      const matchesEmotion = filterEmotion === "All" || scene.metadata.tone === filterEmotion;
      return matchesSearch && matchesEmotion;
    });
  }, [results, filterSearch, filterEmotion]);

  // Handle auto-selection of filtered results when they first appear
  useEffect(() => {
    if (results.length > 0 && selectedScenes.size === 0) {
      setSelectedScenes(new Set(results.map(r => r.sceneNumber)));
    }
  }, [results]);

  const toggleSceneSelection = (sceneNumber: number) => {
    setSelectedScenes(prev => {
      const next = new Set(prev);
      if (next.has(sceneNumber)) next.delete(sceneNumber);
      else next.add(sceneNumber);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedScenes(new Set(filteredResults.map(r => r.sceneNumber)));
  };

  const deselectAll = () => {
    setSelectedScenes(new Set());
  };

  const handleGenerate = async () => {
    if (platformType === 'Gemini' && !hasKey) {
      setIsApiKeyModalOpen(true);
      return;
    }
    if (platformType !== 'Gemini' && !currentConfig.apiKey) {
      setActiveTab('api');
      return;
    }

    setIsGenerating(true);
    setResults([]);
    setSelectedScenes(new Set());
    setActiveTab('results');
    setStatusMessage("Synchronizing Master Nodes...");

    try {
      const state: GenerationState = {
        videoTitle: videoTitle || SMART_DEFAULT_TITLE,
        isLocalized,
        emotions,
        characters,
        sceneCount,
        sceneDuration,
        apiConfigs: configs,
        currentPlatform: platformType,
        apiKey: currentConfig.apiKey, 
        modelName: currentConfig.modelName,
        optionalParams: currentConfig.optionalParams
      };

      const prompts = await generateScenePrompts(state, (current, total, message) => {
        setProgress({ current, total });
        if (message) setStatusMessage(message);
      });
      setResults(prompts);
    } catch (error: any) {
      console.error("Generation failed:", error);
      if (error?.message?.includes("Requested entity was not found")) {
        setHasKey(false);
        setIsApiKeyModalOpen(true);
      } else {
        alert("Pipeline disruption detected: " + error.message);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadFile = (content: string, fileName: string, contentType: string) => {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
  };

  const formatMasterPrompt = (s: ScenePrompt): string => {
    const charSummary = characters.map(c => `${c.name}: ${c.role} (${c.color}, ${c.outline}px outline)`).join(', ');
    const actionAssembled = s.actionBeats.map(b => `${b.timeRange} ${b.action}`).join('; ');
    const beatsTimeline = s.actionBeats.map(b => `${b.timeRange}\n${b.action}`).join('\n');

    return `SCENE ${s.sceneNumber}: 
Metadata: Duration ${s.metadata.duration}s, Tone ${s.metadata.tone}, Localization ${s.metadata.localization}. 
Style: 1940s 2D hand-drawn, 4-5px outlines, watercolor BG. 
Camera: ${s.camera.shotType}, ${s.camera.movement}, ${s.camera.angle}. 
Action: ${actionAssembled}. 
Spatial: ${s.spatialRules}. 
Physics: ${s.physics.squashStretch}, ${s.physics.elasticity}, ${s.physics.impactHold}. 
Sync: ${s.textAudioSync}. 
Mood: ${s.mood}. 
Negative: ${s.avoidRules}. 
Camera Shot: ${s.camera.shotType}, Camera Angle: ${s.camera.angle}, Physics Mode: ${s.physics.squashStretch}, Elasticity: ${s.physics.elasticity}, Cast & Depth Protocol: ${charSummary}, Environment Art Node: ${s.background}, Sync Node (Text/Audio): ${s.textAudioSync}, Action Beats Timeline: \n${beatsTimeline}`;
  };

  const exportJSON = () => {
    const scenesToExport = results.filter(s => selectedScenes.has(s.sceneNumber));
    const formattedData = scenesToExport.map(s => ({
      ...s,
      masterPrompt: formatMasterPrompt(s)
    }));
    const content = JSON.stringify(formattedData, null, 2);
    downloadFile(content, `${videoTitle.replace(/\s+/g, '_') || 'Vexa'}_Export.json`, "application/json");
  };

  const exportTXT = () => {
    const scenesToExport = results.filter(s => selectedScenes.has(s.sceneNumber));
    const content = scenesToExport.map(s => formatMasterPrompt(s)).join('\n\n' + '='.repeat(50) + '\n\n');
    downloadFile(content, `${videoTitle.replace(/\s+/g, '_') || 'Vexa'}_Export.txt`, "text/plain");
  };

  const exportCSV = () => {
    const scenesToExport = results.filter(s => selectedScenes.has(s.sceneNumber));
    const header = ["Scene Number", "Tone", "Duration", "Assembled Script", "Camera", "Physics", "Background", "Sync"].join(',');
    const rows = scenesToExport.map(s => [
      s.sceneNumber,
      `"${s.metadata.tone}"`,
      `"${s.metadata.duration}s"`,
      `"${s.setup.replace(/"/g, '""')}"`,
      `"${s.camera.shotType} - ${s.camera.angle}"`,
      `"${s.physics.squashStretch}"`,
      `"${s.background.replace(/"/g, '""')}"`,
      `"${s.textAudioSync.replace(/"/g, '""')}"`
    ].join(','));
    const content = [header, ...rows].join('\n');
    downloadFile(content, `${videoTitle.replace(/\s+/g, '_') || 'Vexa'}_Export.csv`, "text/csv");
  };

  const copyIndividualScene = (scene: ScenePrompt) => {
    const text = formatMasterPrompt(scene);
    navigator.clipboard.writeText(text);
    setStatusMessage(`Node ${scene.sceneNumber} Detailed Data Copied`);
    setTimeout(() => setStatusMessage(""), 2000);
  };

  useEffect(() => {
    setEmotions(prev => {
      const newEmos = [...prev];
      if (newEmos.length < sceneCount) {
        for (let i = newEmos.length; i < sceneCount; i++) {
          newEmos.push(DEFAULT_EMOTIONS_CYCLE[i % DEFAULT_EMOTIONS_CYCLE.length]);
        }
      } else if (newEmos.length > sceneCount) {
        return newEmos.slice(0, sceneCount);
      }
      return newEmos;
    });
  }, [sceneCount]);

  return (
    <div className="min-h-screen bg-[#0a0b10] text-gray-100 font-sans selection:bg-blue-500/30 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0b10]/80 backdrop-blur-xl border-b border-gray-800/50 px-6 py-4 no-print">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <i className="fas fa-cubes text-white text-2xl"></i>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter uppercase italic leading-none text-white">Vexa Toon</h1>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500 mt-1">Professional Animation Suite</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {statusMessage && <span className="text-[9px] font-black uppercase text-blue-400 bg-blue-400/10 px-3 py-1 rounded-full animate-pulse">{statusMessage}</span>}
            <button 
              onClick={() => setIsApiKeyModalOpen(true)} 
              className={`px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 border ${hasKey ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'}`}
            >
              <i className={`fas ${hasKey ? 'fa-shield-check' : 'fa-plug'}`}></i> {hasKey ? 'ENGINE CONNECTED' : 'AUTHORIZE ENGINE'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <nav className="flex border-b border-gray-800 mb-10 overflow-x-auto no-scrollbar no-print">
          {(['api', 'config', 'results'] as const).map(t => (
            <button 
              key={t} 
              onClick={() => setActiveTab(t)} 
              className={`px-8 py-4 text-[11px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === t ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              {t === 'api' ? 'Platform Node' : t === 'config' ? 'Project Node' : 'Results Node'}
            </button>
          ))}
        </nav>

        {activeTab === 'api' && (
          <section className="space-y-10 no-print animate-in fade-in duration-500">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(Object.keys(PLATFORM_CONFIGS) as PlatformType[]).map((p) => (
                  <button 
                    key={p} 
                    onClick={() => setPlatformType(p)} 
                    className={`p-8 rounded-[2rem] border-2 transition-all flex flex-col items-center group relative overflow-hidden ${platformType === p ? 'border-blue-500 bg-blue-500/10 shadow-2xl shadow-blue-500/20' : 'border-gray-800 bg-gray-950/40 hover:border-gray-700'}`}
                  >
                    {platformType === p && <div className="absolute top-0 right-0 p-4"><i className="fas fa-check-circle text-blue-500 text-lg"></i></div>}
                    <i className={`fab ${PLATFORM_CONFIGS[p].icon} text-5xl mb-4 transition-transform group-hover:scale-110 ${platformType === p ? 'text-blue-400' : 'text-gray-600'}`}></i>
                    <span className="text-[12px] font-black uppercase block tracking-widest mb-1">{PLATFORM_CONFIGS[p].label}</span>
                    <span className="text-[8px] font-bold text-gray-500 uppercase text-center leading-tight px-4">{PLATFORM_CONFIGS[p].description}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 bg-gray-950/50 p-10 rounded-[2.5rem] border border-gray-800 space-y-10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-3">
                      <i className="fas fa-terminal"></i> ENGINE AUTHORITY CONSOLE
                    </h3>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <i className="fas fa-key"></i> AUTHORITY CREDENTIALS
                      </h4>
                      {platformType === 'Gemini' && (
                        <span className="text-[8px] font-black text-blue-400 bg-blue-400/10 px-3 py-1 rounded-full border border-blue-400/20">ENVIRONMENTAL AUTHORITY</span>
                      )}
                    </div>

                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="relative flex-1 group">
                        <i className="fas fa-shield-alt absolute left-5 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-blue-500 transition-colors"></i>
                        <input 
                          type="password"
                          value={platformType === 'Gemini' ? '••••••••••••••••' : currentConfig.apiKey}
                          disabled={platformType === 'Gemini'}
                          onChange={(e) => updateCurrentConfig({ apiKey: e.target.value })}
                          placeholder="Enter API Key"
                          className="w-full bg-gray-900 border border-gray-800 rounded-2xl pl-12 pr-6 py-5 text-xs font-bold text-gray-300 outline-none focus:border-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-gray-700"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={runHandshake}
                          disabled={isTestingHandshake || !isKeyValid}
                          className="px-8 py-5 bg-gray-800 border border-gray-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-blue-500 hover:text-blue-400 transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2"
                        >
                          {isTestingHandshake ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-vial"></i>}
                          TEST HANDSHAKE
                        </button>
                        <button 
                          onClick={handleSaveConfig}
                          disabled={platformType === 'Gemini' || !isKeyValid}
                          className="px-8 py-5 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2"
                        >
                          <i className="fas fa-save"></i>
                          SAVE AUTHORITY
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-6 border-t border-gray-800/50">
                    <div className="space-y-4">
                      <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <i className="fas fa-microchip"></i> SELECTED MODEL
                      </h3>
                      <div className="relative">
                        <select 
                          value={currentConfig.modelName} 
                          onChange={(e) => updateCurrentConfig({ modelName: e.target.value })} 
                          className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-6 py-4 text-xs font-bold text-gray-300 outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
                        >
                          {PLATFORM_CONFIGS[platformType].models.map(m => (<option key={m} value={m}>{m}</option>))}
                        </select>
                        <i className="fas fa-chevron-down absolute right-6 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none"></i>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <i className="fas fa-lock"></i> SAFETY PROTOCOL
                      </h3>
                      <select 
                        value={currentConfig.optionalParams.safetyThreshold} 
                        onChange={(e) => updateCurrentParams({ safetyThreshold: e.target.value })} 
                        className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-6 py-4 text-xs font-bold text-gray-300 outline-none focus:border-blue-500 transition-colors cursor-pointer appearance-none"
                      >
                        <option value="BLOCK_NONE">Block None</option>
                        <option value="BLOCK_LOW_AND_ABOVE">Block Low+</option>
                        <option value="BLOCK_MEDIUM_AND_ABOVE">Block Medium+</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                  <div className="bg-gray-900/50 border border-gray-800 rounded-[2.5rem] p-8 space-y-8">
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-info-circle"></i> ENGINE INTEGRITY
                    </h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center px-4 py-3 bg-gray-950 rounded-2xl border border-gray-800">
                        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Auth Status</span>
                        <span className={`text-[9px] font-black uppercase ${isKeyValid || hasKey ? 'text-green-500' : 'text-red-500'}`}>
                          {isKeyValid || hasKey ? 'VALIDATED' : 'VOID'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center px-4 py-3 bg-gray-950 rounded-2xl border border-gray-800">
                        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Engine Latency</span>
                        <span className="text-[9px] font-black uppercase text-blue-400">{handshakeData?.latency || '--'} ms</span>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => setActiveTab('config')} 
                    className="w-full py-6 rounded-3xl bg-blue-600 text-white font-black text-[12px] uppercase tracking-widest shadow-2xl shadow-blue-500/20 hover:scale-[1.02] transition-all active:scale-95 flex items-center justify-center gap-3"
                  >
                    CONTINUE TO PROJECT <i className="fas fa-arrow-right"></i>
                  </button>
                </div>
              </div>
          </section>
        )}

        {activeTab === 'config' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 no-print animate-in slide-in-from-bottom-4 duration-500">
            <div className="lg:col-span-8 space-y-8">
              <section className="bg-gray-900/50 border border-gray-800 rounded-3xl p-8 space-y-6">
                <h2 className="text-[12px] font-bold uppercase text-gray-400 tracking-widest flex items-center gap-2">
                  <i className="fas fa-film"></i> Production Metadata
                </h2>
                <input 
                  type="text" 
                  value={videoTitle} 
                  onChange={(e) => setVideoTitle(e.target.value)} 
                  placeholder={SMART_DEFAULT_TITLE} 
                  className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-6 py-4 outline-none text-sm font-medium focus:border-blue-500 transition-colors" 
                />
                <div className="flex items-center justify-between p-6 bg-gray-950/50 rounded-2xl border border-gray-800">
                  <div className="flex items-center gap-4">
                    <i className="fas fa-globe-asia text-blue-400 text-xl"></i>
                    <div>
                      <p className="text-[11px] font-black uppercase text-white tracking-widest">Bangladeshi Village Mode</p>
                      <p className="text-[9px] font-bold text-gray-500 uppercase italic">Injects rural setting, rickshaws, and local culture</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsLocalized(!isLocalized)} 
                    className={`relative w-14 h-7 rounded-full transition-all duration-300 ${isLocalized ? 'bg-green-600 shadow-[0_0_15px_rgba(22,163,74,0.4)]' : 'bg-gray-800'}`}
                  >
                    <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${isLocalized ? 'translate-x-7' : ''}`}></div>
                  </button>
                </div>
              </section>

              <section className="bg-gray-900/50 border border-gray-800 rounded-3xl p-8 space-y-6">
                <h2 className="text-[12px] font-bold uppercase text-gray-400 tracking-widest flex items-center gap-2">
                  <i className="fas fa-users"></i> Cast Protocol
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {characters.map((char) => (
                    <div key={char.id} className="p-5 bg-gray-950 border border-gray-800 rounded-2xl relative group transition-all hover:border-gray-600 focus-within:border-blue-500">
                      <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full border-2 border-gray-800 bg-gray-950 flex items-center justify-center text-[10px]" style={{ color: char.color }}>
                        <i className="fas fa-circle"></i>
                      </div>
                      <input 
                        type="text" 
                        value={char.name} 
                        onChange={(e) => setCharacters(prev => prev.map(c => c.id === char.id ? { ...c, name: e.target.value } : c))} 
                        className="bg-transparent border-b border-gray-800 group-focus-within:border-blue-500 w-full mb-2 font-black transition-colors outline-none" 
                      />
                      <input 
                        type="text" 
                        value={char.role} 
                        onChange={(e) => setCharacters(prev => prev.map(c => c.id === char.id ? { ...c, role: e.target.value } : c))} 
                        className="bg-transparent text-[10px] w-full text-gray-500 font-bold uppercase tracking-widest outline-none" 
                      />
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="lg:col-span-4 space-y-8">
              <section className="bg-gray-900/50 border border-gray-800 rounded-3xl p-8 space-y-8 sticky top-28">
                <h2 className="text-[12px] font-bold uppercase text-gray-400 tracking-widest flex items-center gap-2">
                  <i className="fas fa-microchip"></i> Generation Logic
                </h2>
                <div className="space-y-8">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Scene Count</label>
                      <span className="text-xs font-black text-blue-400">{sceneCount}</span>
                    </div>
                    <input type="range" min="1" max="15" value={sceneCount} onChange={(e) => setSceneCount(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-800 rounded-full appearance-none accent-purple-500 cursor-pointer" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Scene Duration (s)</label>
                      <span className="text-xs font-black text-green-400">{sceneDuration}s</span>
                    </div>
                    <input type="range" min="1" max="15" value={sceneDuration} onChange={(e) => setSceneDuration(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-800 rounded-full appearance-none accent-green-500 cursor-pointer" />
                  </div>
                </div>
                <button onClick={handleGenerate} disabled={isGenerating} className="w-full py-5 rounded-2xl font-black text-xs uppercase bg-blue-600 text-white shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                  {isGenerating ? <i className="fas fa-cog fa-spin"></i> : <i className="fas fa-play"></i>} 
                  {isGenerating ? 'PROCESSING PIPELINE' : 'EXECUTE GENERATION'}
                </button>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'results' && (
          <div className="space-y-8">
            {isGenerating && (
              <div className="bg-blue-600/5 border border-blue-500/10 p-20 rounded-[3rem] text-center no-print backdrop-blur-sm relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-blue-500/5"></div>
                <div className="relative z-10">
                  <div className="w-20 h-20 border-4 border-t-blue-500 border-blue-500/10 rounded-full animate-spin mx-auto mb-8 shadow-[0_0_20px_rgba(59,130,246,0.2)]"></div>
                  <h3 className="text-3xl font-black uppercase italic tracking-tighter mb-4 text-white">ASSEMBLING SCENE {progress.current + 1} OF {progress.total}</h3>
                  <div className={`text-[12px] font-black uppercase tracking-widest transition-all duration-500 px-10 py-3 rounded-full bg-gray-950/50 border border-white/5 inline-block text-blue-400`}>
                    {statusMessage}
                  </div>
                </div>
              </div>
            )}

            {!isGenerating && results.length > 0 && (
              <div className="space-y-8 animate-in fade-in duration-700">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-gray-900/80 border border-gray-800 p-8 rounded-[2.5rem] shadow-2xl no-print backdrop-blur-xl sticky top-[80px] z-30">
                   <div className="space-y-2 text-center md:text-left flex items-center gap-6">
                    <div className="space-y-1">
                        <h3 className="text-xl font-black uppercase italic tracking-tighter text-white">{videoTitle || SMART_DEFAULT_TITLE}</h3>
                        <div className="flex items-center justify-center md:justify-start gap-4">
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{selectedScenes.size}/{filteredResults.length} Scenes Selected</p>
                        </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 justify-center">
                    <div className="flex items-center gap-2 border-r border-gray-700 pr-4 mr-2">
                        <button onClick={selectAllFiltered} className="text-[9px] font-black uppercase text-gray-400 hover:text-white transition-colors">Select All</button>
                        <span className="text-gray-700">|</span>
                        <button onClick={deselectAll} className="text-[9px] font-black uppercase text-gray-400 hover:text-white transition-colors">Deselect</button>
                    </div>
                    
                    <div className="relative group">
                        <button className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase shadow-xl shadow-blue-500/20 hover:scale-105 transition-transform flex items-center gap-2">
                            <i className="fas fa-download"></i> MASTER EXPORT <i className="fas fa-caret-down"></i>
                        </button>
                        <div className="absolute right-0 top-full mt-2 w-48 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                            <button onClick={exportJSON} className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-colors flex items-center gap-3"><i className="fas fa-file-code"></i> JSON FORMAT</button>
                            <button onClick={exportTXT} className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-colors flex items-center gap-3"><i className="fas fa-file-alt"></i> TEXT FORMAT</button>
                            <button onClick={exportCSV} className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-colors flex items-center gap-3"><i className="fas fa-file-csv"></i> CSV FORMAT</button>
                            <button onClick={() => window.print()} className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-colors flex items-center gap-3"><i className="fas fa-file-pdf"></i> PDF REPORT</button>
                        </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-12">
                  {filteredResults.map((s) => (
                    <div key={s.sceneNumber} className={`scene-card group bg-gray-900/40 border rounded-[3rem] overflow-hidden backdrop-blur-sm transition-all relative ${selectedScenes.has(s.sceneNumber) ? 'border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.1)]' : 'border-gray-800/80 hover:border-gray-700'}`}>
                      <div className="px-10 py-6 bg-gray-950/80 border-b border-gray-800 flex justify-between items-center">
                        <div className="flex items-center gap-6">
                          <button onClick={() => toggleSceneSelection(s.sceneNumber)} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${selectedScenes.has(s.sceneNumber) ? 'bg-blue-600 border-blue-600' : 'border-gray-800 bg-gray-900 hover:border-blue-500'}`}>
                            {selectedScenes.has(s.sceneNumber) && <i className="fas fa-check text-[10px]"></i>}
                          </button>
                          <span className="text-blue-500 font-black text-2xl font-mono tracking-tighter">NODE_{String(s.sceneNumber).padStart(3, '0')}</span>
                          <span className="px-4 py-1.5 bg-yellow-500/10 text-yellow-500 rounded-full text-[10px] font-black uppercase tracking-widest border border-yellow-500/20">{s.metadata.tone}</span>
                          <span className="text-gray-500 text-[10px] font-black uppercase tracking-widest">{s.metadata.duration}s</span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => copyIndividualScene(s)} title="Copy All Scene Data" className="p-4 bg-gray-900 border border-gray-800 hover:border-blue-500 rounded-2xl text-gray-500 hover:text-blue-400 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                            <i className="fas fa-copy"></i> COPY MASTER
                            </button>
                        </div>
                      </div>
                      <div className="p-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
                        <div className="lg:col-span-7 space-y-10">
                           <div className="space-y-4">
                              <h4 className="text-[11px] font-black text-gray-600 uppercase flex items-center gap-3 tracking-[0.2em]"><i className="fas fa-align-left text-blue-500"></i> ASSEMBLED SCRIPT</h4>
                              <p className="text-lg font-bold text-gray-100 leading-relaxed bg-gray-950/50 p-8 rounded-2xl border border-gray-800 italic">{s.setup}</p>
                           </div>
                           <div className="space-y-4">
                              <h4 className="text-[11px] font-black text-gray-600 uppercase flex items-center gap-3 tracking-[0.2em]"><i className="fas fa-stopwatch text-blue-500"></i> ACTION TIMELINE</h4>
                              <div className="grid grid-cols-1 gap-4">
                                {s.actionBeats.map((beat, bidx) => (
                                  <div key={bidx} className="flex gap-6 items-start bg-gray-950/30 p-4 rounded-xl border border-gray-800/50">
                                    <span className="text-[11px] font-mono font-black text-blue-500 w-16 pt-1 shrink-0">[{beat.timeRange}]</span>
                                    <p className="text-sm font-medium text-gray-300 leading-relaxed">{beat.action}</p>
                                  </div>
                                ))}
                              </div>
                           </div>
                        </div>
                        <div className="lg:col-span-5 space-y-6 bg-gray-950/40 p-8 rounded-[2.5rem] border border-gray-800/50">
                          <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-1">
                              <h5 className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Shot Type</h5>
                              <p className="text-xs font-black text-blue-400 uppercase">{s.camera.shotType}</p>
                            </div>
                            <div className="space-y-1">
                              <h5 className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Angle</h5>
                              <p className="text-xs font-black text-blue-400 uppercase">{s.camera.angle}</p>
                            </div>
                            <div className="space-y-1">
                              <h5 className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Physics</h5>
                              <p className="text-xs font-black text-purple-400 uppercase">{s.physics.squashStretch}</p>
                            </div>
                            <div className="space-y-1">
                              <h5 className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Impact</h5>
                              <p className="text-xs font-black text-purple-400 uppercase">{s.physics.impactHold}</p>
                            </div>
                          </div>
                          <div className="pt-6 border-t border-gray-800/50 space-y-3">
                            <h5 className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Art Node (Background)</h5>
                            <p className="text-xs font-bold text-gray-400 leading-relaxed bg-gray-900/50 p-4 rounded-xl italic">{s.background}</p>
                          </div>
                          <div className="pt-6 border-t border-gray-800/50 space-y-3">
                            <h5 className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Sync Nodes</h5>
                            <p className="text-xs font-black text-yellow-600/80 leading-relaxed bg-yellow-500/5 p-4 rounded-xl border border-yellow-500/10 italic">"{s.textAudioSync}"</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Security Modal */}
      {isApiKeyModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-500 no-print">
          <div className="absolute inset-0 bg-[#0a0b10]/95 backdrop-blur-2xl" onClick={() => setIsApiKeyModalOpen(false)}></div>
          <div className="relative w-full max-w-xl bg-gray-900 border border-gray-800 rounded-[3rem] shadow-2xl p-16 animate-in zoom-in duration-300">
             <div className="w-20 h-20 bg-blue-600/10 rounded-[2rem] flex items-center justify-center mb-10 border border-blue-500/20">
               <i className="fas fa-lock text-3xl text-blue-500"></i>
             </div>
             <h3 className="text-4xl font-black text-white uppercase italic mb-6 tracking-tighter">ENGINE AUTHORITY</h3>
             <p className="text-gray-400 text-xs font-bold uppercase mb-10 leading-relaxed tracking-widest">
               Access to the Vexa Generation Node requires validated Engine Authorization. Select your project engine to proceed.
             </p>
             <button 
                onClick={handleOpenKeyPicker} 
                className="w-full py-6 rounded-2xl font-black text-xs uppercase bg-blue-600 text-white shadow-2xl shadow-blue-500/20 flex items-center justify-center gap-4 hover:scale-[1.02] transition-transform active:scale-95"
              >
                <i className="fas fa-key"></i> SELECT PROJECT ENGINE
              </button>
             <div className="mt-8 text-center">
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-[10px] font-black text-gray-600 uppercase hover:text-gray-400 underline underline-offset-8">Billing Documentation</a>
             </div>
          </div>
        </div>
      )}

      <footer className="mt-20 py-12 border-t border-gray-800/30 text-center opacity-30 no-print">
        <p className="text-[9px] font-black uppercase tracking-[1em]">Vexa Toon Architect • Multi-Scene Assembly V4.2.0</p>
      </footer>
    </div>
  );
};

export default App;
