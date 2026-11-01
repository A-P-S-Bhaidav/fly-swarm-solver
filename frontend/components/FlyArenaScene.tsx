'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import FlyRubikActor from './FlyRubikActor';
import FlyBrainHologram from './FlyBrainHologram';
import type { CameraPreset, RunResult } from '@/types';

export interface FlyArenaSceneProps {
  isSolving: boolean;
  result: RunResult | null;
  activeFlyIndex: number | null;
  nFlies?: number;
  captchaB64?: string | null;
  captchaType?: string;
  spikeRate?: number;
  firedNeurons?: number[];
  flyFired?: number[][];
  cameraPreset?: CameraPreset;
}

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  arena: { pos: [0.8, 3.8, 8.6], target: [0.6, 0.85, 0] },
  swarm: { pos: [-3.2, 3.2, 5.2], target: [-3.2, 0.55, 0] },
  connectome: { pos: [4.8, 1.85, 4.3], target: [4.8, 1.25, -0.2] },
};

function CameraRig({
  preset,
  controlsRef,
}: {
  preset: CameraPreset;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const desiredPosRef = useRef(new THREE.Vector3(...CAMERA_PRESETS[preset].pos));
  const desiredTargetRef = useRef(new THREE.Vector3(...CAMERA_PRESETS[preset].target));
  const animatingRef = useRef(false);

  useEffect(() => {
    const cfg = CAMERA_PRESETS[preset];
    desiredPosRef.current.set(...cfg.pos);
    desiredTargetRef.current.set(...cfg.target);
    animatingRef.current = true;
  }, [preset]);

  useFrame((_, delta) => {
    if (!animatingRef.current) return;
    const step = Math.min(1, delta * 4.5);
    camera.position.lerp(desiredPosRef.current, step);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(desiredTargetRef.current, step);
      controlsRef.current.update();
    }
    if (camera.position.distanceTo(desiredPosRef.current) < 0.04) {
      animatingRef.current = false;
    }
  });

  return null;
}

