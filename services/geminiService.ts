
import { GoogleGenAI, Type } from "@google/genai";
import { ScenePrompt, PlatformType, GenerationState } from "../types";

/**
 * Maps external platform model names to the most appropriate Gemini model.
 */
const mapToGeminiModel = (platform: PlatformType, modelName: string): string => {
  if (platform === 'Gemini') return modelName;
  
  const mapping: Record<string, string> = {
    'gpt-4o': 'gemini-3-pro-preview',
    'gpt-4-turbo': 'gemini-3-pro-preview',
    'deepseek-chat': 'gemini-3-flash-preview'
  };

  return mapping[modelName] || 'gemini-3-flash-preview';
};

/**
 * Performs a minimal handshake to validate the API key and check latency.
 */
export const testConnection = async (apiKeyOverride?: string): Promise<{ success: boolean; latency: number; message: string }> => {
  const key = apiKeyOverride || process.env.API_KEY;
  if (!key) {
    return { success: false, latency: 0, message: "No authority key detected in sequence." };
  }

  const ai = new GoogleGenAI({ apiKey: key });
  const start = performance.now();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: 'Ping',
      config: { maxOutputTokens: 1 }
    });
    const end = performance.now();
    if (response.text) {
      return { 
        success: true, 
        latency: Math.round(end - start), 
        message: "Handshake successful. Engine ready." 
      };
    }
    throw new Error("Empty response from Engine.");
  } catch (error: any) {
    return { 
      success: false, 
      latency: 0, 
      message: error?.message || "Connection refused. Validate project permissions." 
    };
  }
};

async function withRetry<T>(
  fn: () => Promise<T>, 
  onRetry?: (attempt: number, delay: number) => void,
  maxRetries = 4, 
  baseDelay = 2000
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const status = error?.status || error?.error?.status;
      const code = error?.code || error?.error?.code;
      
      const isTransient = status === "UNAVAILABLE" || code === 503 || status === "RESOURCE_EXHAUSTED" || code === 429;
      
      if (isTransient && attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        if (onRetry) onRetry(attempt + 1, delay);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const generateSingleScenePrompt = async (
  ai: any,
  state: GenerationState,
  sceneIndex: number,
  emotion: string
): Promise<ScenePrompt> => {
  const model = mapToGeminiModel(state.currentPlatform, state.modelName);
  const { topP, topK, temperature } = state.optionalParams;

  const systemInstruction = `
    You are the "Vexa Toon Master Assembly Node". Your task is to generate a professional 2D cartoon animation prompt.
    Current Engine Emulation: ${state.currentPlatform} (${state.modelName})
    Target Style: Classic 1940s–1960s hand-drawn 2D animation (Tom & Jerry style).
    
    PIPELINE PROTOCOLS:
    1. STYLE LOCK: 2D hand-drawn, thick black outlines (4-5px), watercolor backgrounds, vibrant but flat character colors.
    2. PHYSICS: 150% Squash & Stretch. Rubber-hose limbs. Impact holds.
    3. CAMERA: Dynamic but classic.
    4. LOCALIZATION: ${state.isLocalized ? "Bangladeshi Village Context: Use local items like lungis, rickshaws, village paths, and palm trees." : "Standard Suburban American Context."}
    
    CAST DATA:
    ${state.characters.map(c => `- ${c.name}: ${c.role}, color ${c.color}, traits: ${c.traits}`).join('\n')}

    Output must be valid JSON matching the requested schema.
  `;

  const userPrompt = `Generate SCENE ${sceneIndex + 1} of ${state.sceneCount} for "${state.videoTitle}". 
    Scene Duration: ${state.sceneDuration}s. 
    Mood: ${emotion}.`;

  const response = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction,
      temperature,
      topP,
      topK,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sceneNumber: { type: Type.INTEGER },
          metadata: {
            type: Type.OBJECT,
            properties: {
              duration: { type: Type.INTEGER },
              tone: { type: Type.STRING },
              localization: { type: Type.STRING }
            }
          },
          styleLock: { type: Type.STRING },
          camera: {
            type: Type.OBJECT,
            properties: {
              shotType: { type: Type.STRING },
              movement: { type: Type.STRING },
              angle: { type: Type.STRING }
            }
          },
          actionBeats: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                timeRange: { type: Type.STRING },
                action: { type: Type.STRING }
              }
            }
          },
          characters: { type: Type.STRING },
          spatialRules: { type: Type.STRING },
          background: { type: Type.STRING },
          physics: {
            type: Type.OBJECT,
            properties: {
              squashStretch: { type: Type.STRING },
              elasticity: { type: Type.STRING },
              impactHold: { type: Type.STRING }
            }
          },
          textAudioSync: { type: Type.STRING },
          mood: { type: Type.STRING },
          avoidRules: { type: Type.STRING },
          setup: { type: Type.STRING },
          finalCheck: { type: Type.STRING }
        },
        required: ["sceneNumber", "metadata", "styleLock", "camera", "actionBeats", "characters", "spatialRules", "background", "physics", "textAudioSync", "mood", "avoidRules", "setup", "finalCheck"]
      }
    }
  });

  if (!response.text) throw new Error("Null generation response.");
  return JSON.parse(response.text.trim());
};

export const generateScenePrompts = async (
  state: GenerationState, 
  onProgress?: (current: number, total: number, message?: string) => void
): Promise<ScenePrompt[]> => {
  const keyToUse = state.apiKey || process.env.API_KEY;
  const ai = new GoogleGenAI({ apiKey: keyToUse });
  const results: ScenePrompt[] = [];
  
  for (let i = 0; i < state.sceneCount; i++) {
    const emotion = state.emotions[i] || "Playful";
    if (onProgress) onProgress(i, state.sceneCount, `Initializing Assembly Node ${i + 1}...`);
    
    try {
      const scene = await withRetry(
        () => generateSingleScenePrompt(ai, state, i, emotion),
        (attempt, delay) => {
          if (onProgress) onProgress(i, state.sceneCount, `Retrying Node ${i+1}... (Wait ${delay/1000}s)`);
        }
      );
      results.push(scene);
    } catch (e) {
      console.error("Pipeline failure at node " + (i+1), e);
      results.push({
        sceneNumber: i + 1,
        metadata: { duration: state.sceneDuration, tone: emotion, localization: "Standard" },
        styleLock: "Classic 2D animation, thick black outlines.",
        camera: { shotType: "Medium", movement: "Static", angle: "Eye-level" },
        actionBeats: [{ timeRange: `0-${state.sceneDuration}s`, action: "Slapstick interaction between characters." }],
        characters: "Main cast interacting.",
        spatialRules: "Midground placement.",
        background: "Classic watercolor background.",
        physics: { squashStretch: "150%", elasticity: "High", impactHold: "2 frames" },
        textAudioSync: "Synced sound effects.",
        mood: emotion,
        avoidRules: "No 3D, no gradients.",
        setup: `FALLBACK: 2D animation sequence of ${state.videoTitle} with ${emotion} tone.`,
        finalCheck: "Pipeline Error Recovered."
      });
    }
    if (onProgress) onProgress(i + 1, state.sceneCount, `Node ${i + 1} Assembled.`);
  }
  return results;
};
