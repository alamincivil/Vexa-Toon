
export type PlatformType = 'Gemini' | 'OpenAI' | 'DeepSeek';

export interface OptionalParams {
  temperature: number;
  maxTokens: number;
  safetyThreshold: string;
  topP: number;
  topK: number;
  endpointType: string;
  resolution: string;
  responseFormat: string;
}

export interface ApiConfig {
  apiKey: string;
  platformType: PlatformType;
  modelName: string;
  optionalParams: OptionalParams;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  color: string;
  outline: number;
  traits: string;
}

export interface ActionBeat {
  timeRange: string;
  action: string;
}

export interface ScenePrompt {
  sceneNumber: number;
  metadata: {
    duration: number;
    tone: string;
    localization: string;
  };
  styleLock: string;
  camera: {
    shotType: string;
    movement: string;
    angle: string;
  };
  actionBeats: ActionBeat[];
  characters: string;
  spatialRules: string;
  background: string;
  physics: {
    squashStretch: string;
    elasticity: string;
    impactHold: string;
  };
  textAudioSync: string;
  mood: string;
  avoidRules: string;
  setup: string; // The full assembled prompt for ease of use
  finalCheck: string;
}

export interface AppState {
  videoTitle: string;
  isLocalized: boolean;
  emotions: string[];
  characters: Character[];
  sceneCount: number;
  sceneDuration: number;
  apiConfigs: Record<PlatformType, ApiConfig | null>;
  currentPlatform: PlatformType;
}

export interface GenerationState extends AppState {
  apiKey: string;
  modelName: string;
  optionalParams: OptionalParams;
}

export const EMOTION_OPTIONS = [
  "Playful", "Suspenseful", "Excited", "Curious", "Angry", 
  "Sad", "Mischievous", "Terrified", "Confused", "Victorious"
];

export const SHOT_TYPES = ["Wide", "Medium", "Close-up", "Extreme Close-up"];
export const CAMERA_MOVEMENTS = ["Static", "Tracking", "Pan", "Zoom", "Dolly"];
export const CAMERA_ANGLES = ["Eye-level", "Low", "High", "Bird's eye"];

export const DEFAULT_CHARACTERS: Character[] = [
  { id: '1', name: 'Tom', role: 'Clumsy Cat', color: '#5C76B7', outline: 4, traits: 'Always chasing Jerry, easily frustrated' },
  { id: '2', name: 'Jerry', role: 'Clever Mouse', color: '#8B4513', outline: 4, traits: 'Small and agile, loves cheese, always escapes' },
  { id: '3', name: 'Spike', role: 'Tough Dog', color: '#D3D3D3', outline: 5, traits: 'Protective of his son, hates Tom disturbing his sleep' }
];

export const PLATFORM_CONFIGS = {
  Gemini: {
    label: "Gemini",
    icon: "fa-google",
    models: ["gemini-3-flash-preview", "gemini-3-pro-preview"],
    description: "Google's high-speed multimodal models."
  },
  OpenAI: {
    label: "OpenAI",
    icon: "fa-bolt",
    models: ["gpt-4o", "gpt-4-turbo"],
    description: "Industry-standard GPT models."
  },
  DeepSeek: {
    label: "DeepSeek",
    icon: "fa-brain",
    models: ["deepseek-chat"],
    description: "Advanced reasoning intelligence."
  }
};
