'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface FlyBrainHologramProps {
  flyId: number;
  position?: [number, number, number];
  scale?: number;
  firedNeurons?: number[];
  spikeRate?: number;
  isSolving?: boolean;
  label?: string;
}

// Rich anatomical neuropil baseline colors (Distinct, non-washed-out biological compartments)
const CLASS_COLORS: Record<number, [number, number, number]> = {
  9: [0.05, 0.55, 0.92],    // ol_intrinsic: Electric Cyan / Deep Blue (Optic Lobes)
  12: [0.05, 0.82, 0.58],   // visual_projection: Turquoise / Mint
  4: [0.92, 0.55, 0.08],    // cb_intrinsic: Warm Amber / Golden Honey (Central Brain)
  5: [0.95, 0.35, 0.05],    // cb_motor: Radiant Coral
  6: [0.85, 0.12, 0.55],    // descending_neuron: Vivid Magenta
  1: [0.25, 0.55, 0.95],    // ascending_neuron: Royal Blue
  16: [0.45, 0.20, 0.85],   // vnc_intrinsic: Deep Violet (Ventral Cord)
};

// Intensely Brilliant Sparks for Real Firing Action Potentials
const SPARK_COLORS: Record<number, [number, number, number]> = {
  9: [0.3, 1.0, 1.0],      // Blinding Neon Cyan
  12: [0.4, 1.0, 0.7],     // Radiant Electric Mint
  4: [1.0, 0.95, 0.2],     // Pure Blazing Gold
  5: [1.0, 0.50, 0.1],     // Blazing Coral Orange
  6: [1.0, 0.15, 0.9],     // Electric Fuchsia / Hot Pink
  1: [0.4, 0.85, 1.0],     // Ice Blue
  16: [0.8, 0.40, 1.0],    // Ultraviolet Spark
};

let cachedPositions: Float32Array | null = null;
let cachedClasses: Uint8Array | null = null;
let loadPromise: Promise<void> | null = null;

function loadConnectomeData(): Promise<void> {
  if (cachedPositions && cachedClasses) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = Promise.all([
    fetch('/connectome/positions.f32.bin'),
    fetch('/connectome/classes.u8.bin'),
  ])
    .then(async ([posRes, classRes]) => {
      const [posBuf, classBuf] = await Promise.all([
        posRes.arrayBuffer(),
        classRes.arrayBuffer(),
      ]);
      cachedPositions = new Float32Array(posBuf);
      cachedClasses = new Uint8Array(classBuf);
    })
    .catch((err) => {
      console.error('Failed to load connectome binaries:', err);
    });

  return loadPromise;
}

export default function FlyBrainHologram({
  flyId,
  position = [0, 0, 0],
  scale = 0.4,
  firedNeurons = [],
  spikeRate = 0,
  isSolving = false,
  label = `Brain #${flyId + 1}`,
}: FlyBrainHologramProps) {
  const groupRef = useRef<THREE.Group>(null);
  const sparkPointsRef = useRef<THREE.Points>(null);

  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [sparkGeometry, setSparkGeometry] = useState<THREE.BufferGeometry | null>(null);

  const decayTimerRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    loadConnectomeData().then(() => {
      if (cancelled || !cachedPositions || !cachedClasses) return;

      const rawPos = cachedPositions;
      const rawClass = cachedClasses;

      const nPoints = Math.min(rawClass.length, Math.floor(rawPos.length / 3));

      const positions = new Float32Array(nPoints * 3);
      const colors = new Float32Array(nPoints * 3);

      for (let i = 0; i < nPoints; i++) {
        // Transform coords: centered and scaled for scientific upright orientation
        positions[i * 3] = rawPos[i * 3] * 3.2;
        positions[i * 3 + 1] = (-rawPos[i * 3 + 2] - 0.05) * 3.2;
        positions[i * 3 + 2] = (rawPos[i * 3 + 1] - 0.25) * 3.2;

        const cid = rawClass[i];
        const col = CLASS_COLORS[cid] || [0.15, 0.35, 0.65];

        colors[i * 3] = col[0];
        colors[i * 3 + 1] = col[1];
        colors[i * 3 + 2] = col[2];
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      setGeometry(geom);

      // Dedicated action potential sparks geometry (showing exactly WHICH neurons fire!)
      const sparkGeom = new THREE.BufferGeometry();
      const sparkPos = new Float32Array(400 * 3);
      const sparkCol = new Float32Array(400 * 3);
      sparkGeom.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
      sparkGeom.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
      setSparkGeometry(sparkGeom);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Update action potential sparks in real-time when neurons fire
  useEffect(() => {
    if (!sparkGeometry || !cachedPositions || !cachedClasses || !firedNeurons.length) return;

    const rawPos = cachedPositions;
    const rawClass = cachedClasses;
    const sparkPosAttr = sparkGeometry.getAttribute('position') as THREE.BufferAttribute;
    const sparkColAttr = sparkGeometry.getAttribute('color') as THREE.BufferAttribute;
    const sparkPosArr = sparkPosAttr.array as Float32Array;
    const sparkColArr = sparkColAttr.array as Float32Array;

    const nSparks = Math.min(400, firedNeurons.length);
    for (let i = 0; i < nSparks; i++) {
      const neuronIdx = firedNeurons[i];
      if (neuronIdx * 3 + 2 < rawPos.length) {
        sparkPosArr[i * 3] = rawPos[neuronIdx * 3] * 3.2;
        sparkPosArr[i * 3 + 1] = (-rawPos[neuronIdx * 3 + 2] - 0.05) * 3.2;
        sparkPosArr[i * 3 + 2] = (rawPos[neuronIdx * 3 + 1] - 0.25) * 3.2;

        const cid = rawClass[neuronIdx] || 0;
        const sparkCol = SPARK_COLORS[cid] || [0.4, 1.0, 1.0];
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
    const time = state.clock.getElapsedTime() + flyId * 1.3;

    // Gentle micro-bobbing and slow subtle orientational sway
    if (groupRef.current) {
      groupRef.current.position.y = position[1] + Math.sin(time * 1.5) * 0.02;
      groupRef.current.rotation.y = Math.sin(time * 0.4) * 0.06;
    }

    // Decay action potential sparks smoothly
    if (decayTimerRef.current > 0) {
      decayTimerRef.current = Math.max(0, decayTimerRef.current - delta * 2.2);
    }

    if (sparkPointsRef.current) {
      const mat = sparkPointsRef.current.material as THREE.PointsMaterial;
      mat.opacity = decayTimerRef.current * 0.98;
      mat.size = 0.075 * (0.8 + decayTimerRef.current * 0.8);
    }
  });

  if (!geometry) return null;

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {/* Resting Anatomical Connectome Point Cloud (NormalBlending so COLORS NEVER WASH OUT TO WHITE!) */}
      <points geometry={geometry}>
        <pointsMaterial
          size={0.016}
          vertexColors
          transparent
          opacity={0.42}
          blending={THREE.NormalBlending}
          depthWrite={false}
        />
      </points>

      {/* Real Action Potential Sparks Shooting in Real-Time (Intense, brilliant, highlighted!) */}
      {sparkGeometry && (
        <points ref={sparkPointsRef} geometry={sparkGeometry}>
          <pointsMaterial
            size={0.075}
            vertexColors
            transparent
            opacity={0.0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      )}

      {/* Subtle scientific calibration pedestal */}
      <mesh position={[0, -0.65, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.58, 48]} />
        <meshBasicMaterial
          color="#334155"
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
