// Shared TypeScript types for FlySwarm frontend

export type CaptchaType = 'text' | 'math' | 'rotate' | 'broken_circle' | 'scatter';
export type Difficulty = 'easy' | 'medium' | 'hard';

// ── WebSocket message shapes ────────────────────────────────────────────────

export interface WsStart {
  event: 'start';
  type: CaptchaType;
  difficulty: Difficulty;
  n_flies: number;
}

export interface WsChallenge {
  event: 'challenge';
  captcha_b64: string;
  captcha_type: CaptchaType;
  difficulty: Difficulty;
  n_flies: number;
}

export interface WsStep {
  event: 'step';
  step: number;
  total: number;
  spike_rate: number;
  fired_neurons?: number[];
  fly_fired?: number[][];
  eye_activity: number[];
}

export interface WsResult {
  event: 'result';
  captcha_b64: string;
  fly_answers: string[];
  swarm_answer: string;
  ground_truth: string;
  correct: boolean;
  single_correct: boolean;
  confidences: number[];
  had_tie: boolean;
  n_flies: number;
}

export interface WsError {
  event: 'error';
  message: string;
}

export interface WsTrainProgress {
  event: 'progress';
  frac: number;
  message: string;
}

export interface WsTrainDone {
  event: 'done';
  type: CaptchaType;
  difficulty: Difficulty;
  n_train: number;
  cv_score: number;
  model_path: string;
}

export type WsMessage = WsStart | WsChallenge | WsStep | WsResult | WsError | WsTrainProgress | WsTrainDone;

// ── App state ───────────────────────────────────────────────────────────────

export interface FlyVote {
  flyIndex: number;
  answer: string;
  confidence: number;
}

export interface RunResult {
  captchaB64: string;
  flyVotes: FlyVote[];
  swarmAnswer: string;
  groundTruth: string;
  correct: boolean;
  singleCorrect: boolean;
  hadTie: boolean;
}

export interface TrainingState {
  isTraining: boolean;
  progress: number;        // 0–1
  message: string;
  lastCvScore: number | null;
}

export interface SessionStats {
  totalRuns: number;
  swarmCorrect: number;
  singleCorrect: number;
}

export interface TrainedModel {
  type: CaptchaType;
  difficulty: Difficulty;
  n_train: number;
  cv_score: number;
  filename: string;
}

// ── Neural activity ─────────────────────────────────────────────────────────

export interface NeuralFrame {
  step: number;
  total: number;
  spikeRate: number;
  firedNeurons?: number[];
  flyFired?: number[][];
  eyeActivity: number[];  // length 32
}