function CentralCaptchaPlatform({
  position = [-3.2, 0.65, 0],
  isSolving,
  captchaB64,
  targetAngle = 0,
  captchaType = 'rotate',
  nFlies = 5,
  activeFlyIndex = null,
}: {
  position?: [number, number, number];
  isSolving: boolean;
  captchaB64?: string | null;
  targetAngle?: number;
  captchaType?: string;
  nFlies?: number;
  activeFlyIndex?: number | null;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const boardRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Group>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!captchaB64) {
      return;
    }
    let disposed = false;
    const loader = new THREE.TextureLoader();
    const tex = loader.load(`data:image/png;base64,${captchaB64}`, (loaded) => {
      if (disposed) {
        loaded.dispose();
        return;
      }
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.minFilter = THREE.LinearFilter;
      loaded.magFilter = THREE.NearestFilter;
      loaded.needsUpdate = true;
      setTexture((prev) => {
        if (prev && prev !== loaded) prev.dispose();
        return loaded;
      });
    });

    return () => {
      disposed = true;
      tex.dispose();
    };
  }, [captchaB64]);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    if (groupRef.current) {
      groupRef.current.position.y = position[1] + Math.sin(time * 1.4) * 0.012;
    }

    if (boardRef.current) {
      if (!isSolving && captchaType === 'rotate' && targetAngle !== 0) {
        const targetRad = (targetAngle * Math.PI) / 180;
        boardRef.current.rotation.z = THREE.MathUtils.lerp(
          boardRef.current.rotation.z,
          -targetRad,
          0.08
        );
      } else {
        boardRef.current.rotation.z = THREE.MathUtils.lerp(boardRef.current.rotation.z, 0, 0.12);
      }
    }

    if (ringRef.current) {
      ringRef.current.rotation.z -= delta * (isSolving ? 0.4 : 0.12);
    }
  });

  const padCount = Math.max(1, nFlies);

  return (
    <group ref={groupRef} position={position}>
      {/* Central 3D CAPTCHA Stimulus Plate */}
      <mesh ref={boardRef} rotation={[-Math.PI / 3.4, 0, 0]} castShadow receiveShadow>
        <planeGeometry args={[1.5, 1.5]} />
        {texture && captchaB64 ? (
          <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
        ) : (
          <meshStandardMaterial color="#121417" roughness={0.35} metalness={0.6} />
        )}
      </mesh>

      {/* Architectural Charcoal + Forest Bezel */}
      <group rotation={[-Math.PI / 3.4, 0, 0]}>
        <mesh position={[0, 0, -0.015]}>
          <planeGeometry args={[1.58, 1.58]} />
          <meshBasicMaterial
            color={isSolving ? '#2D6A4F' : '#262B31'}
            transparent
            opacity={0.95}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* Calibration Ring */}
      <group ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <ringGeometry args={[1.15, 1.18, 64]} />
          <meshBasicMaterial
            color={isSolving ? '#DC2626' : '#2D6A4F'}
            transparent
            opacity={isSolving ? 0.65 : 0.38}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* Tactile Sensory Bridges extending to each Drosophila Agent (works for N=1..8) */}
      {Array.from({ length: padCount }).map((_, i) => {
        if (activeFlyIndex !== null && activeFlyIndex !== i) return null;
        const angle = (i * 2 * Math.PI) / padCount;
        const padDist = 1.48;
        const px = Math.sin(angle) * padDist;
        const pz = Math.cos(angle) * padDist;
        const activeBridge = isSolving || activeFlyIndex === i;

        return (
          <group key={i}>
            <mesh
              position={[px * 0.55, -0.32, pz * 0.55]}
              rotation={[-Math.PI / 2, 0, angle]}
            >
              <planeGeometry args={[0.075, padDist * 0.7]} />
              <meshBasicMaterial
                color={isSolving ? '#52B788' : '#2D6A4F'}
                transparent
                opacity={activeBridge ? 0.72 : 0.28}
                side={THREE.DoubleSide}
              />
            </mesh>

            <mesh position={[px, -0.31, pz]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.26, 32]} />
              <meshStandardMaterial color="#121417" roughness={0.45} metalness={0.75} />
            </mesh>

            <mesh position={[px, -0.305, pz]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.2, 0.245, 32]} />
              <meshBasicMaterial
                color={isSolving ? '#DC2626' : '#52B788'}
                transparent
                opacity={activeBridge ? 0.9 : 0.35}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}

      {/* Pedestal Column */}
      <mesh position={[0, -0.38, 0]}>
        <cylinderGeometry args={[0.85, 1.05, 0.75, 32, 1, true]} />
        <meshBasicMaterial
          color="#181B1F"
          transparent
          opacity={0.32}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

const FLIES_CENTER_X = -3.2;
const FLIES_CENTER_Z = 0;

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
  cameraPreset = 'arena',
}: FlyArenaSceneProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Always station flies on the perimeter ring (radius=2.35) facing the central stimulus console,
  // including when nFlies === 1 so the single-fly baseline views the 3D CAPTCHA properly!
  const fliesData = useMemo(() => {
    const count = Math.max(1, nFlies);
    const radius = 2.35;
    return Array.from({ length: count }, (_, i) => {
      const angle = (i * 2 * Math.PI) / count;
      const x = FLIES_CENTER_X + Math.sin(angle) * radius;
      const z = FLIES_CENTER_Z + Math.cos(angle) * radius;
      const rotY = angle + Math.PI;
      return {
        id: i,
        pos: [x, 0, z] as [number, number, number],
        rot: [0, rotY, 0] as [number, number, number],
      };
    });
  }, [nFlies]);

  const targetAngle = useMemo(() => {
    if (!result) return 0;
    const num = parseFloat(String(result.swarmAnswer));
    return Number.isNaN(num) ? 0 : num;
  }, [result]);

  // Route per-fly neural spikes when a specific fly is inspected, or merge ensemble spikes in Swarm mode
  const activeConnectomeSpikes = useMemo(() => {
    if (activeFlyIndex !== null) {
      return flyFired[activeFlyIndex] ?? firedNeurons;
    }
    if (flyFired.length > 0) {
      const perFlyCap = Math.max(40, Math.floor(380 / flyFired.length));
      const merged: number[] = [];
      for (const arr of flyFired) {
        for (let i = 0; i < Math.min(perFlyCap, arr.length); i++) {
          merged.push(arr[i]);
        }
      }
      return merged.length > 0 ? merged : firedNeurons;
    }
    return firedNeurons;
  }, [activeFlyIndex, flyFired, firedNeurons]);

  return (
    <>
      <ambientLight intensity={1.15} color="#EAEFEA" />
      <directionalLight position={[6, 14, 8]} intensity={2.35} color="#F4F6F4" castShadow />
      <directionalLight position={[-8, 8, -6]} intensity={1.15} color="#CBE5D8" />
      <pointLight position={[-3.2, 3.6, 0]} intensity={1.45} color="#E8F3EC" distance={12} />
      <pointLight position={[4.8, 3.6, 0]} intensity={1.65} color="#52B788" distance={14} />

      {/* Charcoal + Forest Architectural Laboratory Grid */}
      <Grid
        position={[0, -0.01, 0]}
        args={[44, 44]}
        cellSize={0.5}
        cellThickness={0.7}
        cellColor="#14171A"
        sectionSize={2.5}
        sectionThickness={1.2}
        sectionColor="#1D2B24"
        fadeDistance={32}
        fadeStrength={1.25}
      />

      {/* Left Station: Central Stimulus Console (Always rendered for N=1..8) */}
      <CentralCaptchaPlatform
        position={[FLIES_CENTER_X, 0.65, FLIES_CENTER_Z]}
        isSolving={isSolving}
        captchaB64={captchaB64}
        targetAngle={targetAngle}
        captchaType={captchaType}
        nFlies={nFlies}
        activeFlyIndex={activeFlyIndex}
      />

      {/* Grounded Drosophila Ensemble */}
      {fliesData.map((f) => {
        if (activeFlyIndex !== null && activeFlyIndex !== f.id) return null;
        return (
          <FlyRubikActor
            key={f.id}
            id={f.id}
            position={f.pos}
            rotation={f.rot}
            isSolving={isSolving}
            isHighlighted={activeFlyIndex === f.id}
          />
        );
      })}

      {/* Right Station: 139,662-Neuron MaleCNS v1.0 Connectome Point Cloud */}
      <group position={[4.8, 1.3, -0.2]}>
        <FlyBrainHologram
          flyId={activeFlyIndex !== null ? activeFlyIndex : 0}
          position={[0, 0, 0]}
          scale={2.2}
          firedNeurons={activeConnectomeSpikes}
          spikeRate={spikeRate}
          isSolving={isSolving}
        />
      </group>

      <CameraRig preset={cameraPreset} controlsRef={controlsRef} />

      <OrbitControls
        ref={controlsRef}
        enablePan={true}
        enableRotate={true}
        enableZoom={true}
        minDistance={1.4}
        maxDistance={18.0}
        maxPolarAngle={Math.PI / 2 - 0.04}
        dampingFactor={0.08}
      />
    </>
  );
}

export default function FlyArenaScene(props: FlyArenaSceneProps) {
  const initialPos: [number, number, number] = CAMERA_PRESETS.arena.pos;

  return (
    <div className="relative w-full h-full bg-[#0B0C0E] overflow-hidden select-none">
      <Canvas
        shadows
        camera={{ position: initialPos, fov: 44 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#0B0C0E']} />
        <Suspense fallback={null}>
          <ArenaScene {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}
