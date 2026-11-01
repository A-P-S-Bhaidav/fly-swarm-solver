'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface FlyBrainHologramProps {
  flyId: number;
  position?: [number, number, number];
  scale?: number;
  firedNeurons?: number[];
  spikeRate?: number;
  isSolving?: boolean;
}

/**
 * Cohesive anatomical neuropil palette anchored in Charcoal + Forest Green + Crimson Red:
 * - Optic Lobes & Visual Projection: Deep Pine -> Luminous Sage Forest
 * - Central Brain & Mushroom Bodies: Muted Emerald-Forest
 * - Structural VNC / Ascending: Dark Slate-Charcoal
 * - Descending & Motor Command Neurons: Deep Crimson Ember
 */
const CLASS_COLORS: Record<number, [number, number, number]> = {
  9: [0.14, 0.44, 0.31],  // ol_intrinsic: Forest Pine (Optic Lobes)
  10: [0.18, 0.50, 0.35], // ol_sensory: Photoreceptor Moss
  12: [0.32, 0.72, 0.53], // visual_projection: Luminous Forest Sage (LC10 / LC4 / LPLC1)
  11: [0.24, 0.58, 0.42], // visual_centrifugal: Mid Forest
  4: [0.22, 0.50, 0.36],  // cb_intrinsic: Central Brain Forest
  3: [0.20, 0.42, 0.32],  // cb_endocrine
  1: [0.18, 0.32, 0.26],  // ascending_neuron: Deep Slate-Pine
  16: [0.16, 0.25, 0.21], // vnc_intrinsic: Charcoal-Moss (Ventral Nerve Cord)
  5: [0.72, 0.14, 0.16],  // cb_motor: Crimson Ember
  6: [0.80, 0.16, 0.18],  // descending_neuron: Crimson Command Tract
  17: [0.68, 0.15, 0.17], // vnc_motor: Crimson Motor Output
};

const DEFAULT_SOMA_COLOR: [number, number, number] = [0.15, 0.20, 0.18];

/**
 * Action potential spark palette:
 * - Visual/Optic sensory spikes illuminate in bright Forest Emerald
 * - Central, Descending, and Motor command spikes flash in blazing Crimson Red
 */
const SPARK_COLORS: Record<number, [number, number, number]> = {
  9: [0.36, 0.90, 0.62],
  10: [0.40, 0.94, 0.66],
  12: [0.46, 0.98, 0.70],
  4: [0.96, 0.22, 0.24],
  5: [1.0, 0.18, 0.20],
  6: [1.0, 0.16, 0.20],
  16: [0.92, 0.24, 0.26],
  17: [1.0, 0.20, 0.22],
};

