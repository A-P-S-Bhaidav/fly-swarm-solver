'use client';

import dynamic from 'next/dynamic';
import React, { useState, useEffect, useRef } from 'react';
import { useInference } from '@/hooks/useInference';
import type { CaptchaType, Difficulty } from '@/types';

// Dynamic import of the Full-Screen 3D Fly Arena Scene
const FlyArenaScene = dynamic(() => import('@/components/FlyArenaScene'), { ssr: false });

const CHALLENGE_TYPES: { id: CaptchaType; label: string; desc: string }[] = [
  { id: 'rotate', label: 'Rotate Arrow', desc: 'Orientation detection (0°, 90°, 180°, 270°)' },
  { id: 'broken_circle', label: 'Broken Circle', desc: 'Gap angle detection (0°–360° continuous)' },
  { id: 'text', label: 'Alphanumeric Text', desc: 'Distorted 5-letter word identification' },
  { id: 'math', label: 'Math Equation', desc: 'Arithmetic calculation (e.g. 7+3=)' },
  { id: 'scatter', label: 'Scatter Noise', desc: 'Target word filtered from scatter background' },
];

export default function HomePage() {
  // ── Config State ──────────────────────────────────────────────────────────
  const [selectedType, setSelectedType] = useState<CaptchaType>('rotate');
  const [selectedDiff, setSelectedDiff] = useState<Difficulty>('medium');
  const [nFlies, setNFlies] = useState(5);
  const [activeFlyIndex, setActiveFlyIndex] = useState<number | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [initialCaptchaB64, setInitialCaptchaB64] = useState<string | null>(null);

  // ── Inference Hook ────────────────────────────────────────────────────────
  const { isRunning, isConnected, currentFrame, lastResult, activeChallenge, runOnce, stop } = useInference();

  // Load an initial real CAPTCHA image so the central board is immediately visible on first load!
  useEffect(() => {
    async function loadSample() {
      try {
        const res = await fetch(`http://localhost:8000/captcha/sample?type=${selectedType}&difficulty=${selectedDiff}`);
        if (res.ok) {
          const data = await res.json();
          if (data.captcha_b64) {
            setInitialCaptchaB64(data.captcha_b64);
          }
        }
      } catch {
        // Fallback silently if server starting
      }
    }
    loadSample();
  }, [selectedType, selectedDiff]);

  // ── Auto-Run Loop ─────────────────────────────────────────────────────────
  const autoRef = useRef(false);
  autoRef.current = autoRunning;

  useEffect(() => {
    if (!autoRunning || isRunning) return;
    const timer = setTimeout(() => {
      if (autoRef.current && isConnected) {
        runOnce(selectedType, selectedDiff, nFlies);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [autoRunning, isRunning, isConnected, selectedType, selectedDiff, nFlies, runOnce, lastResult]);

  const handleRun = () => {
    runOnce(selectedType, selectedDiff, nFlies);
  };

  const handleAutoToggle = () => {
    if (autoRunning) {
      setAutoRunning(false);
      stop();
    } else {
      setAutoRunning(true);
      runOnce(selectedType, selectedDiff, nFlies);
    }
  };

  const currentTypeMeta = CHALLENGE_TYPES.find((t) => t.id === selectedType);
  const displayImage = activeChallenge?.captchaB64 || lastResult?.captchaB64 || initialCaptchaB64;

  return (
    <div className="fixed inset-0 w-screen h-screen bg-[#02040a] text-slate-100 font-sans select-none overflow-hidden">
      {/* ── Floating Top-Left Brand Overlay (Clean Research Instrument Badge) ── */}
      <div className="absolute top-4 left-4 z-30 pointer-events-auto flex items-center gap-3 bg-[#0b0f19]/90 backdrop-blur-xl px-3.5 py-2 rounded-xl border border-slate-800 shadow-xl">
        <div className="w-7 h-7 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center text-sm shadow-inner">
          🪰
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xs font-semibold font-mono tracking-wide text-slate-100">
              FlySwarm Connectome
            </h1>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 font-medium">
              MaleCNS v1.0
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">
            139,662 Neurons • Janelia Research Campus
          </p>
        </div>
      </div>

      {/* ── Floating Top-Right Controls Overlay (Solve Challenge + Hamburger) ── */}
      <div className="absolute top-4 right-4 z-30 pointer-events-auto flex items-center gap-2.5">

        {/* The prominent Solve Challenge button (Clean, professional high-contrast) */}
        <button
          onClick={handleRun}
          disabled={isRunning || !isConnected}
          className={`px-4 py-2 rounded-xl font-mono font-semibold text-xs transition-all shadow-xl cursor-pointer flex items-center gap-2 ${
            isRunning
              ? 'bg-slate-800 text-slate-300 border border-slate-700 cursor-wait animate-pulse'
              : 'bg-white hover:bg-slate-150 text-slate-950 shadow-sm hover:scale-[1.02] active:scale-[0.98]'
          }`}
        >
          <span className="text-sm">{isRunning ? '⚡' : '▶'}</span>
          <span>{isRunning ? 'Propagating Synapses...' : 'Solve Challenge'}</span>
        </button>

        {/* Hamburger Menu Toggle Button */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="w-9 h-9 rounded-xl bg-[#0b0f19]/90 hover:bg-[#131b2e] backdrop-blur-xl border border-slate-800 flex items-center justify-center text-slate-300 transition-all cursor-pointer shadow-xl"
          title="Open Swarm & Challenge Settings"
        >
          {menuOpen ? (
            <span className="text-sm font-bold font-mono">✕</span>
          ) : (
            <span className="text-lg">☰</span>
          )}
        </button>
      </div>

      {/* ── Slide-Out Drawer / Modal for Challenge & Swarm Settings ─────────── */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-[#060b17]/95 backdrop-blur-2xl border-l border-slate-800 h-full p-6 flex flex-col justify-between overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                  Swarm & Solver Settings
                </span>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs font-mono"
                >
                  ✕
                </button>
              </div>

              {/* Challenge Type Selector */}
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-mono font-semibold text-slate-300 uppercase tracking-wider">
                  Challenge Type
                </label>
                <div className="flex flex-col gap-1.5">
                  {CHALLENGE_TYPES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setSelectedType(t.id);
                        setMenuOpen(false);
                      }}
                      className={`px-3 py-2 rounded-xl text-left font-mono text-xs transition-all border cursor-pointer ${
                        selectedType === t.id
                          ? 'bg-slate-800 border-slate-600 text-white font-semibold shadow-md'
                          : 'bg-white/5 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      <div className="font-semibold">{t.label}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty Selector */}
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-mono font-semibold text-slate-300 uppercase tracking-wider">
                  Distortion Difficulty
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['easy', 'medium', 'hard'] as Difficulty[]).map((diff) => (
                    <button
                      key={diff}
                      onClick={() => setSelectedDiff(diff)}
                      className={`py-1.5 rounded-lg text-xs font-mono font-semibold uppercase transition-all border cursor-pointer ${
                        selectedDiff === diff
                          ? 'bg-slate-700 text-white border-slate-500'
                          : 'bg-white/5 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>

              {/* Swarm Size Selector */}
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-mono font-semibold text-slate-300 uppercase tracking-wider">
                  Drosophila Swarm Size ({nFlies} Flies)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 3, 5, 8].map((count) => (
                    <button
                      key={count}
                      onClick={() => setNFlies(count)}
                      className={`py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border cursor-pointer ${
                        nFlies === count
                          ? 'bg-slate-700 text-white border-slate-500'
                          : 'bg-white/5 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {count} {count === 1 ? 'Fly' : 'Flies'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-Run Continuous Mode */}
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-mono font-semibold text-slate-300 uppercase tracking-wider">
                  Autonomous Mode
                </label>
                <button
                  onClick={handleAutoToggle}
                  className={`w-full py-2 rounded-xl text-xs font-mono font-semibold border transition-all cursor-pointer ${
                    autoRunning
                      ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                      : 'bg-white/5 border-slate-800 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {autoRunning ? '■ Stop Continuous Auto-Run' : '▶ Enable Continuous Auto-Run'}
                </button>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4 flex flex-col gap-1 text-[11px] font-mono text-slate-500">
              <span>Active: {currentTypeMeta?.label}</span>
              <span>Difficulty: {selectedDiff.toUpperCase()}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── 100% FULL-SCREEN 3D ARENA CANVAS (ZERO WASTED NAVBAR SPACE!) ─────── */}
      <main className="w-full h-full">
        <FlyArenaScene
          isSolving={isRunning}
          result={lastResult}
          activeFlyIndex={activeFlyIndex}
          nFlies={nFlies}
          captchaB64={displayImage}
          captchaType={selectedType}
          spikeRate={currentFrame?.spikeRate || 0}
          firedNeurons={currentFrame?.firedNeurons || []}
          flyFired={currentFrame?.flyFired || []}
          onSelectFly={setActiveFlyIndex}
        />
      </main>
    </div>
  );
}
