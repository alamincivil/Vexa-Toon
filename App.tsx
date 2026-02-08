
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Character, 
  DEFAULT_CHARACTERS, 
  EMOTION_OPTIONS, 
  ScenePrompt, 
  PlatformType, 
  PLATFORM_CONFIGS, 
  ApiConfig, 
  GenerationState 
} from './types';
import { generateScenePrompts, testConnection } from './services/geminiService';

const SMART_DEFAULT_TITLE = "Tom and Jerry Get Into Trouble in a Bangladeshi Village";
const DEFAULT_EMOTIONS_CYCLE = ["Playful", "Suspenseful", "Excited", "Curious"];

const App: React.FC = () => {
  // --- NODE-BASED APP STATE ---
  const [videoTitle, setVideoTitle] = useState("");
  const [isLocalized, setIsLocalized] = useState(false);
  const [sceneCount, setSceneCount] = useState(5); 
  const [sceneDuration, setSceneDuration] = useState(8);
  const [characters, setCharacters] = useState<Character[]>(DEFAULT_CHARACTERS);
  const [emotions, setEmotions] = useState<string[]>([]);
  const [globalEmotion, setGlobalEmotion] = useState<string>(EMOTION_OPTIONS[0]);
  
  // --- PLATFORM & SECURITY NODES ---
  const [platformType, setPlatformType] = useState<PlatformType>('Gemini');
  const [selectedModel, setSelectedModel] = useState(PLATFORM_CONFIGS['Gemini'].models[0]);
  const [tempApiKey, setTempApiKey] = useState("");
  
  // Advanced Params
  const [temp, setTemp] = useState(1.0);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [topP, setTopP] = useState(0.95);
  const [topK, setTopK] = useState(40);

  // BYOAK State
  const [apiConfigs, setApiConfigs] = useState<Record<PlatformType, ApiConfig | null>>({
    Gemini: null,
    OpenAI: null,
    DeepSeek: null
  });
  
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [connectionMessage, setConnectionMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ScenePrompt[]>([]);
  const [activeTab, setActiveTab] = useState<'api' | 'config' | 'results'>('api');
  const [errors, setErrors] = useState<string[]>([]);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterEmotion, setFilterEmotion] = useState("All");

  const hasAnyKey = useMemo(() => {
    return platformType === 'Gemini' || Object.values(apiConfigs).some(config => config !== null);
  }, [apiConfigs, platformType]);

  const filteredResults = useMemo(() => {
    return results.filter(scene => {
      const matchesSearch = filterSearch.trim() === "" || scene.setup.toLowerCase().includes(filterSearch.toLowerCase());
      const matchesEmotion = filterEmotion === "All" || scene.metadata.tone === filterEmotion;
      return matchesSearch && matchesEmotion;
    });
  }, [results, filterSearch, filterEmotion]);

  const validationNode = useMemo(() => {
    const trimmedKey = tempApiKey.trim();
    return {
      isValid: platformType === 'Gemini' || (trimmedKey !== ""),
      config: {
        apiKey: trimmedKey,
        platformType,
        modelName: selectedModel,
        optionalParams: { 
          temperature: temp, 
          maxTokens, 
          topP, 
          topK,
          safetyThreshold: "BLOCK_NONE",
          endpointType: "chat",
          resolution: "1024x1024",
          responseFormat: "json"
        }
      } as ApiConfig
    };
  }, [platformType, tempApiKey, selectedModel, temp, maxTokens]);

  const terminateSession = useCallback(() => {
    if (window.confirm("Purge all API keys and session memory?")) {
      setApiConfigs({ Gemini: null, OpenAI: null, DeepSeek: null });
      setTempApiKey("");
      setResults([]);
      setTestStatus('idle');
    }
  }, []);

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setTestStatus('idle');
    const result = await testConnection(tempApiKey, platformType, selectedModel);
    setTestStatus(result.success ? 'success' : 'failed');
    setConnectionMessage(result.message);
    setIsTestingConnection(false);
  };

  const handleSaveConfig = () => {
    setApiConfigs(prev => ({ ...prev, [platformType]: validationNode.config }));
    setIsApiKeyModalOpen(false);
    setActiveTab('config');
  };

  const handleGenerate = async () => {
    if (!hasAnyKey && platformType !== 'Gemini') {
      setActiveTab('api');
      setIsApiKeyModalOpen(true);
      return;
    }

    setIsGenerating(true);
    setResults([]);
    setActiveTab('results');
    setErrors([]);

    try {
      const config = apiConfigs[platformType] || validationNode.config;
      const state: GenerationState = {
        videoTitle: videoTitle || SMART_DEFAULT_TITLE,
        isLocalized,
        emotions,
        characters,
        sceneCount,
        sceneDuration,
        apiConfigs,
        currentPlatform: platformType,
        apiKey: config.apiKey,
        modelName: config.modelName,
        optionalParams: config.optionalParams
      };

      const prompts = await generateScenePrompts(state, (current, total) => {
        setProgress({ current, total });
      });
      setResults(prompts);
    } catch (error: any) {
      setErrors(["Generation failed. Node protocol interrupted."]);
      setActiveTab('config');
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

  // --- REFINED EXPORT LOGIC ---

  const formatSceneDetailed = (s: ScenePrompt) => {
    const actionTimeline = s.actionBeats.map(b => `${b.timeRange}: ${b.action}`).join('; ');
    return `SCENE ${s.sceneNumber}: Metadata: Duration ${s.metadata.duration}s, Tone ${s.metadata.tone}, Localization ${s.metadata.localization}. ` +
           `Style: ${s.styleLock}. ` +
           `Camera: ${s.camera.shotType}, ${s.camera.movement}, ${s.camera.angle}. ` +
           `Action: ${actionTimeline}. ` +
           `Spatial: ${s.spatialRules}. ` +
           `Physics: ${s.physics.squashStretch} squash/stretch, ${s.physics.elasticity}, ${s.physics.impactHold}. ` +
           `Sync: ${s.textAudioSync}. ` +
           `Mood: ${s.mood}. ` +
           `Negative: ${s.avoidRules}. ` +
           `Camera Shot: ${s.camera.shotType}, Camera Angle: ${s.camera.angle}, ` +
           `Physics Mode: ${s.physics.squashStretch} S&S, Elasticity: ${s.physics.elasticity}, ` +
           `Cast & Depth Protocol: ${s.characters} / ${s.spatialRules}, ` +
           `Environment Art Node: ${s.background}, Sync Node (Text/Audio): ${s.textAudioSync}, ` +
           `Action Beats Timeline: ${actionTimeline}`;
  };

  const exportJSON = () => downloadFile(JSON.stringify(filteredResults, null, 2), `vexa_toon_export_${Date.now()}.json`, "application/json");

  const exportCSV = () => {
    const headers = [
      "Scene", "Duration", "Tone", "Localization", "Camera Shot", "Camera Angle", 
      "Physics Mode", "Elasticity", "Cast & Depth Protocol", "Environment Art Node", 
      "Sync Node (Text/Audio)", "Action Beats Timeline", "Full Setup"
    ];
    const rows = filteredResults.map(s => [
      s.sceneNumber,
      s.metadata.duration,
      s.metadata.tone,
      s.metadata.localization,
      `"${s.camera.shotType}"`,
      `"${s.camera.angle}"`,
      `"${s.physics.squashStretch} S&S"`,
      `"${s.physics.elasticity}"`,
      `"${s.characters} / ${s.spatialRules}"`,
      `"${s.background}"`,
      `"${s.textAudioSync}"`,
      `"${s.actionBeats.map(b => `${b.timeRange}: ${b.action}`).join('\n')}"`,
      `"${s.setup.replace(/"/g, '""')}"`
    ]);
    const content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile(content, `vexa_toon_export_${Date.now()}.csv`, "text/csv");
  };

  const exportTXT = () => {
    let text = `VEXA TOON ARCHITECT: ${videoTitle || SMART_DEFAULT_TITLE}\n`;
    text += `========================================================\n\n`;
    filteredResults.forEach(s => {
      text += `${formatSceneDetailed(s)}\n\n`;
      text += `--------------------------------------------------------\n\n`;
    });
    downloadFile(text, `vexa_toon_export_${Date.now()}.txt`, "text/plain");
  };

  const exportMarkdown = () => {
    let md = `# Vexa Toon Project: ${videoTitle || SMART_DEFAULT_TITLE}\n\n`;
    filteredResults.forEach(s => {
      md += `## Scene ${s.sceneNumber} (${s.metadata.tone})\n`;
      md += `**Setup:** ${s.setup}\n\n`;
      md += `**Action Timeline:**\n`;
      s.actionBeats.forEach(b => md += `- ${b.timeRange}: ${b.action}\n`);
      md += `\n**Camera:** ${s.camera.shotType} | ${s.camera.angle} | ${s.camera.movement}\n`;
      md += `**Physics:** ${s.physics.squashStretch} Squash/Stretch | Elasticity: ${s.physics.elasticity}\n`;
      md += `**Cast & Depth:** ${s.characters} / ${s.spatialRules}\n`;
      md += `**Environment:** ${s.background}\n`;
      md += `**Sync Node:** ${s.textAudioSync}\n\n`;
      md += `---\n\n`;
    });
    downloadFile(md, `vexa_toon_export_${Date.now()}.md`, "text/markdown");
  };

  const copyIndividualScene = (scene: ScenePrompt) => {
    navigator.clipboard.writeText(formatSceneDetailed(scene));
    alert(`Scene #${scene.sceneNumber} full breakdown copied to clipboard!`);
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
            <button onClick={() => setIsApiKeyModalOpen(true)} className={`px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 border ${apiConfigs[platformType] || platformType === 'Gemini' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-blue-600 border-blue-500 text-white shadow-lg'}`}>
              <i className="fas fa-key"></i> ENGINE
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex border-b border-gray-800 mb-10 overflow-x-auto no-scrollbar no-print">
          {['api', 'config', 'results'].map(t => (
            <button key={t} onClick={() => setActiveTab(t as any)} className={`px-8 py-4 text-[11px] font-bold uppercase tracking-widest transition-all border-b-2 ${activeTab === t ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-gray-500'}`}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {activeTab === 'api' && (
          <section className="bg-gray-900/50 border border-gray-800 rounded-3xl p-10 space-y-10 no-print animate-in fade-in duration-500">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(Object.keys(PLATFORM_CONFIGS) as PlatformType[]).map((p) => (
                  <button key={p} onClick={() => { setPlatformType(p); setTestStatus('idle'); }} className={`p-8 rounded-[2rem] border-2 transition-all ${platformType === p ? 'border-blue-500 bg-blue-500/10 shadow-2xl shadow-blue-500/10' : 'border-gray-800 bg-gray-950/40'}`}>
                    <i className={`fab ${PLATFORM_CONFIGS[p].icon} text-5xl mb-4 ${platformType === p ? 'text-blue-400' : 'text-gray-600'}`}></i>
                    <span className="text-[12px] font-black uppercase block">{PLATFORM_CONFIGS[p].label}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 bg-gray-950/50 p-10 rounded-[2.5rem] border border-gray-800">
                <div className="space-y-4">
                  <h3 className="text-[11px] font-black text-gray-500 uppercase">Model Node</h3>
                  <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-6 py-4 text-xs font-bold text-gray-300">
                    {PLATFORM_CONFIGS[platformType].models.map(m => (<option key={m} value={m}>{m}</option>))}
                  </select>
                </div>
                <div className="space-y-4">
                  <h3 className="text-[11px] font-black text-gray-500 uppercase">Temperature Node</h3>
                  <input type="range" min="0" max="2" step="0.1" value={temp} onChange={(e) => setTemp(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-800 rounded-full appearance-none accent-blue-500" />
                  <p className="text-right text-xs text-blue-400 font-bold">{temp.toFixed(1)}</p>
                </div>
              </div>
              <div className="flex justify-end"><button onClick={() => setActiveTab('config')} className="px-10 py-5 bg-blue-600 text-white rounded-2xl font-black text-[12px] uppercase tracking-widest">CONTINUE <i className="fas fa-arrow-right ml-2"></i></button></div>
          </section>
        )}

        {activeTab === 'config' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 no-print animate-in slide-in-from-bottom-4 duration-500">
            <div className="lg:col-span-8 space-y-8">
              <section className="bg-gray-900/50 border border-gray-800 rounded-3xl p-8 space-y-6">
                <h2 className="text-[12px] font-bold uppercase text-gray-400">Metadata Node</h2>
                <input type="text" value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} placeholder={SMART_DEFAULT_TITLE} className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-6 py-4 outline-none text-sm font-medium" />
                <div className="flex items-center justify-between p-4 bg-gray-950/50 rounded-2xl border border-gray-800">
                  <p className="text-[11px] font-bold uppercase text-white">Bangladeshi Localization Switch</p>
                  <button onClick={() => setIsLocalized(!isLocalized)} className={`relative w-12 h-6 rounded-full transition-colors ${isLocalized ? 'bg-green-600' : 'bg-gray-800'}`}>
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${isLocalized ? 'translate-x-6' : ''}`}></div>
                  </button>
                </div>
              </section>
              <section className="bg-gray-900/50 border border-gray-800 rounded-3xl p-8 space-y-6">
                <h2 className="text-[12px] font-bold uppercase text-gray-400">Cast Node</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {characters.map((char) => (
                    <div key={char.id} className="p-5 bg-gray-950 border border-gray-800 rounded-2xl relative">
                      <input type="text" value={char.name} onChange={(e) => setCharacters(prev => prev.map(c => c.id === char.id ? { ...c, name: e.target.value } : c))} className="bg-transparent border-b border-gray-800 w-full mb-2 font-bold" />
                      <input type="text" value={char.role} onChange={(e) => setCharacters(prev => prev.map(c => c.id === char.id ? { ...c, role: e.target.value } : c))} className="bg-transparent text-[10px] w-full" />
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="lg:col-span-4 space-y-8">
              <section className="bg-gray-900/50 border border-gray-800 rounded-3xl p-8 space-y-8">
                <h2 className="text-[12px] font-bold uppercase text-gray-400">Iteration Node</h2>
                <div className="space-y-6">
                  <div><label className="text-[10px] block mb-2 font-bold text-gray-500 uppercase">Scene Count: {sceneCount}</label><input type="range" min="1" max="150" value={sceneCount} onChange={(e) => setSceneCount(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-800 rounded-full appearance-none accent-purple-500" /></div>
                  <div><label className="text-[10px] block mb-2 font-bold text-gray-500 uppercase">Duration Node: {sceneDuration}s</label><input type="range" min="1" max="60" value={sceneDuration} onChange={(e) => setSceneDuration(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-800 rounded-full appearance-none accent-green-500" /></div>
                </div>
                <button onClick={handleGenerate} disabled={isGenerating} className="w-full py-5 rounded-2xl font-black text-xs uppercase bg-blue-600 text-white shadow-xl hover:scale-[1.02] active:scale-95 transition-all">
                  {isGenerating ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-play mr-2"></i>} START PIPELINE
                </button>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'results' && (
          <div className="space-y-8">
            {isGenerating && (
              <div className="bg-blue-600/10 border border-blue-500/30 p-20 rounded-[3rem] text-center no-print">
                <div className="w-20 h-20 border-4 border-t-blue-500 border-blue-500/20 rounded-full animate-spin mx-auto mb-8"></div>
                <h3 className="text-2xl font-black uppercase italic tracking-tighter">Assembling Node {progress.current} of {progress.total}</h3>
                <p className="text-blue-400 text-[10px] font-black uppercase mt-4 tracking-widest">Enforcing Style Protocols...</p>
              </div>
            )}

            {!isGenerating && results.length > 0 && (
              <div className="space-y-8">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-gray-900 border border-gray-800 p-8 rounded-3xl shadow-2xl no-print">
                   <div className="space-y-2">
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter">{videoTitle || SMART_DEFAULT_TITLE}</h3>
                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Assembly Complete: {filteredResults.length} Filtered Scenes</p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <button onClick={exportJSON} className="px-4 py-2 bg-gray-800 rounded-xl text-[9px] font-black uppercase hover:border-blue-500 border border-transparent transition-all">JSON</button>
                    <button onClick={exportCSV} className="px-4 py-2 bg-gray-800 rounded-xl text-[9px] font-black uppercase hover:border-green-500 border border-transparent transition-all">CSV</button>
                    <button onClick={exportTXT} className="px-4 py-2 bg-gray-800 rounded-xl text-[9px] font-black uppercase hover:border-purple-500 border border-transparent transition-all">TXT</button>
                    <button onClick={exportMarkdown} className="px-4 py-2 bg-gray-800 rounded-xl text-[9px] font-black uppercase hover:border-orange-500 border border-transparent transition-all">MD</button>
                    <button onClick={() => window.print()} className="px-4 py-2 bg-red-600 text-white rounded-xl text-[9px] font-black uppercase shadow-lg">PDF</button>
                  </div>
                </div>

                {/* Filtering Controls */}
                <div className="flex flex-col md:flex-row gap-4 no-print bg-gray-950/50 p-6 rounded-3xl border border-gray-800">
                  <div className="relative flex-1">
                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-600"></i>
                    <input 
                      type="text" 
                      value={filterSearch} 
                      onChange={(e) => setFilterSearch(e.target.value)}
                      placeholder="Filter scripts by keyword..."
                      className="w-full bg-gray-900 border border-gray-800 rounded-2xl pl-10 pr-4 py-3 text-xs outline-none focus:border-blue-500"
                    />
                  </div>
                  <select 
                    value={filterEmotion} 
                    onChange={(e) => setFilterEmotion(e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-3 text-[10px] font-black uppercase outline-none focus:border-blue-500"
                  >
                    <option value="All">All Tones</option>
                    {EMOTION_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-12 results-grid">
                  {filteredResults.map((s) => (
                    <div key={s.sceneNumber} className="scene-card bg-gray-900/40 border border-gray-800/80 rounded-[3rem] overflow-hidden backdrop-blur-sm animate-in fade-in slide-in-from-bottom-10 duration-700">
                      <div className="px-10 py-6 bg-gray-950/80 border-b border-gray-800 flex justify-between items-center">
                        <div className="flex items-center gap-6">
                          <span className="text-blue-400 font-black text-xl font-mono">SCENE_{String(s.sceneNumber).padStart(3, '0')}</span>
                          <span className="px-4 py-1.5 bg-yellow-500/10 text-yellow-500 rounded-xl text-[10px] font-black uppercase tracking-widest border border-yellow-500/20">{s.metadata.tone}</span>
                          <span className="text-gray-500 text-[10px] font-black uppercase">{s.metadata.duration}s</span>
                        </div>
                        <div className="flex gap-2 no-print">
                          <button onClick={() => copyIndividualScene(s)} className="p-3 bg-gray-900 border border-gray-800 hover:border-blue-500 rounded-2xl text-gray-500 hover:text-blue-400 transition-all" title="Copy Detailed Breakdown"><i className="fas fa-file-invoice"></i></button>
                          <button onClick={() => { navigator.clipboard.writeText(s.setup); alert("Assembled prompt copied!"); }} className="p-3 bg-gray-900 border border-gray-800 hover:border-green-500 rounded-2xl text-gray-500 hover:text-green-400 transition-all" title="Copy Assembled Script Only"><i className="fas fa-align-left"></i></button>
                        </div>
                      </div>
                      <div className="p-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
                        <div className="lg:col-span-7 space-y-10">
                           <div className="space-y-4">
                              <h4 className="text-[11px] font-black text-gray-600 uppercase flex items-center gap-2"><i className="fas fa-align-left"></i> Assembled Animation Script</h4>
                              <p className="text-lg font-bold text-gray-100 leading-relaxed bg-gray-950/50 p-8 rounded-3xl border border-gray-800 italic">{s.setup}</p>
                           </div>
                           <div className="space-y-4">
                              <h4 className="text-[11px] font-black text-gray-600 uppercase flex items-center gap-2"><i className="fas fa-stopwatch"></i> Action Beats Timeline</h4>
                              <div className="grid grid-cols-1 gap-4">
                                {s.actionBeats.map((beat, bidx) => (
                                  <div key={bidx} className="flex gap-4 items-start bg-gray-950/30 p-4 rounded-2xl border border-gray-800/50">
                                    <span className="text-[10px] font-mono font-black text-blue-500 w-16 pt-1">{beat.timeRange}</span>
                                    <p className="text-xs font-medium text-gray-300">{beat.action}</p>
                                  </div>
                                ))}
                              </div>
                           </div>
                        </div>
                        <div className="lg:col-span-5 space-y-8 bg-gray-950/40 p-10 rounded-[2.5rem] border border-gray-800/50">
                          <div className="grid grid-cols-2 gap-8">
                            <div><h5 className="text-[9px] font-black text-gray-600 uppercase mb-2">Camera Shot</h5><p className="text-[11px] font-bold text-blue-400">{s.camera.shotType}</p></div>
                            <div><h5 className="text-[9px] font-black text-gray-600 uppercase mb-2">Camera Angle</h5><p className="text-[11px] font-bold text-blue-400">{s.camera.angle}</p></div>
                            <div><h5 className="text-[9px] font-black text-gray-600 uppercase mb-2">Physics Mode</h5><p className="text-[11px] font-bold text-purple-400">{s.physics.squashStretch} S&S</p></div>
                            <div><h5 className="text-[9px] font-black text-gray-600 uppercase mb-2">Elasticity</h5><p className="text-[11px] font-bold text-purple-400">{s.physics.elasticity}</p></div>
                          </div>
                          <div className="pt-6 border-t border-gray-800/50">
                            <h5 className="text-[9px] font-black text-gray-600 uppercase mb-3">Cast & Depth Protocol</h5>
                            <p className="text-xs font-medium text-gray-400 leading-loose">{s.characters}</p>
                            <p className="text-[9px] font-black text-blue-500 uppercase mt-2">{s.spatialRules}</p>
                          </div>
                          <div className="pt-6 border-t border-gray-800/50">
                            <h5 className="text-[9px] font-black text-gray-600 uppercase mb-3">Environment Art Node</h5>
                            <p className="text-xs font-medium text-gray-400 leading-loose">{s.background}</p>
                          </div>
                          <div className="pt-6 border-t border-gray-800/50">
                            <h5 className="text-[9px] font-black text-gray-600 uppercase mb-3">Sync Node (Text/Audio)</h5>
                            <p className="text-xs font-medium text-yellow-500/80 leading-loose">{s.textAudioSync}</p>
                          </div>
                          <div className="pt-6 border-t border-gray-800/50">
                             <div className="flex items-center gap-3 text-[9px] font-black uppercase text-green-500">
                               <i className="fas fa-shield-check"></i> <span>{s.finalCheck}</span>
                             </div>
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

      {/* API Modal */}
      {isApiKeyModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-500 no-print">
          <div className="absolute inset-0 bg-[#0a0b10]/95 backdrop-blur-2xl" onClick={() => setIsApiKeyModalOpen(false)}></div>
          <div className="relative w-full max-w-xl bg-gray-900 border border-gray-800 rounded-[3rem] shadow-2xl p-14 animate-in zoom-in duration-300">
             <h3 className="text-3xl font-black text-white uppercase italic mb-6">Security Node</h3>
             <p className="text-gray-500 text-xs font-bold uppercase mb-8">All keys are stored in transient memory. Protocol ends on reload.</p>
             <input type="password" value={tempApiKey} onChange={(e) => setTempApiKey(e.target.value)} placeholder="Commit Token..." className="w-full bg-gray-950 border border-gray-800 rounded-3xl px-8 py-5 text-white outline-none focus:ring-4 focus:ring-blue-500/20 font-mono tracking-widest mb-10" />
             <div className="grid grid-cols-2 gap-4">
                <button onClick={handleTestConnection} className="py-4 rounded-2xl font-black text-[10px] uppercase border border-gray-800 hover:border-blue-500 transition-all">TEST NODE</button>
                <button onClick={handleSaveConfig} className="py-4 rounded-2xl font-black text-[10px] uppercase bg-blue-600 text-white shadow-xl shadow-blue-500/20">SAVE & COMMIT</button>
             </div>
             {testStatus !== 'idle' && (
               <div className={`mt-6 p-4 rounded-2xl text-[10px] font-black uppercase text-center ${testStatus === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                 {testStatus === 'success' ? "Handshake complete." : connectionMessage}
               </div>
             )}
          </div>
        </div>
      )}

      <footer className="mt-20 py-10 border-t border-gray-800/50 text-center opacity-40 no-print">
        <p className="text-[10px] font-black uppercase tracking-[0.8em]">Vexa Toon Nodes V3.1 • Export-Enhanced Architecture</p>
      </footer>
    </div>
  );
};

export default App;
