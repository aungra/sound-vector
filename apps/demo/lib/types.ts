export type ResonanceType =
  | "remembered"
  | "heard"
  | "worn"
  | "strangely_familiar"
  | "body_reacted";

export type Creator = {
  id: string;
  name: string;
  profile: string;
  sns?: string;
};

export type Track = {
  id: string;
  title: string;
  artist: string;
  url?: string;
  comment: string;
  tags: string[];
};

export type Tshirt = {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  image?: string;
  location: string;
  price: string;
  stockNote: string;
  tags: string[];
  tracks: Track[];
};

export type VisitorSession = {
  id: string;
  answers: Record<string, string[]>;
  tags: string[];
  recommendedIds: string[];
  createdAt: string;
};

export type Resonance = {
  id: string;
  tshirtId: string;
  type: ResonanceType;
  comment?: string;
  createdAt: string;
};
