'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface ConnectomeSceneProps {
  spikeRate: number;
  firedNeurons?: number[];
  className?: string;
}

// Colorful Bioluminescent Palette per Neuropil / Functional Class
const CLASS_COLORS: Record<number, [number, number, number]> = {
  9: [0.0, 0.9, 1.0],     // ol_intrinsic: Electric Cyan (Optic Lobes)
  12: [0.0, 1.0, 0.7],    // visual_projection: Vivid Turquoise / Mint
  4: [1.0, 0.6, 0.1],     // cb_intrinsic: Warm Radiant Amber
  5: [1.0, 0.35, 0.1],    // cb_motor: Radiant Coral
  6: [0.95, 0.15, 0.55],  // descending_neuron: Neon Magenta / Hot Pink
  1: [0.25, 0.65, 1.0],   // ascending_neuron: Sky Blue
  16: [0.5, 0.25, 0.95],  // vnc_intrinsic: Ultraviolet / Deep Violet
};

// Intense Glowing Sparks Palette for Action Potentials
const SPARK_COLORS: Record<number, [number, number, number]> = {
  9: [0.2, 1.0, 1.0],     // Optic: Blinding Cyan
  12: [0.3, 1.0, 0.8],    // Visual projection: Radiant Mint
  4: [1.0, 0.8, 0.2],     // Central: Pure Gold / Amber
  5: [1.0, 0.5, 0.2],     // Motor: Blazing Coral
  6: [1.0, 0.3, 0.8],     // Descending: Electric Fuchsia
  1: [0.4, 0.8, 1.0],     // Ascending: Electric Ice Blue
  16: [0.7, 0.4, 1.0],    // VNC: Vibrant Violet
};

const DEFAULT_BASE_COLOR: [number, number, number] = [0.15, 0.3, 0.6];
const DEFAULT_SPARK_COLOR: [number, number, number] = [0.0, 0.95, 1.0];

