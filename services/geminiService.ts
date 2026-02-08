
import { GoogleGenAI, Type } from "@google/genai";
import { ScenePrompt, PlatformType, GenerationState } from "../types";

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const status = error?.status || error?.error?.status;
      const code = error?.code || error?.error?.code;
      if (status === "UNAVAILABLE" || code === 503 || status === "RESOURCE_EXHAUSTED" || code === 429) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const testConnection = async (apiKey: string, platformType: PlatformType, modelName: string): Promise<{ success: boolean; message: string }> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    await ai.models.generateContent({
      model: modelName || "gemini-3-flash-preview",
      contents: "ping",
      config: { maxOutputTokens: 1 }
    });
    return { success: true, message: "Node handshake successful." };
  } catch (error: any) {
    return { success: false, message: error?.message || "Connection refused." };
  }
};

export const generateSingleScenePrompt = async (
  ai: any,
  state: GenerationState,
  sceneIndex: number,
  emotion: string
): Promise<ScenePrompt> => {
  const systemInstruction = `
    You are the "2D Animation Assembly Node". Your task is to generate a multi-scene prompt following the strictly defined 12-node pipeline.

    NODE 1: Metadata - SCENE ${sceneIndex + 1}, Duration ${state.sceneDuration}s, Tone: ${emotion}.
    NODE 2: Style Lock - Classic 1940s–1960s hand-drawn 2D cartoon, thick black outlines (4-5px), flat colors, watercolor backgrounds. NO 3D.
    NODE 3: Camera Grammar - Must specify Shot Type, Movement, and Angle.
    NODE 4: Action Beats - Timeline of action (Verb + Subject) summing to ${state.sceneDuration}s.
    NODE 5: Character Node - Use the provided cast with specific colors and 4-5px outlines.
    NODE 6: Spatial Lock - Assign depth (Foreground/Midground/Background) to all characters.
    NODE 7: Background Node - Watercolor painted, localized if enabled (${state.isLocalized ? "Bangladeshi Village" : "US Suburban"}).
    NODE 8: Physics Node - Enforce 140-180% Squash & Stretch, 2-frame impact holds, rubber-hose limbs.
    NODE 9: Sync Node - Dialogue or sound cues (Bangla if localized) synced to beats.
    NODE 10: Mood Node - Emotional clarity scaling with intensity.
    NODE 11: Negative Guard - Hard block on 3D, gradients, realistic textures.
    NODE 12: Assembly - Merge all nodes into a coherent prompt string.

    CAST DATA:
    ${state.characters.map(c => `- ${c.name}: ${c.role}, color ${c.color}, ${c.outline}px outline.`).join('\n')}

    LOCALIZATION: ${state.isLocalized ? "Bangladeshi village setting enabled." : "Standard T&J setting."}
  `;

  const userPrompt = `Generate SCENE ${sceneIndex + 1} for video "${state.videoTitle}". Mood: ${emotion}.`;

  const model = state.modelName || "gemini-3-flash-preview";
  const { topP, topK, temperature } = state.optionalParams;

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
          setup: { type: Type.STRING, description: "The full assembled prompt block." },
          finalCheck: { type: Type.STRING }
        },
        required: ["sceneNumber", "metadata", "styleLock", "camera", "actionBeats", "characters", "spatialRules", "background", "physics", "textAudioSync", "mood", "avoidRules", "setup", "finalCheck"]
      }
    }
  });

  if (!response.text) throw new Error("Null generation response.");
  return JSON.parse(response.text);
};

export const generateScenePrompts = async (state: GenerationState, onProgress?: (current: number, total: number) => void): Promise<ScenePrompt[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const results: ScenePrompt[] = [];
  for (let i = 0; i < state.sceneCount; i++) {
    const emotion = state.emotions[i] || "Playful";
    try {
      const scene = await withRetry(() => generateSingleScenePrompt(ai, state, i, emotion));
      results.push(scene);
    } catch (e) {
      console.error(e);
      results.push({
        sceneNumber: i + 1,
        metadata: { duration: state.sceneDuration, tone: emotion, localization: state.isLocalized ? "Bangladeshi" : "Standard" },
        styleLock: "Classic 2D hand-drawn, thick black outlines.",
        camera: { shotType: "Medium", movement: "Static", angle: "Eye-level" },
        actionBeats: [{ timeRange: "0-8s", action: "Characters interacting in slapstick fashion." }],
        characters: "Cast with thick black outlines.",
        spatialRules: "Characters in midground.",
        background: "Watercolor environment.",
        physics: { squashStretch: "160%", elasticity: "High", impactHold: "2 frames" },
        textAudioSync: "Classic cartoon sounds.",
        mood: emotion,
        avoidRules: "No 3D.",
        setup: `FALLBACK: Classic 2D hand-drawn animation for ${state.videoTitle} with ${emotion} mood.`,
        finalCheck: "FALLBACK: Protocol maintained."
      });
    }
    if (onProgress) onProgress(i + 1, state.sceneCount);
  }
  return results;
};
