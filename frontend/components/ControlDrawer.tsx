'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { CaptchaType, Difficulty, TrainedModel, TrainingState } from '@/types';
import { CheckIcon, CloseIcon } from './Icons';

interface ControlDrawerProps {
  open: boolean;
  onClose: () => void;
  selectedType: CaptchaType;
  selectedDifficulty: Difficulty;
  nFlies: number;
  isBusy: boolean;
  models: TrainedModel[];
  training: TrainingState;
  onTypeChange: (t: CaptchaType) => void;
  onDifficultyChange: (d: Difficulty) => void;
  onNFliesChange: (n: number) => void;
  onTrain: (nTrain: number) => void;
  onResetStats: () => void;
}

const CHALLENGE_OPTIONS: {
  id: CaptchaType;
  code: string;
  label: string;
  pathway: string;
}[] = [
  {
    id: 'rotate',
    code: 'MOD.01',
    label: 'Orientation (Rotate)',
    pathway: 'Omnidirectional optic flow · 4-class angle readout (0°, 90°, 180°, 270°)',
  },
  {
    id: 'broken_circle',
    code: 'MOD.02',
    label: 'Annulus Gap (Broken Circle)',
    pathway: 'Central-complex sin/cos population vector · Circular mean consensus',
  },
  {
    id: 'text',
    code: 'MOD.03',
    label: 'Alphanumeric (Text)',
    pathway: 'Photoreceptor spatial luminance strip · Multi-class reservoir decoder',
  },
  {
    id: 'math',
    code: 'MOD.04',
    label: 'Arithmetic Expression (Math)',
    pathway: 'Visual projection LC10a/LC4 gradients · Expression readout',
  },
  {
    id: 'scatter',
    code: 'MOD.05',
    label: 'Chromatic Clutter (Scatter)',
    pathway: 'R7/R8 chromatic opponency pre-filter · Foreground target classifier',
  },
];

const DIFFICULTIES: { id: Difficulty; label: string; noiseSpec: string }[] = [
  { id: 'easy', label: 'EASY', noiseSpec: '3% salt/pepper' },
  { id: 'medium', label: 'MEDIUM', noiseSpec: '6% noise + 5px warp' },
  { id: 'hard', label: 'HARD', noiseSpec: '12% noise + 10px warp + tilt' },
];

const SWARM_SIZES = [1, 2, 3, 5, 8];