function InteractiveConnectomeMesh({
  spikeRate,
  firedNeurons = [],
}: {
  spikeRate: number;
  firedNeurons?: number[];
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const sparkPointsRef = useRef<THREE.Points>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [sparkGeometry, setSparkGeometry] = useState<THREE.BufferGeometry | null>(null);

  const basePositionsRef = useRef<Float32Array | null>(null);
  const baseClassesRef = useRef<Uint8Array | null>(null);
  const baseColorsRef = useRef<Float32Array | null>(null);
  const decayTimerRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [posRes, classRes] = await Promise.all([
          fetch('/connectome/positions.f32.bin'),
          fetch('/connectome/classes.u8.bin'),
        ]);

        if (!posRes.ok || !classRes.ok) return;

        const [posBuf, classBuf] = await Promise.all([
          posRes.arrayBuffer(),
          classRes.arrayBuffer(),
        ]);

        if (cancelled) return;

        const rawPos = new Float32Array(posBuf);
        const rawClass = new Uint8Array(classBuf);
        const nPoints = Math.min(rawClass.length, Math.floor(rawPos.length / 3));

        const positions = new Float32Array(nPoints * 3);
        const colors = new Float32Array(nPoints * 3);

        for (let i = 0; i < nPoints; i++) {
          // Centered and scaled display coordinates (x, -z, y)
          const px = rawPos[i * 3];
          const py = -rawPos[i * 3 + 2] - 0.05;
          const pz = rawPos[i * 3 + 1] - 0.25;

          positions[i * 3] = px * 3.4;
          positions[i * 3 + 1] = py * 3.4;
          positions[i * 3 + 2] = pz * 3.4;

          const cid = rawClass[i];
          const col = CLASS_COLORS[cid] || DEFAULT_BASE_COLOR;

          colors[i * 3] = col[0];
          colors[i * 3 + 1] = col[1];
          colors[i * 3 + 2] = col[2];
        }

        basePositionsRef.current = positions;
        baseClassesRef.current = rawClass;
        baseColorsRef.current = new Float32Array(colors);

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        setGeometry(geom);

        // Colorful Sparks overlay geometry for real shooting action potentials (up to 600 sparks)
        const sparkGeom = new THREE.BufferGeometry();
        const sparkPos = new Float32Array(600 * 3);
        const sparkCol = new Float32Array(600 * 3);
        sparkGeom.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
        sparkGeom.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
        setSparkGeometry(sparkGeom);
      } catch (err) {
        console.error('Failed to load connectome:', err);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Update shooting action potential sparks with vivid colors when real neurons fire
  useEffect(() => {
    if (!sparkGeometry || !basePositionsRef.current || !baseClassesRef.current || !firedNeurons.length) return;

    const allPos = basePositionsRef.current;
    const allClasses = baseClassesRef.current;
    const sparkPosAttr = sparkGeometry.getAttribute('position') as THREE.BufferAttribute;
    const sparkColAttr = sparkGeometry.getAttribute('color') as THREE.BufferAttribute;
    const sparkPosArr = sparkPosAttr.array as Float32Array;
    const sparkColArr = sparkColAttr.array as Float32Array;

    const nSparks = Math.min(600, firedNeurons.length);
    for (let i = 0; i < nSparks; i++) {
      const neuronIdx = firedNeurons[i];
      if (neuronIdx * 3 + 2 < allPos.length) {
        sparkPosArr[i * 3] = allPos[neuronIdx * 3];
        sparkPosArr[i * 3 + 1] = allPos[neuronIdx * 3 + 1];
        sparkPosArr[i * 3 + 2] = allPos[neuronIdx * 3 + 2];

        const cid = allClasses[neuronIdx] || 0;
        const sparkCol = SPARK_COLORS[cid] || DEFAULT_SPARK_COLOR;
        sparkColArr[i * 3] = sparkCol[0];
        sparkColArr[i * 3 + 1] = sparkCol[1];
        sparkColArr[i * 3 + 2] = sparkCol[2];
      }
    }
    sparkPosAttr.needsUpdate = true;
    sparkColAttr.needsUpdate = true;
    decayTimerRef.current = 1.0;
  }, [firedNeurons, sparkGeometry]);

  useFrame((state, delta) => {
    // Fade out shooting action potential sparks smoothly
    if (decayTimerRef.current > 0) {
      decayTimerRef.current = Math.max(0, decayTimerRef.current - delta * 2.8);
    }

    if (sparkPointsRef.current) {
      const mat = sparkPointsRef.current.material as THREE.PointsMaterial;
      mat.opacity = decayTimerRef.current * 0.95;
      mat.size = 0.045 * (0.8 + decayTimerRef.current * 0.7);
    }

    // Pulse colors in base connectome when spikes occur
    if (geometry && baseColorsRef.current) {
      const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
      const current = colorAttr.array as Float32Array;
      const base = baseColorsRef.current;
      const pulse = Math.min(1.0, spikeRate * 25.0);

      if (pulse > 0.02) {
        for (let i = 0; i < current.length; i += 3) {
          current[i] = Math.min(1.0, base[i] + pulse * 0.4);
          current[i + 1] = Math.min(1.0, base[i + 1] + pulse * 0.5);
          current[i + 2] = Math.min(1.0, base[i + 2] + pulse * 0.6);
        }
        colorAttr.needsUpdate = true;
      } else if (current[0] !== base[0]) {
        for (let i = 0; i < current.length; i++) {
          current[i] = base[i];
        }
        colorAttr.needsUpdate = true;
      }
    }
  });

  if (!geometry) return null;

  return (
    <group position={[0, 0, 0]}>
      {/* 139,662 Neuron Connectome Cloud (Resting biological state) */}
      <points ref={pointsRef} geometry={geometry}>
        <pointsMaterial
          size={0.018}
          vertexColors
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Real Action Potential Sparks Firing with Vibrant Colors */}
      {sparkGeometry && (
        <points ref={sparkPointsRef} geometry={sparkGeometry}>
          <pointsMaterial
            size={0.05}
            vertexColors
            transparent
            opacity={0.0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      )}
    </group>
  );
}

export default function ConnectomeScene({ spikeRate, firedNeurons = [], className = '' }: ConnectomeSceneProps) {
  return (
    <div className={`relative w-full h-full bg-[#03060e]/95 backdrop-blur-md overflow-hidden rounded-2xl border border-cyan-500/25 shadow-2xl ${className}`}>
      {/* HUD Header */}
      <div className="absolute top-2.5 left-3.5 right-3.5 z-10 pointer-events-none flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${firedNeurons.length > 0 ? 'bg-cyan-400 animate-ping' : 'bg-emerald-400'}`} />
          <span className="text-[11px] font-mono font-bold tracking-wider text-slate-200 uppercase">
            Connectome (139,662 Neurons)
          </span>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 font-bold">
          {firedNeurons.length > 0 ? `⚡ ${firedNeurons.length} firing` : 'Resting'}
        </span>
      </div>

      {/* Hint to user: Mouse Rotatable */}
      <div className="absolute top-8 left-3.5 z-10 pointer-events-none">
        <span className="text-[9px] font-mono text-slate-400/80">
          ↻ Drag with mouse to rotate in 3D
        </span>
      </div>

      {/* Compact Legend */}
      <div className="absolute bottom-2 left-3 right-3 z-10 pointer-events-none bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[9px] font-mono flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00e5ff]" />
          <span className="text-slate-300">Optic</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00f5d4]" />
          <span className="text-slate-300">Visual Proj</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff9f1c]" />
          <span className="text-slate-300">Central</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#f72585]" />
          <span className="text-slate-300">Motor</span>
        </div>
      </div>

      {/* Fully Mouse-Rotatable 3D Canvas */}
      <Canvas camera={{ position: [0, 0, 2.7], fov: 42 }}>
        <color attach="background" args={['#03060e']} />
        <ambientLight intensity={0.5} />
        <InteractiveConnectomeMesh spikeRate={spikeRate} firedNeurons={firedNeurons} />
        {/* User can freely rotate and pan the brain with the mouse! */}
        <OrbitControls
          enableRotate={true}
          enablePan={true}
          enableZoom={true}
          dampingFactor={0.08}
          minDistance={1.2}
          maxDistance={5.0}
        />
      </Canvas>
    </div>
  );
}
