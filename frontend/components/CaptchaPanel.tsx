'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { NeuralFrame, RunResult } from '@/types';

interface CaptchaPanelProps {
  frame: NeuralFrame | null;
  result: RunResult | null;
  isRunning: boolean;
  isConnected: boolean;
  onRun: () => void;
  onAuto: () => void;
  onStop: () => void;
  autoRunning: boolean;
  sessionStats: { totalRuns: number; swarmCorrect: number; singleCorrect: number };
}

export default function CaptchaPanel({
  frame, result, isRunning, isConnected,
  onRun, onAuto, onStop, autoRunning, sessionStats,
}: CaptchaPanelProps) {
  const [displayedAnswer, setDisplayedAnswer] = useState('');

  // Animate answer reveal character by character
  useEffect(() => {
    if (!result) { setDisplayedAnswer(''); return; }
    setDisplayedAnswer('');
    const chars = result.swarmAnswer.split('');
    chars.forEach((ch, i) => {
      setTimeout(() => {
        setDisplayedAnswer(prev => prev + ch);
      }, i * 120);
    });
  }, [result]);

  const progress = frame ? Math.round((frame.step / frame.total) * 100) : 0;
  const swarmAcc = sessionStats.totalRuns > 0
    ? ((sessionStats.swarmCorrect / sessionStats.totalRuns) * 100).toFixed(1)
    : '—';

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* CAPTCHA image */}
      <div className="glass rounded-xl p-4 flex flex-col items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-cyan-400/70 self-start">
          CAPTCHA Challenge
        </h2>

        <div className="w-full flex items-center justify-center min-h-[100px] rounded-lg bg-white/5 border border-white/10 overflow-hidden">
          {result ? (
            <img
              src={`data:image/png;base64,${result.captchaB64}`}
              alt="CAPTCHA"
              className="max-h-[100px] object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <div className="text-center text-slate-500">
              <div className="text-3xl mb-1">🔍</div>
              <div className="text-xs">Run inference to see a CAPTCHA</div>
            </div>
          )}
        </div>

        {/* Brain processing progress bar */}
        {isRunning && (
          <div className="w-full">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Brain processing…</span>
              <span className="font-mono text-cyan-400">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full transition-all duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>
            {frame && (
              <div className="mt-1 text-right text-xs font-mono text-cyan-300/50">
                spike rate: {frame.spikeRate.toFixed(4)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Answer cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Swarm Answer', value: displayedAnswer || '—', highlight: result?.correct },
          { label: 'Ground Truth', value: result?.groundTruth ?? '—', highlight: null },
          {
            label: 'Result',
            value: result ? (result.correct ? '✅ Correct' : '❌ Wrong') : '—',
            highlight: result?.correct,
          },
        ].map(({ label, value, highlight }) => (
          <div
            key={label}
            className={`glass rounded-xl p-3 flex flex-col items-center gap-1 transition-all duration-300 ${
              highlight === true ? 'border-green-400/40 shadow-green-400/10 shadow-lg' :
              highlight === false ? 'border-red-400/40 shadow-red-400/10 shadow-lg' : ''
            }`}
          >
            <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
            <div className={`font-mono font-semibold text-lg leading-none ${
              highlight === true ? 'text-green-400' :
              highlight === false ? 'text-red-400' : 'text-white'
            }`}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Session stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { val: sessionStats.totalRuns, label: 'runs' },
          { val: sessionStats.swarmCorrect, label: 'swarm ✓' },
          { val: sessionStats.singleCorrect, label: 'single ✓' },
          { val: `${swarmAcc}%`, label: 'swarm acc' },
        ].map(({ val, label }) => (
          <div key={label} className="glass rounded-lg p-2 text-center">
            <div className="text-base font-bold font-mono text-cyan-400">{val}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={onRun}
          disabled={!isConnected || isRunning}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm
            bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500
            disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200
            shadow-lg shadow-cyan-500/20"
        >
          ▶ Run Live
        </button>
        <button
          onClick={autoRunning ? onStop : onAuto}
          disabled={!isConnected || isRunning}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm
            transition-all duration-200 ${
            autoRunning
              ? 'bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30'
              : 'bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
        >
          {autoRunning ? '■ Stop Auto' : '⟳ Auto'}
        </button>
      </div>

      {/* Connection badge */}
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-xs text-slate-500">
          {isConnected ? 'Connected to FlyBrain server' : 'Disconnected — start the server'}
        </span>
      </div>
    </div>
  );
}