const DEFAULT_SPARK_COLOR: [number, number, number] = [0.96, 0.20, 0.22];
const MAX_SPARKS = 400;

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
      if (!posRes.ok || !classRes.ok) return;
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
  scale = 2.2,
  firedNeurons = [],
  spikeRate = 0,
  isSolving = false,
}: FlyBrainHologramProps) {
  const groupRef = useRef<THREE.Group>(null);
  const sparkPointsRef = useRef<THREE.Points>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [sparkGeometry, setSparkGeometry] = useState<THREE.BufferGeometry | null>(null);

  const decayTimerRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    let createdGeom: THREE.BufferGeometry | null = null;
    let createdSparkGeom: THREE.BufferGeometry | null = null;

    loadConnectomeData().then(() => {
      if (cancelled || !cachedPositions || !cachedClasses) return;

      const rawPos = cachedPositions;
      const rawClass = cachedClasses;
      const nPoints = Math.min(rawClass.length, Math.floor(rawPos.length / 3));

      const positions = new Float32Array(nPoints * 3);
      const colors = new Float32Array(nPoints * 3);

      for (let i = 0; i < nPoints; i++) {
        positions[i * 3] = rawPos[i * 3] * 3.2;
        positions[i * 3 + 1] = (-rawPos[i * 3 + 2] - 0.05) * 3.2;
        positions[i * 3 + 2] = (rawPos[i * 3 + 1] - 0.25) * 3.2;

        const cid = rawClass[i];
        const col = CLASS_COLORS[cid] || DEFAULT_SOMA_COLOR;
        colors[i * 3] = col[0];
        colors[i * 3 + 1] = col[1];
        colors[i * 3 + 2] = col[2];
      }

      createdGeom = new THREE.BufferGeometry();
      createdGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      createdGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      setGeometry(createdGeom);

      createdSparkGeom = new THREE.BufferGeometry();
      const sparkPos = new Float32Array(MAX_SPARKS * 3);
      const sparkCol = new Float32Array(MAX_SPARKS * 3);
      createdSparkGeom.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
      createdSparkGeom.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
      createdSparkGeom.setDrawRange(0, 0);
      setSparkGeometry(createdSparkGeom);
    });

    return () => {
      cancelled = true;
      createdGeom?.dispose();
      createdSparkGeom?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!sparkGeometry || !cachedPositions || !cachedClasses) return;
    if (!firedNeurons.length) {
      sparkGeometry.setDrawRange(0, 0);
      return;
    }

    const rawPos = cachedPositions;
    const rawClass = cachedClasses;
    const sparkPosAttr = sparkGeometry.getAttribute('position') as THREE.BufferAttribute;
    const sparkColAttr = sparkGeometry.getAttribute('color') as THREE.BufferAttribute;
    const sparkPosArr = sparkPosAttr.array as Float32Array;
    const sparkColArr = sparkColAttr.array as Float32Array;

    const nSparks = Math.min(MAX_SPARKS, firedNeurons.length);
    for (let i = 0; i < nSparks; i++) {
      const neuronIdx = firedNeurons[i];
      if (neuronIdx >= 0 && neuronIdx * 3 + 2 < rawPos.length) {
        sparkPosArr[i * 3] = rawPos[neuronIdx * 3] * 3.2;
        sparkPosArr[i * 3 + 1] = (-rawPos[neuronIdx * 3 + 2] - 0.05) * 3.2;
        sparkPosArr[i * 3 + 2] = (rawPos[neuronIdx * 3 + 1] - 0.25) * 3.2;

        const cid = rawClass[neuronIdx] || 0;
        const sparkCol = SPARK_COLORS[cid] || DEFAULT_SPARK_COLOR;
        sparkColArr[i * 3] = sparkCol[0];
        sparkColArr[i * 3 + 1] = sparkCol[1];
        sparkColArr[i * 3 + 2] = sparkCol[2];
      }
    }

    sparkGeometry.setDrawRange(0, nSparks);
    sparkPosAttr.needsUpdate = true;
    sparkColAttr.needsUpdate = true;
    decayTimerRef.current = 1.0;
  }, [firedNeurons, sparkGeometry]);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime() + flyId * 0.9;

    if (groupRef.current) {
      groupRef.current.position.y = position[1] + Math.sin(time * 1.3) * 0.015;
      groupRef.current.rotation.y = Math.sin(time * 0.35) * 0.055;
    }

    if (decayTimerRef.current > 0) {
      decayTimerRef.current = Math.max(0, decayTimerRef.current - delta * 2.1);
    }

    if (sparkPointsRef.current) {
      const mat = sparkPointsRef.current.material as THREE.PointsMaterial;
      const boost = Math.min(0.3, spikeRate * 8.0);
      mat.opacity = Math.min(1.0, decayTimerRef.current * 0.96 + (isSolving ? boost : 0));
      mat.size = 0.072 * (0.85 + decayTimerRef.current * 0.75);
    }

    if (ringRef.current) {
      ringRef.current.rotation.z += delta * (isSolving ? 0.45 : 0.1);
    }
  });

  if (!geometry) return null;

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {/* 139,662 MaleCNS Somatic Point Cloud */}
      <points geometry={geometry}>
        <pointsMaterial
          size={0.016}
          vertexColors
          transparent
          opacity={0.48}
          blending={THREE.NormalBlending}
          depthWrite={false}
        />
      </points>

      {/* Active Firing Action Potentials (Forest Emerald Sensory + Crimson Red Command) */}
      {sparkGeometry && (
        <points ref={sparkPointsRef} geometry={sparkGeometry}>
          <pointsMaterial
            size={0.072}
            vertexColors
            transparent
            opacity={0.0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      )}

      {/* Architectural Calibration Base Ring */}
      <mesh ref={ringRef} position={[0, -0.66, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.56, 0.585, 64]} />
        <meshBasicMaterial
          color={isSolving ? '#DC2626' : '#2D6A4F'}
          transparent
          opacity={isSolving ? 0.7 : 0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
