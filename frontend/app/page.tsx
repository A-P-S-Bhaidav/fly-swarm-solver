'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { API_BASE_URL } from '@/lib/endpoints';
import { useInference } from '@/hooks/useInference';
import { useTraining } from '@/hooks/useTraining';
import ControlDrawer from '@/components/ControlDrawer';
import {
  AlertIcon,
  BrandMark,
  CheckIcon,
  LoopIcon,
  OrbitIcon,
  PlayIcon,
  RefreshIcon,
  SlidersIcon,
  StopIcon,
} from '@/components/Icons';
import type { CameraPreset, CaptchaType, Difficulty } from '@/types';

const FlyArenaScene = dynamic(() => import('@/components/FlyArenaScene'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#0B0C0E] gap-3">
      <div className="w-5 h-5 border-2 border-[#262B31] border-t-[#52B788] rounded-full animate-spin" />
      <span className="font-mono text-[11px] tracking-[0.2em] text-[#9AA1A9] uppercase">
        Initializing 3D MaleCNS v1.0 Connectome...
      </span>
    </div>
  ),
});

function formatOutput(val: string | number | null | undefined, type: CaptchaType): string {
  if (val === null || val === undefined || val === '') return '—';
  const str = String(val).trim();
  if (str.toUpperCase() === 'UNSOLVED') return 'ABSTAINED';
  const num = parseFloat(str);
  if (!Number.isNaN(num) && type === 'broken_circle') {
    return `${num.toFixed(1)}°`;
  }
  if (!Number.isNaN(num) && type === 'rotate') {
    return `${Math.round(num)}°`;
  }
  return str;
}

const CAMERA_LABELS: { id: CameraPreset; label: string }[] = [
  { id: 'arena', label: 'ARENA' },
  { id: 'swarm', label: 'SWARM' },
  { id: 'connectome', label: 'BRAIN' },
];

