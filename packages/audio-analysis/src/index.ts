export type SoundVectorFeatures = {
  source: string;
  tempo: number;
  energy: number;
  bass: number;
  brightness: number;
  rhythm: number;
  onset: number;
  spectralCentroid: number;
  chroma: number[];
  temporalProfile: number[];
  phase?: number;
};

export type AnalysisSource = {
  id: string;
  name: string;
  mimeType?: string;
  durationSeconds?: number;
};
