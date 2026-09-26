'use client';

import { useState } from 'react';
import type { TrainingState, TrainedModel, CaptchaType, Difficulty } from '@/types';

const CAPTCHA_TYPES: CaptchaType[] = ['rotate', 'broken_circle', 'text', 'math', 'scatter'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

interface TrainingPanelProps {
  training: TrainingState;
  models: TrainedModel[];
  selectedType: CaptchaType;
  selectedDifficulty: Difficulty;
  nFlies: number;
  onTypeChange: (t: CaptchaType) => void;
  onDifficultyChange: (d: Difficulty) => void;
  onNFliesChange: (n: number) => void;
  onTrain: (nTrain: number) => void;
  onSelectModel: (type: CaptchaType, difficulty: Difficulty) => void;
}

const DIFF_COLORS: Record<Difficulty, string> = {
  easy:   'border-green-500/50 bg-green-500/10 text-green-400',
  medium: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
  hard:   'border-red-500/50 bg-red-500/10 text-red-400',
};

export default function TrainingPanel({
  training, models, selectedType, selectedDifficulty, nFlies,
  onTypeChange, onDifficultyChange, onNFliesChange, onTrain, onSelectModel,
}: TrainingPanelProps) {
  const [nTrain, setNTrain] = useState(80);

  const hasModel = models.some(
    m => m.type === selectedType && m.difficulty === selectedDifficulty
  );

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto">

      {/* ── Inference config ─────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-cyan-400/70 mb-3">
          Inference Config
        </h2>

        {/* CAPTCHA type */}
        <div className="mb-3">
          <label className="text-xs text-slate-400 mb-1.5 block">CAPTCHA Type</label>
          <div className="flex flex-wrap gap-1.5">
            {CAPTCHA_TYPES.map(t => (
              <button
                key={t}
                onClick={() => onTypeChange(t)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 border ${
                  selectedType === t
                    ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-300'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white'
                }`}
              >
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div className="mb-3">
          <label className="text-xs text-slate-400 mb-1.5 block">Difficulty</label>
          <div className="flex gap-1.5">
            {DIFFICULTIES.map(d => (
              <button
                key={d}
                onClick={() => onDifficultyChange(d)}
                className={`flex-1 py-1.5 rounded-md text-xs font-semibold border transition-all duration-200 capitalize ${
                  selectedDifficulty === d
                    ? DIFF_COLORS[d]
                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Swarm size */}
        <div>
          <label className="text-xs text-slate-400 mb-1.5 flex justify-between">
            Swarm size
            <span className="font-mono text-cyan-400">{nFlies} flies</span>
          </label>
          <input
            type="range"
            min={1} max={8} step={1}
            value={nFlies}
            onChange={e => onNFliesChange(Number(e.target.value))}
            className="w-full accent-cyan-400"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-0.5">
            <span>1</span><span>8</span>
          </div>
        </div>

        {/* Model availability badge */}
        <div className={`mt-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
          hasModel
            ? 'bg-green-500/10 border border-green-500/30 text-green-400'
            : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
        }`}>
          {hasModel ? '✓ Trained model ready' : '⚠ No model — train first'}
        </div>
      </div>

      <div className="h-px bg-white/5" />

      {/* ── Training ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-cyan-400/70 mb-3">
          Train Brain
        </h2>
        <p className="text-xs text-slate-500 mb-3 leading-relaxed">
          Generates random CAPTCHAs, drives the fly&apos;s visual neurons, collects spike-trace
          features from the real MaleCNS connectome, then fits a PCA + logistic/ridge readout
          via cross-validation. Nothing is hardcoded.
        </p>

        {/* n_train slider */}
        <div className="mb-4">
          <label className="text-xs text-slate-400 mb-1.5 flex justify-between">
            Training examples
            <span className="font-mono text-cyan-400">{nTrain}</span>
          </label>
          <input
            type="range"
            min={20} max={200} step={10}
            value={nTrain}
            onChange={e => setNTrain(Number(e.target.value))}
            disabled={training.isTraining}
            className="w-full accent-cyan-400 disabled:opacity-40"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-0.5">
            <span>20 (~30s)</span><span>200 (~5min)</span>
          </div>
        </div>

        {/* Training progress */}
        {training.isTraining && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span className="truncate max-w-[180px]">{training.message}</span>
              <span className="font-mono text-cyan-400">{Math.round(training.progress * 100)}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full transition-all duration-300"
                style={{ width: `${training.progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Done / CV score */}
        {!training.isTraining && training.lastCvScore !== null && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-xs text-green-400">
            ✓ Trained successfully · CV score: {training.lastCvScore.toFixed(3)}
          </div>
        )}

        {!training.isTraining && training.message.startsWith('Error') && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 break-words">
            {training.message}
          </div>
        )}

        <button
          onClick={() => onTrain(nTrain)}
          disabled={training.isTraining}
          className="w-full py-2.5 rounded-lg font-semibold text-sm
            bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600
            disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200
            shadow-lg shadow-purple-500/20"
        >
          {training.isTraining ? '⏳ Training…' : '⚡ Train Brain'}
        </button>
      </div>

      <div className="h-px bg-white/5" />

      {/* ── Trained models list ───────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-cyan-400/70 mb-3">
          Trained Models
        </h2>
        {models.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-4">No models trained yet</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {models.map(m => (
              <button
                key={m.filename}
                onClick={() => onSelectModel(m.type as CaptchaType, m.difficulty as Difficulty)}
                className={`w-full px-3 py-2 rounded-lg text-left text-xs transition-all duration-200
                  border flex items-center justify-between gap-2 ${
                  m.type === selectedType && m.difficulty === selectedDifficulty
                    ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white'
                }`}
              >
                <div>
                  <span className="font-semibold">{m.type.replace('_', ' ')}</span>
                  <span className="ml-2 opacity-60">{m.difficulty}</span>
                  <span className="ml-2 opacity-40">n={m.n_train}</span>
                </div>
                <div className="font-mono shrink-0 text-right">
                  <div className="text-cyan-400">{m.cv_score.toFixed(3)}</div>
                  <div className="text-slate-600 text-xs">CV</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