export default function ControlDrawer({
  open,
  onClose,
  selectedType,
  selectedDifficulty,
  nFlies,
  isBusy,
  models,
  training,
  onTypeChange,
  onDifficultyChange,
  onNFliesChange,
  onTrain,
  onResetStats,
}: ControlDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [activeTab, setActiveTab] = useState<'params' | 'lab'>('params');
  const [nTrain, setNTrain] = useState<number>(60);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };

    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      dialogRef.current.close();
    }
  };

  const exactModel = models.find(
    (m) => m.type === selectedType && m.difficulty === selectedDifficulty
  );
  const fallbackModel = models.find((m) => m.type === selectedType);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="drawer-title"
      onClick={handleBackdropClick}
      className="m-0 ml-auto h-screen w-full max-w-[420px] bg-transparent p-0 text-[#ECEEF0] open:flex"
    >
      <div className="flex h-full w-full flex-col border-l border-[#262B31] bg-[#121417] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#262B31] px-5 py-4">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-[#52B788] uppercase">
              SYS.CONFIG // MALECNS V1.0
            </div>
            <h2 id="drawer-title" className="mt-0.5 text-sm font-semibold tracking-tight text-[#ECEEF0]">
              Simulation &amp; Readout Console
            </h2>
          </div>
          <form method="dialog">
            <button
              type="submit"
              value="close"
              autoFocus
              aria-label="Close configuration console"
              className="flex h-8 w-8 items-center justify-center rounded-[2px] border border-[#262B31] bg-[#181B1F] text-[#9AA1A9] transition-colors hover:border-[#52B788] hover:text-[#ECEEF0] cursor-pointer"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>

        {/* Brutalist Segmented Tabs */}
        <div className="grid grid-cols-2 border-b border-[#262B31] bg-[#0B0C0E] p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('params')}
            className={`py-2 font-mono text-[11px] font-medium tracking-wider uppercase rounded-[2px] border transition-colors cursor-pointer ${
              activeTab === 'params'
                ? 'border-[#2D6A4F] bg-[#143325] text-[#ECEEF0]'
                : 'border-transparent text-[#9AA1A9] hover:text-[#ECEEF0]'
            }`}
          >
            01 // Parameters
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lab')}
            className={`py-2 font-mono text-[11px] font-medium tracking-wider uppercase rounded-[2px] border transition-colors cursor-pointer ${
              activeTab === 'lab'
                ? 'border-[#2D6A4F] bg-[#143325] text-[#ECEEF0]'
                : 'border-transparent text-[#9AA1A9] hover:text-[#ECEEF0]'
            }`}
          >
            02 // Readout Lab
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {activeTab === 'params' ? (
            <>
              {/* Challenge Modality */}
              <section>
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold tracking-wider text-[#9AA1A9] uppercase">
                    Stimulus Modality
                  </span>
                  <span className="font-mono text-[10px] text-[#636B74]">5 ACTIVE HEADS</span>
                </div>
                <div className="space-y-1.5">
                  {CHALLENGE_OPTIONS.map((opt) => {
                    const active = selectedType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isBusy}
                        onClick={() => onTypeChange(opt.id)}
                        className={`w-full text-left p-3 rounded-[2px] border transition-all cursor-pointer disabled:opacity-50 ${
                          active
                            ? 'border-[#2D6A4F] bg-[#143325]/70'
                            : 'border-[#262B31] bg-[#181B1F]/60 hover:border-[#343B44]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-[#52B788]">{opt.code}</span>
                            <span className="text-xs font-semibold text-[#ECEEF0]">{opt.label}</span>
                          </div>
                          {active && (
                            <span className="flex h-4 w-4 items-center justify-center rounded-[2px] bg-[#1B4332] text-[#52B788]">
                              <CheckIcon className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                        <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#9AA1A9]">
                          {opt.pathway}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Distortion Severity */}
              <section>
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold tracking-wider text-[#9AA1A9] uppercase">
                    Distortion Tier
                  </span>
                  <span className="font-mono text-[10px] text-[#52B788]">
                    {DIFFICULTIES.find((d) => d.id === selectedDifficulty)?.noiseSpec}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {DIFFICULTIES.map((d) => {
                    const active = selectedDifficulty === d.id;
                    const isHard = d.id === 'hard';
                    return (
                      <button
                        key={d.id}
                        type="button"
                        disabled={isBusy}
                        onClick={() => onDifficultyChange(d.id)}
                        className={`py-2.5 px-2 rounded-[2px] font-mono text-xs font-semibold tracking-wider border transition-all cursor-pointer disabled:opacity-50 ${
                          active
                            ? isHard
                              ? 'border-[#B91C1C] bg-[#2A0A0E] text-[#FCA5A5]'
                              : 'border-[#2D6A4F] bg-[#1B4332] text-[#ECEEF0]'
                            : 'border-[#262B31] bg-[#181B1F] text-[#9AA1A9] hover:border-[#343B44] hover:text-[#ECEEF0]'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Ensemble Size (Spec §8.2 Ablation Sizes) */}
              <section>
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold tracking-wider text-[#9AA1A9] uppercase">
                    Swarm Ensemble Size
                  </span>
                  <span className="font-mono text-xs font-semibold text-[#52B788] tabular-nums">
                    N = {nFlies} {nFlies === 1 ? 'AGENT (BASELINE)' : 'AGENTS'}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {SWARM_SIZES.map((count) => {
                    const active = nFlies === count;
                    return (
                      <button
                        key={count}
                        type="button"
                        disabled={isBusy}
                        onClick={() => onNFliesChange(count)}
                        className={`py-2 rounded-[2px] font-mono text-xs font-semibold tabular-nums border transition-all cursor-pointer disabled:opacity-50 ${
                          active
                            ? 'border-[#2D6A4F] bg-[#1B4332] text-[#ECEEF0]'
                            : 'border-[#262B31] bg-[#181B1F] text-[#9AA1A9] hover:border-[#343B44] hover:text-[#ECEEF0]'
                        }`}
                      >
                        {count}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 font-mono text-[10px] leading-relaxed text-[#636B74]">
                  N=1 runs the single-fly baseline. N&ge;2 feeds independent distortions per fly and pools confidence-weighted votes.
                </p>
              </section>

              {/* Readout Readiness Status */}
              <section className="rounded-[2px] border border-[#262B31] bg-[#0B0C0E] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-wider text-[#9AA1A9] uppercase">
                    Active Readout Weights
                  </span>
                  <span
                    className={`font-mono text-[10px] font-semibold uppercase ${
                      exactModel
                        ? 'text-[#52B788]'
                        : fallbackModel
                        ? 'text-[#ECEEF0]'
                        : 'text-[#F87171]'
                    }`}
                  >
                    {exactModel
                      ? 'EXACT MATCH READY'
                      : fallbackModel
                      ? `COMPATIBLE (${fallbackModel.difficulty.toUpperCase()})`
                      : 'NOT FOUND'}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-[#636B74]">
                  {exactModel
                    ? `${exactModel.filename} · n=${exactModel.n_train} · CV=${exactModel.cv_score.toFixed(3)}`
                    : fallbackModel
                    ? `Evaluating ${selectedDifficulty} stimuli against ${fallbackModel.filename}`
                    : 'Switch to Readout Lab tab to fit a new connectome readout.'}
                </div>
              </section>

              {/* Reset Session Metrics */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onResetStats}
                  className="w-full py-2 rounded-[2px] border border-[#262B31] bg-[#181B1F] font-mono text-[11px] tracking-wider text-[#9AA1A9] uppercase hover:border-[#B91C1C] hover:text-[#FCA5A5] transition-colors cursor-pointer"
                >
                  Reset Session Telemetry Counters
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Live Connectome Training */}
              <section className="rounded-[2px] border border-[#262B31] bg-[#181B1F]/60 p-4">
                <div className="font-mono text-[11px] font-semibold tracking-wider text-[#52B788] uppercase">
                  Fit Biological Readout Head
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#9AA1A9]">
                  Streams <span className="font-mono text-[#ECEEF0]">{selectedType}</span> ({selectedDifficulty}) stimuli through photoreceptors &amp; MaleCNS v1.0 for 160ms per sample, then fits a cross-validated PCA + Ridge readout on descending &amp; central-brain spike traces.
                </p>

                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between font-mono text-xs">
                    <span className="text-[#9AA1A9]">Training Samples</span>
                    <span className="text-[#52B788] font-semibold tabular-nums">{nTrain} trials</span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={200}
                    step={10}
                    value={nTrain}
                    disabled={training.isTraining}
                    onChange={(e) => setNTrain(Number(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-[#636B74]">
                    <span>20 (~25s)</span>
                    <span>200 (~4m)</span>
                  </div>
                </div>

                {training.isTraining && (
                  <div className="mt-4 rounded-[2px] border border-[#262B31] bg-[#0B0C0E] p-3">
                    <div className="flex justify-between font-mono text-[11px] mb-1.5">
                      <span className="truncate pr-2 text-[#ECEEF0]">{training.message}</span>
                      <span className="text-[#52B788] tabular-nums">
                        {Math.round(training.progress * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-[#181B1F] overflow-hidden">
                      <div
                        className="h-full bg-[#52B788] transition-all duration-300"
                        style={{ width: `${Math.round(training.progress * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {!training.isTraining && training.message && (
                  <div
                    className={`mt-3 rounded-[2px] border p-2.5 font-mono text-[11px] ${
                      training.message.startsWith('Error')
                        ? 'border-[#7F1D1D] bg-[#2A0A0E] text-[#FCA5A5]'
                        : 'border-[#2D6A4F] bg-[#0D2118] text-[#52B788]'
                    }`}
                  >
                    {training.message}
                  </div>
                )}

                <button
                  type="button"
                  disabled={training.isTraining || isBusy}
                  onClick={() => onTrain(nTrain)}
                  className="brutal-cta mt-4 w-full py-2.5 font-mono text-xs font-semibold tracking-wider uppercase cursor-pointer"
                >
                  {training.isTraining
                    ? 'COLLECTING SPIKE TRACES...'
                    : `TRAIN ${selectedType.toUpperCase()} (${selectedDifficulty.toUpperCase()})`}
                </button>
              </section>

              {/* Serialized Model Registry */}
              <section>
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold tracking-wider text-[#9AA1A9] uppercase">
                    Serialized Readout Registry
                  </span>
                  <span className="font-mono text-[10px] text-[#636B74] tabular-nums">
                    {models.length} MODELS
                  </span>
                </div>

                {models.length === 0 ? (
                  <div className="rounded-[2px] border border-[#262B31] bg-[#0B0C0E] py-6 text-center font-mono text-xs text-[#636B74]">
                    No readout models detected on server.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {models.map((m) => {
                      const selected =
                        m.type === selectedType && m.difficulty === selectedDifficulty;
                      return (
                        <button
                          key={m.filename}
                          type="button"
                          onClick={() => {
                            onTypeChange(m.type);
                            onDifficultyChange(m.difficulty);
                          }}
                          className={`w-full flex items-center justify-between p-2.5 rounded-[2px] border text-left font-mono transition-colors cursor-pointer ${
                            selected
                              ? 'border-[#2D6A4F] bg-[#143325]/70 text-[#ECEEF0]'
                              : 'border-[#262B31] bg-[#0B0C0E] text-[#9AA1A9] hover:border-[#343B44] hover:text-[#ECEEF0]'
                          }`}
                        >
                          <div>
                            <div className="text-xs font-semibold uppercase">
                              {m.type.replace('_', ' ')}{' '}
                              <span className="text-[#52B788]">[{m.difficulty}]</span>
                            </div>
                            <div className="text-[10px] text-[#636B74] mt-0.5">
                              {m.filename} · n={m.n_train}
                            </div>
                          </div>
                          <div className="text-right tabular-nums">
                            <div className="text-xs font-semibold text-[#ECEEF0]">
                              {m.cv_score.toFixed(3)}
                            </div>
                            <div className="text-[9px] text-[#636B74] uppercase">CV SCORE</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#262B31] bg-[#0B0C0E] px-5 py-3 flex items-center justify-between font-mono text-[10px] text-[#636B74]">
          <span>166,700 NEURONS · 25.58M SYNAPSES</span>
          <span className="text-[#52B788]">ESC TO CLOSE</span>
        </div>
      </div>
    </dialog>
  );
}