export default function HomePage() {
  const [selectedType, setSelectedType] = useState<CaptchaType>('rotate');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('medium');
  const [nFlies, setNFlies] = useState<number>(5);
  const [activeFlyIndex, setActiveFlyIndex] = useState<number | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('arena');
  const [autoRunning, setAutoRunning] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sampleCaptchaB64, setSampleCaptchaB64] = useState<string | null>(null);

  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    isRunning,
    isConnected,
    currentFrame,
    lastResult,
    activeChallenge,
    sessionStats,
    error,
    runOnce,
    stop,
    reconnect,
    resetStats,
  } = useInference();

  const { training, models, startTraining } = useTraining();

  const fetchSamplePreview = useCallback((type: CaptchaType, difficulty: Difficulty) => {
    setSampleCaptchaB64(null);
    fetch(`${API_BASE_URL}/captcha/sample?type=${type}&difficulty=${difficulty}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { captcha_b64?: string } | null) => {
        if (data?.captcha_b64) {
          setSampleCaptchaB64(data.captcha_b64);
        }
      })
      .catch(() => {
        // Offline handled via WS connection state
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/captcha/sample?type=${selectedType}&difficulty=${selectedDifficulty}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { captcha_b64?: string } | null) => {
        if (!cancelled && data?.captcha_b64) {
          setSampleCaptchaB64(data.captcha_b64);
        }
      })
      .catch(() => {
        // Offline handled via WS connection state
      });
    return () => {
      cancelled = true;
    };
  }, [selectedType, selectedDifficulty]);

  const handleRun = useCallback(() => {
    runOnce(selectedType, selectedDifficulty, nFlies);
  }, [runOnce, selectedType, selectedDifficulty, nFlies]);

  const handleStopAll = useCallback(() => {
    setAutoRunning(false);
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    stop();
  }, [stop]);

  const toggleAuto = useCallback(() => {
    if (autoRunning) {
      handleStopAll();
    } else {
      setAutoRunning(true);
      runOnce(selectedType, selectedDifficulty, nFlies);
    }
  }, [autoRunning, handleStopAll, runOnce, selectedType, selectedDifficulty, nFlies]);

  // Continuous loop trigger when previous run settles
  useEffect(() => {
    if (autoRunning && !isRunning) {
      autoTimerRef.current = setTimeout(() => {
        runOnce(selectedType, selectedDifficulty, nFlies);
      }, 1800);
    }
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, [autoRunning, isRunning, runOnce, selectedType, selectedDifficulty, nFlies]);

  // Spacebar shortcut when idle and drawer closed
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (drawerOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space' && isConnected && !isRunning) {
        e.preventDefault();
        handleRun();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, isConnected, isRunning, handleRun]);

  // Reset activeFlyIndex if nFlies shrinks below it
  const safeActiveFlyIndex =
    activeFlyIndex !== null && activeFlyIndex >= nFlies ? null : activeFlyIndex;

  const displayCaptchaB64 = isRunning
    ? activeChallenge?.captchaB64 || sampleCaptchaB64
    : lastResult &&
      activeChallenge?.type === selectedType &&
      activeChallenge?.difficulty === selectedDifficulty
    ? lastResult.captchaB64
    : sampleCaptchaB64;

  const stepProgress = currentFrame
    ? Math.round((currentFrame.step / Math.max(1, currentFrame.total)) * 100)
    : 0;

  const activeNeuronCount =
    safeActiveFlyIndex !== null
      ? currentFrame?.flyFired?.[safeActiveFlyIndex]?.length ?? 0
      : currentFrame?.flyFired?.reduce((acc, f) => acc + f.length, 0) ??
        currentFrame?.firedNeurons?.length ??
        0;

  const swarmAcc =
    sessionStats.totalRuns > 0
      ? ((sessionStats.swarmCorrect / sessionStats.totalRuns) * 100).toFixed(0)
      : null;
  const singleAcc =
    sessionStats.totalRuns > 0
      ? ((sessionStats.singleCorrect / sessionStats.totalRuns) * 100).toFixed(0)
      : null;
  const swarmDelta =
    sessionStats.totalRuns > 0
      ? Math.round(
          ((sessionStats.swarmCorrect - sessionStats.singleCorrect) / sessionStats.totalRuns) * 100
        )
      : null;

  const showResultForSelection =
    lastResult &&
    (!activeChallenge ||
      (activeChallenge.type === selectedType && activeChallenge.difficulty === selectedDifficulty))
      ? lastResult
      : null;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0B0C0E] text-[#ECEEF0]">
      {/* ── FULL-VIEWPORT 3D SPATIAL ARENA ─────────────────────────────────── */}
      <div className="absolute inset-0 z-0">
        <FlyArenaScene
          isSolving={isRunning}
          result={showResultForSelection ? lastResult : null}
          activeFlyIndex={safeActiveFlyIndex}
          nFlies={nFlies}
          captchaB64={displayCaptchaB64}
          captchaType={selectedType}
          spikeRate={currentFrame?.spikeRate || 0}
          firedNeurons={currentFrame?.firedNeurons || []}
          flyFired={currentFrame?.flyFired || []}
          cameraPreset={cameraPreset}
        />
      </div>

      {/* ── TOP SPATIAL HUD BAR ────────────────────────────────────────────── */}
      <header className="pointer-events-none absolute top-0 left-0 right-0 z-20 flex flex-wrap items-start justify-between gap-3 p-3.5 md:p-5">
        {/* Top-Left: System Brand & Connection Telemetry */}
        <div className="pointer-events-auto spatial-panel brutal-reticle flex items-center gap-3 px-3.5 py-2.5">
          <BrandMark className="h-7 w-7 shrink-0" />
          <div className="border-r border-[#262B31] pr-3">
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-xs font-bold tracking-[0.16em] text-[#ECEEF0] uppercase">
                FLYSWARM
              </h1>
              <span className="rounded-[2px] border border-[#2D6A4F] bg-[#143325] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#52B788]">
                MALECNS V1.0
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[10px] text-[#9AA1A9]">
              166,700 NEURONS · 25.58M SYNAPSES
            </p>
          </div>

          <div className="flex items-center gap-2 pl-0.5">
            <span
              className={`h-2 w-2 rounded-[1px] ${
                isConnected
                  ? isRunning
                    ? 'bg-[#DC2626] animate-synapse'
                    : 'bg-[#52B788]'
                  : 'bg-[#DC2626]'
              }`}
            />
            <div className="font-mono text-[10px] uppercase">
              <div className={isConnected ? 'text-[#ECEEF0] font-semibold' : 'text-[#FCA5A5]'}>
                {isConnected ? (isRunning ? 'PROPAGATING' : 'SYS.ONLINE') : 'DISCONNECTED'}
              </div>
              <div className="text-[9px] text-[#636B74]">DT=20MS · 160MS</div>
            </div>
          </div>
        </div>

        {/* Top-Center: Agent Trace Selector + Spatial Camera Rig */}
        <div className="pointer-events-auto spatial-panel hidden lg:flex items-center divide-x divide-[#262B31] px-1.5 py-1">
          {/* Agent Selector */}
          <div className="flex items-center gap-1 pr-2">
            <button
              type="button"
              onClick={() => setActiveFlyIndex(null)}
              className={`px-2.5 py-1.5 rounded-[2px] font-mono text-[11px] font-semibold tracking-wider uppercase transition-colors cursor-pointer ${
                safeActiveFlyIndex === null
                  ? 'bg-[#1B4332] text-[#ECEEF0] border border-[#2D6A4F]'
                  : 'text-[#9AA1A9] hover:text-[#ECEEF0] border border-transparent'
              }`}
            >
              ENSEMBLE [{nFlies}]
            </button>
            {Array.from({ length: nFlies }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveFlyIndex(i)}
                title={`Inspect Fly Agent 0${i + 1} connectome trace`}
                className={`px-2 py-1.5 rounded-[2px] font-mono text-[11px] tabular-nums transition-colors cursor-pointer ${
                  safeActiveFlyIndex === i
                    ? 'bg-[#1B4332] text-[#52B788] border border-[#2D6A4F] font-semibold'
                    : 'text-[#9AA1A9] hover:text-[#ECEEF0] border border-transparent'
                }`}
              >
                0{i + 1}
              </button>
            ))}
          </div>

          {/* Camera Presets */}
          <div className="flex items-center gap-1 pl-2">
            <OrbitIcon className="h-3.5 w-3.5 text-[#636B74] mx-1" />
            {CAMERA_LABELS.map((cam) => (
              <button
                key={cam.id}
                type="button"
                onClick={() => setCameraPreset(cam.id)}
                className={`px-2 py-1.5 rounded-[2px] font-mono text-[10px] tracking-wider uppercase transition-colors cursor-pointer ${
                  cameraPreset === cam.id
                    ? 'bg-[#181B1F] text-[#52B788] border border-[#262B31]'
                    : 'text-[#636B74] hover:text-[#ECEEF0]'
                }`}
              >
                {cam.label}
              </button>
            ))}
          </div>
        </div>

        {/* Top-Right: Execution & Console Triggers */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleRun}
            disabled={!isConnected || isRunning || autoRunning}
            className="brutal-cta flex items-center gap-2 px-4 py-2.5 font-mono text-xs font-semibold tracking-wider uppercase cursor-pointer"
          >
            {isRunning && !autoRunning ? (
              <>
                <span className="h-2 w-2 rounded-[1px] bg-[#DC2626] animate-synapse" />
                <span>SOLVING...</span>
              </>
            ) : (
              <>
                <PlayIcon className="h-3 w-3 text-[#52B788]" />
                <span>EXECUTE SWARM</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={toggleAuto}
            disabled={!isConnected}
            title="Toggle continuous swarm benchmark loop"
            className={`spatial-panel flex items-center gap-1.5 px-3 py-2.5 font-mono text-xs font-semibold tracking-wider uppercase transition-colors cursor-pointer disabled:opacity-45 ${
              autoRunning
                ? 'border-[#B91C1C]! bg-[#2A0A0E]! text-[#FCA5A5]'
                : 'text-[#9AA1A9] hover:border-[#2D6A4F]! hover:text-[#ECEEF0]'
            }`}
          >
            {autoRunning ? (
              <>
                <StopIcon className="h-3 w-3 text-[#DC2626]" />
                <span>STOP</span>
              </>
            ) : (
              <>
                <LoopIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">LOOP</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open simulation and readout console"
            className="spatial-panel flex items-center gap-2 px-3 py-2.5 font-mono text-xs font-medium tracking-wider text-[#ECEEF0] uppercase hover:border-[#52B788]! transition-colors cursor-pointer"
          >
            <SlidersIcon className="h-3.5 w-3.5 text-[#52B788]" />
            <span className="hidden md:inline">CONSOLE</span>
          </button>
        </div>
      </header>

      {/* ── CONNECTION / ERROR DIAGNOSTIC BANNER (WHEN NEEDED) ─────────────── */}
      {(!isConnected || error) && (
        <div className="pointer-events-auto absolute top-20 left-1/2 -translate-x-1/2 z-20 spatial-panel brutal-reticle brutal-reticle-crimson flex items-center gap-3 px-4 py-2 border-[#7F1D1D]! bg-[#2A0A0E]/90!">
          <AlertIcon className="h-4 w-4 shrink-0 text-[#F87171]" />
          <span className="font-mono text-[11px] text-[#ECEEF0]">
            {error || 'Connecting to FlyBrain inference server (cloud container may be waking)...'}
          </span>
          <button
            type="button"
            onClick={reconnect}
            className="rounded-[2px] border border-[#B91C1C] bg-[#181B1F] px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider text-[#FCA5A5] uppercase hover:bg-[#7F1D1D]/40 cursor-pointer"
          >
            RETRY
          </button>
        </div>
      )}

      {/* ── BOTTOM SPATIAL HUD MODULES ─────────────────────────────────────── */}
      <section className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex flex-col md:flex-row items-stretch md:items-end justify-between gap-3 p-3.5 md:p-5">
        {/* Bottom-Left: 01 // STIMULUS & PHOTORECEPTOR TELEMETRY */}
        <div className="pointer-events-auto spatial-panel brutal-reticle w-full md:w-[356px] p-3.5">
          <div className="flex items-center justify-between border-b border-[#262B31] pb-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-semibold tracking-widest text-[#52B788] uppercase">
                01 // STIMULUS
              </span>
              <span className="font-mono text-[10px] text-[#636B74] uppercase">
                [{selectedType.replace('_', ' ')} · {selectedDifficulty}]
              </span>
            </div>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => fetchSamplePreview(selectedType, selectedDifficulty)}
              title="Sample new preview stimulus"
              className="text-[#9AA1A9] hover:text-[#52B788] disabled:opacity-40 transition-colors cursor-pointer"
            >
              <RefreshIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-3.5">
            {/* High-Contrast Stimulus Plate */}
            <div className="relative h-20 w-28 shrink-0 rounded-[2px] border border-[#262B31] bg-[#0B0C0E] flex items-center justify-center p-1.5 overflow-hidden">
              {displayCaptchaB64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${displayCaptchaB64}`}
                  alt={`${selectedType} CAPTCHA stimulus`}
                  className="max-h-full max-w-full object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                <span className="font-mono text-[10px] text-[#636B74] uppercase">
                  {isConnected ? 'LOADING...' : 'OFFLINE'}
                </span>
              )}
            </div>

            {/* Live Biophysical Readout */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-[#9AA1A9] uppercase">
                  {isRunning
                    ? `STEP 0${currentFrame?.step ?? 1}/0${currentFrame?.total ?? 8}`
                    : 'INTEGRATION WINDOW'}
                </span>
                <span className="text-[#52B788] font-semibold tabular-nums">
                  {isRunning ? `${stepProgress}%` : '160 MS'}
                </span>
              </div>

              <div className="h-1.5 w-full bg-[#181B1F] overflow-hidden">
                <div
                  className={`h-full transition-all duration-150 ${
                    isRunning ? 'bg-[#DC2626]' : 'bg-[#2D6A4F]'
                  }`}
                  style={{ width: `${isRunning ? stepProgress : showResultForSelection ? 100 : 0}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-0.5 font-mono">
                <div className="rounded-[2px] border border-[#262B31] bg-[#0B0C0E] px-2 py-1">
                  <div className="text-[9px] text-[#636B74] uppercase">SPIKE RATE</div>
                  <div className="text-[11px] font-semibold text-[#ECEEF0] tabular-nums">
                    {currentFrame ? currentFrame.spikeRate.toFixed(4) : '0.0000'}
                  </div>
                </div>
                <div className="rounded-[2px] border border-[#262B31] bg-[#0B0C0E] px-2 py-1">
                  <div className="text-[9px] text-[#636B74] uppercase">ACTIVE SOMATA</div>
                  <div className="text-[11px] font-semibold text-[#52B788] tabular-nums">
                    {activeNeuronCount}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 32-Channel R1-R8 Photoreceptor Luminance Strip */}
          {currentFrame && currentFrame.eyeActivity.length > 0 && (
            <div className="mt-3 border-t border-[#262B31] pt-2">
              <div className="flex items-center justify-between font-mono text-[9px] text-[#636B74] uppercase mb-1">
                <span>R1–R8 PHOTORECEPTOR DRIVE</span>
                <span>{currentFrame.eyeActivity.length} CH</span>
              </div>
              <div className="flex items-end gap-[2px] h-5 bg-[#0B0C0E] px-1 py-0.5 border border-[#1F2328]">
                {currentFrame.eyeActivity.map((val, idx) => (
                  <div
                    key={idx}
                    className="flex-1 bg-[#52B788]/80 transition-all duration-150"
                    style={{ height: `${Math.max(12, Math.round((1 - val) * 100))}%` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom-Right: 02 // SWARM CONSENSUS & BENCHMARK TELEMETRY */}
        <div
          className={`pointer-events-auto spatial-panel brutal-reticle w-full md:w-[440px] p-3.5 ${
            showResultForSelection && !showResultForSelection.correct ? 'brutal-reticle-crimson' : ''
          }`}
        >
          <div className="flex items-center justify-between border-b border-[#262B31] pb-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-semibold tracking-widest text-[#52B788] uppercase">
                02 // CONSENSUS
              </span>
              {showResultForSelection?.hadTie && (
                <span className="rounded-[2px] border border-[#2D6A4F] bg-[#143325] px-1.5 py-0.5 font-mono text-[9px] text-[#52B788]">
                  TIE-BREAK
                </span>
              )}
              {showResultForSelection?.nearSymmetric && (
                <span className="rounded-[2px] border border-[#7F1D1D] bg-[#2A0A0E] px-1.5 py-0.5 font-mono text-[9px] text-[#FCA5A5]">
                  NEAR-SYMMETRIC
                </span>
              )}
            </div>

            {showResultForSelection ? (
              <span
                className={`inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                  showResultForSelection.correct
                    ? 'border-[#2D6A4F] bg-[#143325] text-[#52B788]'
                    : 'border-[#B91C1C] bg-[#2A0A0E] text-[#FCA5A5]'
                }`}
              >
                {showResultForSelection.correct ? (
                  <>
                    <CheckIcon className="h-3 w-3" />
                    <span>VERIFIED</span>
                  </>
                ) : (
                  <>
                    <AlertIcon className="h-3 w-3" />
                    <span>
                      {showResultForSelection.swarmAnswer.toUpperCase() === 'UNSOLVED'
                        ? 'ABSTAINED'
                        : 'MISMATCH'}
                    </span>
                  </>
                )}
              </span>
            ) : (
              <span className="font-mono text-[10px] text-[#636B74] uppercase">
                {isRunning ? 'AGGREGATING VOTES...' : 'AWAITING TRIAL'}
              </span>
            )}
          </div>

          {/* Decision vs Ground Truth */}
          <div className="grid grid-cols-3 gap-2 mb-3 font-mono">
            <div className="rounded-[2px] border border-[#262B31] bg-[#0B0C0E] p-2.5">
              <div className="text-[9px] text-[#636B74] uppercase">SWARM OUTPUT</div>
              <div className="mt-1 text-lg font-bold text-[#ECEEF0] tabular-nums truncate">
                {showResultForSelection
                  ? formatOutput(showResultForSelection.swarmAnswer, selectedType)
                  : isRunning
                  ? '...'
                  : '—'}
              </div>
            </div>

            <div className="rounded-[2px] border border-[#262B31] bg-[#0B0C0E] p-2.5">
              <div className="text-[9px] text-[#636B74] uppercase">GROUND TRUTH</div>
              <div className="mt-1 text-lg font-bold text-[#9AA1A9] tabular-nums truncate">
                {showResultForSelection
                  ? formatOutput(showResultForSelection.groundTruth, selectedType)
                  : '—'}
              </div>
            </div>

            <div className="rounded-[2px] border border-[#262B31] bg-[#0B0C0E] p-2.5">
              <div className="text-[9px] text-[#636B74] uppercase">AGREEMENT</div>
              <div className="mt-1 text-lg font-bold text-[#52B788] tabular-nums">
                {showResultForSelection
                  ? `${
                      showResultForSelection.flyVotes.filter(
                        (v) => String(v.answer) === String(showResultForSelection.swarmAnswer)
                      ).length
                    }/${showResultForSelection.flyVotes.length}`
                  : `—/${nFlies}`}
              </div>
            </div>
          </div>

          {/* Per-Agent Vote Matrix */}
          {showResultForSelection && showResultForSelection.flyVotes.length > 0 && (
            <div className="mb-3">
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                {showResultForSelection.flyVotes.map((v) => {
                  const agreed = String(v.answer) === String(showResultForSelection.swarmAnswer);
                  const inspected = safeActiveFlyIndex === v.flyIndex;
                  return (
                    <button
                      key={v.flyIndex}
                      type="button"
                      onClick={() =>
                        setActiveFlyIndex(inspected ? null : v.flyIndex)
                      }
                      className={`rounded-[2px] border p-1.5 text-left font-mono transition-colors cursor-pointer ${
                        inspected
                          ? 'border-[#52B788] bg-[#143325]'
                          : agreed
                          ? 'border-[#262B31] bg-[#0B0C0E] hover:border-[#2D6A4F]'
                          : 'border-[#7F1D1D]/60 bg-[#2A0A0E]/40 hover:border-[#B91C1C]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[9px] text-[#636B74]">
                        <span>F0{v.flyIndex + 1}</span>
                        <span className="text-[#52B788] tabular-nums">
                          {Math.round(v.confidence * 100)}%
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] font-bold text-[#ECEEF0] truncate tabular-nums">
                        {formatOutput(v.answer, selectedType)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cumulative Session Benchmark Bar (Single-Fly vs Swarm Gain) */}
          <div className="grid grid-cols-4 gap-1.5 border-t border-[#262B31] pt-2.5 font-mono text-center">
            <div>
              <div className="text-xs font-bold text-[#ECEEF0] tabular-nums">
                {sessionStats.totalRuns}
              </div>
              <div className="text-[9px] text-[#636B74] uppercase">TRIALS</div>
            </div>
            <div>
              <div className="text-xs font-bold text-[#52B788] tabular-nums">
                {swarmAcc !== null ? `${swarmAcc}%` : '—'}
              </div>
              <div className="text-[9px] text-[#636B74] uppercase">SWARM ACC</div>
            </div>
            <div>
              <div className="text-xs font-bold text-[#9AA1A9] tabular-nums">
                {singleAcc !== null ? `${singleAcc}%` : '—'}
              </div>
              <div className="text-[9px] text-[#636B74] uppercase">1-FLY BASE</div>
            </div>
            <div>
              <div
                className={`text-xs font-bold tabular-nums ${
                  swarmDelta !== null && swarmDelta < 0 ? 'text-[#F87171]' : 'text-[#52B788]'
                }`}
              >
                {swarmDelta !== null
                  ? `${swarmDelta >= 0 ? '+' : ''}${swarmDelta}%`
                  : '—'}
              </div>
              <div className="text-[9px] text-[#636B74] uppercase">SWARM GAIN</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ACCESSIBLE NATIVE <DIALOG> CONFIGURATION & READOUT LAB ─────────── */}
      <ControlDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        selectedType={selectedType}
        selectedDifficulty={selectedDifficulty}
        nFlies={nFlies}
        isBusy={isRunning || autoRunning}
        models={models}
        training={training}
        onTypeChange={(t) => {
          setSelectedType(t);
          setActiveFlyIndex(null);
        }}
        onDifficultyChange={(d) => setSelectedDifficulty(d)}
        onNFliesChange={(n) => {
          setNFlies(n);
          setActiveFlyIndex(null);
        }}
        onTrain={(count) => startTraining(selectedType, selectedDifficulty, count)}
        onResetStats={resetStats}
      />
    </main>
  );
}
