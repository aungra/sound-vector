export declare const REVERSIBLE_SVG_SCHEMA = "mmfr.reversible-svg.v1";
export declare const REVERSIBLE_METADATA_ID = "mmfr-reversible";
export declare const VISIBLE_PCM_LAYER_ID = "pcm_reversible_waveform";
export declare const PROTECTED_PCM_LAYER_ID = "pcm_reversible_data";

export type ReversibleSvgLayerPolicy = {
  id: string;
  role: "metadata" | "editable-visual" | "protected-restoration";
  editPolicy: "editable" | "lock-do-not-edit" | "generated";
};

export type ProtectedLayerOptions = {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  cx?: number;
  cy?: number;
  step?: number;
  amplitude?: number;
  bandWidth?: number;
  bandHeight?: number;
  radiusX?: number;
  radiusY?: number;
  textureSeed?: number | string;
  textureMode?: string;
  textureRegion?: "full" | "core" | "diagonal" | "bands" | "orbit" | "fracture" | "border" | "islands" | string;
  sampleRate?: number;
  channels?: number;
  duration?: number;
};

export type ReversibleSvgInspection = {
  schema: string | null;
  hasMetadata: boolean;
  hasVisiblePcmLayer: boolean;
  hasProtectedPcmLayer: boolean;
  byteLength: number;
  sampleRate: number | null;
  channels: number | null;
  duration: number | null;
};

export declare const reversibleSvgLayerPolicies: ReversibleSvgLayerPolicy[];
export declare function encodePcmBytesToProtectedLayer(bytes: Uint8Array | number[], options?: ProtectedLayerOptions): string;
export declare function decodePcmBytesFromProtectedLayer(svgText: string): Uint8Array;
export declare function inspectReversibleSvg(svgText: string): ReversibleSvgInspection;
