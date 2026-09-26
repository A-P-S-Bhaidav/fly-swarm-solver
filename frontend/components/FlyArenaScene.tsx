'use client';

import React, { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Html } from '@react-three/drei';
import * as THREE from 'three';
import FlyRubikActor from './FlyRubikActor';
import FlyBrainHologram from './FlyBrainHologram';
import type { RunResult } from '@/types';

interface FlyArenaSceneProps {
  isSolving: boolean;
  result: RunResult | null;
  activeFlyIndex: number | null;
  nFlies?: number;
  captchaB64?: string | null;
  captchaType?: string;
  spikeRate?: number;
  firedNeurons?: number[];
  flyFired?: number[][];
  onSelectFly?: (idx: number | null) => void;
}

// Format raw outputs cleanly (e.g. 167.23550751815205 -> 167.2°)
function formatAnswer(val: string | number | null | undefined, type?: string): string {
  if (val === null || val === undefined) return '—';
  const str = String(val).trim();
  const num = parseFloat(str);
  if (!isNaN(num) && type === 'broken_circle') {
    return `${num.toFixed(1)}°`;
  }
  if (!isNaN(num) && type === 'rotate') {
    return `${Math.round(num)}°`;
  }
  return str;
}

// ── Central 3D Master CAPTCHA Challenge Console with Tactile Fly Interfaces ─
function CentralCaptchaPlatform({
  position = [-3.2, 0.65, 0],
  isSolving,
  captchaB64,
  targetAngle = 0,
  nFlies = 5,
}: {
  position?: [number, number, number];
  isSolving: boolean;
  captchaB64?: string | null;
  targetAngle?: number;
  nFlies?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const boardRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Group>(null);

  const texture = useMemo(() => {
    if (!captchaB64) return null;
    const tex = new THREE.TextureLoader().load(`data:image/png;base64,${captchaB64}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.NearestFilter;
    return tex;
  }, [captchaB64]);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    if (groupRef.current) {
      groupRef.current.position.y = position[1] + Math.sin(time * 1.5) * 0.015;
    }

    if (boardRef.current) {
      if (!isSolving && targetAngle !== undefined && targetAngle !== 0) {
        const targetRad = (targetAngle * Math.PI) / 180;
        boardRef.current.rotation.z = THREE.MathUtils.lerp(boardRef.current.rotation.z, -targetRad, 0.08);
      }
    }

    if (ringRef.current) {
      ringRef.current.rotation.z -= delta * 0.15;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Central 3D CAPTCHA Board (Stationary & stable, tilted upward facing camera cleanly) */}
      <mesh
        ref={boardRef}
        rotation={[-Math.PI / 3.4, 0, 0]}
        castShadow
        receiveShadow
      >
        <planeGeometry args={[1.5, 1.5]} />
        {texture ? (
          <meshBasicMaterial
            map={texture}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        ) : (
          <meshStandardMaterial
            color="#0b1120"
            roughness={0.3}
            metalness={0.7}
          />
        )}
      </mesh>

      {/* Professional Lab Bezel Frame (Subdued slate & silver) */}
      <group rotation={[-Math.PI / 3.4, 0, 0]}>
        <mesh position={[0, 0, -0.015]}>
          <planeGeometry args={[1.58, 1.58]} />
          <meshBasicMaterial
            color="#334155"
            transparent
            opacity={0.9}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* Minimalist Calibration Ring */}
      <group ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <ringGeometry args={[1.15, 1.18, 64]} />
          <meshBasicMaterial
            color="#475569"
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* ── 5 Tactile Interaction Bridges extending directly to each fly's front hands! ── */}
      {Array.from({ length: nFlies }).map((_, i) => {
        const angle = (i * 2 * Math.PI) / nFlies;
        const padDist = 1.48;
        const px = Math.sin(angle) * padDist;
        const pz = Math.cos(angle) * padDist;

        return (
          <group key={i}>
            {/* Tactile bridge arm from central console to fly hand position */}
            <mesh
              position={[px * 0.55, -0.32, pz * 0.55]}
              rotation={[-Math.PI / 2, 0, angle]}
            >
              <planeGeometry args={[0.08, padDist * 0.7]} />
              <meshBasicMaterial
                color={isSolving ? '#38bdf8' : '#334155'}
                transparent
                opacity={isSolving ? 0.7 : 0.25}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* Tactile Sensory Contact Pad directly beneath the fly's front hands! */}
            <mesh
              position={[px, -0.31, pz]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <circleGeometry args={[0.26, 32]} />
              <meshStandardMaterial
                color="#0f172a"
                roughness={0.4}
                metalness={0.8}
              />
            </mesh>

            {/* Tactile Contact Glow Ring touching the fly's front tarsi */}
            <mesh
              position={[px, -0.305, pz]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <ringGeometry args={[0.20, 0.25, 32]} />
              <meshBasicMaterial
                color={isSolving ? '#38bdf8' : '#475569'}
                transparent
                opacity={isSolving ? 0.95 : 0.35}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}

      {/* Pillar Beam from Floor */}
      <mesh position={[0, -0.38, 0]}>
        <cylinderGeometry args={[0.85, 1.05, 0.75, 32, 1, true]} />
        <meshBasicMaterial
          color="#1e293b"
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function ArenaScene({
  isSolving,
  result,
  activeFlyIndex,
  nFlies = 5,
  captchaB64,
  captchaType = 'rotate',
  spikeRate = 0,
  firedNeurons = [],
  flyFired = [],
}: FlyArenaSceneProps) {
  const controlsRef = useRef<any>(null);

  // Center coordinates of the flies on the LEFT side of the arena
  const fliesCenterX = -3.2;
  const fliesCenterZ = 0;

  // Ergonomic radius placing each fly's real front feet directly onto the tactile console pads
  const fliesData = useMemo(() => {
    const list = [];
    const radius = nFlies > 1 ? 2.35 : 0;

    for (let i = 0; i < nFlies; i++) {
      const angle = nFlies > 1 ? (i * 2 * Math.PI) / nFlies : 0;
      const x = fliesCenterX + (nFlies > 1 ? Math.sin(angle) * radius : 0);
      const z = fliesCenterZ + (nFlies > 1 ? Math.cos(angle) * radius : 0);
      const rotY = nFlies > 1 ? angle + Math.PI : 0;

      list.push({
        id: i,
        pos: [x, 0, z] as [number, number, number],
        rot: [0, rotY, 0] as [number, number, number],
      });
    }
    return list;
  }, [nFlies]);

  const targetAngle = useMemo(() => {
    if (!result) return 0;
    const num = parseFloat(String(result.swarmAnswer));
    return isNaN(num) ? 0 : num;
  }, [result]);

  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[6, 14, 8]} intensity={2.5} castShadow />
      <directionalLight position={[-8, 8, -6]} intensity={1.4} />
      <pointLight position={[-3.2, 3.5, 0]} intensity={1.6} color="#f8fafc" distance={12} />
      <pointLight position={[4.8, 3.5, 0]} intensity={1.8} color="#e0f2fe" distance={14} />

      {/* Professional Dark Graphite Grid Floor (No neon cyan lines!) */}
      <Grid
        position={[0, -0.01, 0]}
        args={[40, 40]}
        cellSize={0.5}
        cellThickness={0.7}
        cellColor="#0e1524"
        sectionSize={2.5}
        sectionThickness={1.2}
        sectionColor="#1e293b"
        fadeDistance={30}
        fadeStrength={1.2}
      />

      {/* ── LEFT SIDE: Drosophila Swarm encircling the central CAPTCHA ───────── */}
      {nFlies > 1 && (
        <CentralCaptchaPlatform
          position={[fliesCenterX, 0.65, fliesCenterZ]}
          isSolving={isSolving}
          captchaB64={captchaB64}
          targetAngle={targetAngle}
          nFlies={nFlies}
        />
      )}

      {/* 5 Drosophila Flies (100% Solid 3D, Hands Actively Palpating Challenge!) */}
      {fliesData.map((f) => {
        if (activeFlyIndex !== null && activeFlyIndex !== f.id) return null;

        return (
          <FlyRubikActor
            key={f.id}
            id={f.id}
            position={activeFlyIndex !== null ? [fliesCenterX, 0, fliesCenterZ] : f.pos}
            rotation={activeFlyIndex !== null ? [0, 0, 0] : f.rot}
            isSolving={isSolving}
            targetAngle={targetAngle}
            captchaB64={captchaB64}
            captchaType={captchaType}
          />
        );
      })}

      {/* ── RIGHT SIDE: ONE BIG CONNECTOME BRAIN (Moved further right to 4.8!) ── */}
      <group position={[4.8, 1.3, -0.2]}>
        <FlyBrainHologram
          flyId={activeFlyIndex !== null ? activeFlyIndex : 0}
          position={[0, 0, 0]}
          scale={2.2}
          firedNeurons={firedNeurons}
          spikeRate={spikeRate}
          isSolving={isSolving}
        />
      </group>

      <OrbitControls
        ref={controlsRef}
        enablePan={true}
        enableRotate={true}
        enableZoom={true}
        minDistance={1.2}
        maxDistance={18.0}
        maxPolarAngle={Math.PI / 2 - 0.05}
        dampingFactor={0.08}
      />
    </>
  );
}

export default function FlyArenaScene(props: FlyArenaSceneProps) {
  const {
    activeFlyIndex,
    onSelectFly,
    nFlies = 5,
    captchaB64,
    captchaType = 'rotate',
    isSolving,
    result,
    spikeRate = 0,
    firedNeurons = [],
    flyFired = [],
  } = props;

  const [showPopUp, setShowPopUp] = useState(true);

  React.useEffect(() => {
    if (result) {
      setShowPopUp(true);
    }
  }, [result]);

  const cameraPos: [number, number, number] = [0.6, 3.8, 8.4];

  return (
    <div className="relative w-full h-full bg-[#02040a] overflow-hidden select-none">
      {/* ── Top Center: Segmented Fly Selector (Clean Scientific Instrument Style) ─── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center p-1 rounded-xl bg-[#0b0f19]/90 backdrop-blur-xl border border-slate-800 shadow-2xl">
        <button
          onClick={() => onSelectFly?.(null)}
          className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
            activeFlyIndex === null
              ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          Swarm ({nFlies})
        </button>

        {Array.from({ length: Math.min(nFlies, 5) }).map((_, i) => (
          <button
            key={i}
            onClick={() => onSelectFly?.(i)}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
              activeFlyIndex === i
                ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            #{i + 1}
          </button>
        ))}
      </div>

      {/* ── Bottom Right: 3D Navigation Hint ──────── */}
      <div className="absolute bottom-4 right-4 z-10 pointer-events-none bg-[#0b0f19]/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400 flex items-center gap-1.5 shadow-lg">
        <span className="text-slate-300">↻</span>
        <span>Drag mouse to inspect 3D swarm & connectome</span>
      </div>

      {/* ── Bottom Left: Target CAPTCHA Preview Card ────────────────────────── */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-auto bg-[#0b0f19]/90 backdrop-blur-xl border border-slate-800 rounded-2xl p-3 shadow-2xl flex items-center gap-3">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
            Challenge Target
          </span>
          <div className="w-18 h-18 bg-black/80 rounded-xl border border-slate-800 flex items-center justify-center p-1 overflow-hidden shadow-inner">
            {captchaB64 ? (
              <img
                src={`data:image/png;base64,${captchaB64}`}
                alt="Target CAPTCHA"
                className="w-full h-full object-contain rounded-lg"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <span className="text-[10px] font-mono text-slate-500 text-center">Loading...</span>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-between h-18 py-0.5 pr-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-300">
            {captchaType.toUpperCase()}
          </span>
          <div className="text-xs font-mono text-slate-200">
            {isSolving
              ? '⚡ Synaptic propagation...'
              : result
              ? '✓ Consensus Decided'
              : 'Click "Solve Challenge"'}
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            5 Drosophila Flies • 139,662 Neurons
          </span>
        </div>
      </div>

      {/* ── POP-UP BOX: Clean Professional Swarm Output ─── */}
      {result && showPopUp && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto bg-[#0b0f19]/95 backdrop-blur-2xl border border-slate-800 rounded-2xl p-4 shadow-2xl max-w-md w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                Swarm Connectome Consensus
              </span>
            </div>
            <button
              onClick={() => setShowPopUp(false)}
              className="text-xs font-mono text-slate-400 hover:text-white px-2 py-0.5 rounded bg-white/5 border border-slate-700 cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase">Decided Output</span>
              <div className="text-2xl font-mono font-bold text-white tracking-wider">
                {formatAnswer(result.swarmAnswer, captchaType)}
              </div>
            </div>

            <div className="flex flex-col items-end">
              <span className="px-2.5 py-1 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono font-semibold">
                ✓ Swarm Consensus
              </span>
              <span className="text-[10px] font-mono text-slate-400 mt-0.5">
                {result.flyVotes.filter((v) => String(v.answer) === String(result.swarmAnswer)).length}/
                {result.flyVotes.length} Flies Agreed
              </span>
            </div>
          </div>

          {/* Individual Fly Votes Row with Clean Formatting */}
          <div className="border-t border-slate-800 pt-2">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1 font-semibold">
              Individual Fly Connectome Votes
            </span>
            <div className="grid grid-cols-5 gap-1.5">
              {result.flyVotes.map((v) => (
                <div
                  key={v.flyIndex}
                  className="bg-black/60 border border-slate-800 rounded-lg p-1 flex flex-col items-center"
                >
                  <span className="text-[9px] font-mono text-slate-400 font-semibold">#{v.flyIndex + 1}</span>
                  <span className="text-[11px] font-mono font-bold text-slate-100">
                    {formatAnswer(v.answer, captchaType)}
                  </span>
                  <span className="text-[9px] font-mono text-emerald-400">
                    {(v.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── True Full-Screen 3D Arena Canvas ─────────────────────────────────── */}
      <Canvas shadows camera={{ position: cameraPos, fov: 45 }}>
        <color attach="background" args={['#02040a']} />
        <Suspense fallback={null}>
          <ArenaScene
            {...props}
            isSolving={isSolving}
            result={result}
            activeFlyIndex={activeFlyIndex}
            nFlies={nFlies}
            captchaB64={captchaB64}
            captchaType={captchaType}
            spikeRate={spikeRate}
            firedNeurons={firedNeurons}
            flyFired={flyFired}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
