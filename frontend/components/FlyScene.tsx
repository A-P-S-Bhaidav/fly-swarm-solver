'use client';

import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import type { NeuralFrame } from '@/types';

// ── Sub-components ───────────────────────────────────────────────────────────

function FlyBody({ spikeRate }: { spikeRate: number }) {
  const bodyRef = useRef<THREE.Mesh>(null!);
  const thoraxRef = useRef<THREE.Mesh>(null!);
  const leftWingRef = useRef<THREE.Mesh>(null!);
  const rightWingRef = useRef<THREE.Mesh>(null!);
  const leftAntRef = useRef<THREE.Mesh>(null!);
  const rightAntRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const thinking = spikeRate > 0;

    // Body gentle bob
    if (bodyRef.current) {
      bodyRef.current.position.y = Math.sin(t * 1.2) * 0.04;
    }

    // Wing flap — fast when thinking
    const flapSpeed = thinking ? 18 : 3;
    const flapAmp   = thinking ? 0.8 : 0.25;
    if (leftWingRef.current && rightWingRef.current) {
      const flap = Math.sin(t * flapSpeed) * flapAmp;
      leftWingRef.current.rotation.z  =  0.3 + flap;
      rightWingRef.current.rotation.z = -0.3 - flap;
    }

    // Antenna sway
    const antSway = Math.sin(t * 2.5) * 0.15;
    if (leftAntRef.current)  leftAntRef.current.rotation.z  =  0.4 + antSway;
    if (rightAntRef.current) rightAntRef.current.rotation.z = -0.4 - antSway;
  });

  const eyeEmissive = new THREE.Color(0x00e5ff).multiplyScalar(0.3 + spikeRate * 3);

  return (
    <group ref={bodyRef}>
      {/* ── Abdomen ───────────────────────────────────────────────── */}
      <mesh position={[0, 0, 0.55]}>
        <sphereGeometry args={[0.38, 32, 20]} />
        <meshStandardMaterial color="#2a1a0a" roughness={0.6} metalness={0.2} />
      </mesh>
      {/* Abdomen stripes */}
      {[0.35, 0.6, 0.85].map((z, i) => (
        <mesh key={i} position={[0, 0, z]}>
          <torusGeometry args={[0.32 - i * 0.04, 0.025, 8, 32]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.4} metalness={0.3} emissive="#f59e0b" emissiveIntensity={0.1} />
        </mesh>
      ))}

      {/* ── Thorax ────────────────────────────────────────────────── */}
      <mesh ref={thoraxRef} position={[0, 0, -0.1]}>
        <sphereGeometry args={[0.28, 32, 20]} />
        <meshStandardMaterial color="#1a1008" roughness={0.5} metalness={0.3} />
      </mesh>

      {/* ── Head ──────────────────────────────────────────────────── */}
      <group position={[0, 0, -0.48]}>
        <mesh>
          <sphereGeometry args={[0.22, 32, 20]} />
          <meshStandardMaterial color="#1a1008" roughness={0.4} metalness={0.3} />
        </mesh>
        {/* Compound eyes */}
        {([-1, 1] as const).map((side) => (
          <mesh key={side} position={[side * 0.18, 0.06, 0]}>
            <sphereGeometry args={[0.13, 24, 16]} />
            <meshStandardMaterial
              color="#00e5ff"
              emissive="#00e5ff"
              emissiveIntensity={0.3 + spikeRate * 2}
              roughness={0.1}
              metalness={0.1}
              transparent
              opacity={0.85}
            />
          </mesh>
        ))}
        {/* Antennae */}
        {([-1, 1] as const).map((side) => (
          <mesh
            key={side}
            ref={side === -1 ? leftAntRef : rightAntRef}
            position={[side * 0.07, 0.18, -0.05]}
            rotation={[0.2, 0, side * 0.4]}
          >
            <cylinderGeometry args={[0.012, 0.006, 0.28, 8]} />
            <meshStandardMaterial color="#c4a56a" roughness={0.5} />
          </mesh>
        ))}
      </group>

      {/* ── Wings (4 total) ───────────────────────────────────────── */}
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          {/* Fore wing */}
          <mesh
            ref={side === -1 ? leftWingRef : rightWingRef}
            position={[side * 0.32, 0.12, -0.05]}
            rotation={[0.1, side * -0.2, side * 0.3]}
          >
            <planeGeometry args={[0.7, 0.28]} />
            <meshStandardMaterial
              color="#a8d8ea"
              transparent
              opacity={0.35}
              side={THREE.DoubleSide}
              emissive="#00e5ff"
              emissiveIntensity={0.08}
            />
          </mesh>
          {/* Hind wing */}
          <mesh
            position={[side * 0.28, 0.08, 0.12]}
            rotation={[0.1, side * -0.15, side * 0.35]}
          >
            <planeGeometry args={[0.48, 0.2]} />
            <meshStandardMaterial
              color="#a8d8ea"
              transparent
              opacity={0.25}
              side={THREE.DoubleSide}
              emissive="#00e5ff"
              emissiveIntensity={0.06}
            />
          </mesh>
        </group>
      ))}

      {/* ── Legs (6) ──────────────────────────────────────────────── */}
      {([-1, 1] as const).map((side) =>
        [[-0.2, 0.1], [0, 0.0], [0.18, 0.05]].map(([zOff, xOff], li) => (
          <mesh
            key={`${side}-${li}`}
            position={[side * (0.28 + xOff), -0.12, zOff]}
            rotation={[0.4, 0, side * 0.7]}
          >
            <cylinderGeometry args={[0.014, 0.007, 0.42, 6]} />
            <meshStandardMaterial color="#2a1a0a" roughness={0.7} />
          </mesh>
        ))
      )}
    </group>
  );
}

function NeuralGlow({ frame }: { frame: NeuralFrame | null }) {
  const pointsRef = useRef<THREE.Points>(null!);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const t = clock.elapsedTime;
    const mat = pointsRef.current.material as THREE.PointsMaterial;
    const rate = frame?.spikeRate ?? 0;
    mat.opacity = 0.3 + Math.sin(t * (4 + rate * 20)) * 0.2 * (0.2 + rate * 4);
    mat.size = 0.04 + rate * 0.06;
    pointsRef.current.rotation.y = t * 0.15;
  });

  // Scatter points around the brain region
  const positions = new Float32Array(200 * 3);
  for (let i = 0; i < 200; i++) {
    const r = 0.35 + Math.random() * 0.3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
    positions[i * 3 + 2] = r * Math.cos(phi) - 0.1;
  }

  return (
    <points ref={pointsRef} position={[0, 0.1, -0.2]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#00e5ff"
        size={0.05}
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ── Main exported component ─────────────────────────────────────────────────

interface FlySceneProps {
  frame: NeuralFrame | null;
  isRunning: boolean;
}

export default function FlyScene({ frame, isRunning }: FlySceneProps) {
  const spikeRate = isRunning ? (frame?.spikeRate ?? 0) : 0;

  return (
    <div className="relative w-full h-full min-h-[380px] rounded-xl overflow-hidden">
      {/* Ambient glow behind canvas */}
      <div
        className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-500"
        style={{
          background: `radial-gradient(ellipse at 50% 50%, rgba(0,229,255,${0.04 + spikeRate * 0.15}) 0%, transparent 70%)`,
        }}
      />

      <Canvas
        className="relative z-10"
        camera={{ position: [0, 0.5, 2.8], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 3, 3]} intensity={1.2} color="#ffffff" />
        <pointLight position={[-2, 1, -1]} intensity={0.6} color="#00e5ff" />
        <pointLight position={[2, -1, 1]}  intensity={0.4} color="#7c3aed" />

        <Suspense fallback={null}>
          <FlyBody spikeRate={spikeRate} />
          <NeuralGlow frame={frame} />
          <OrbitControls
            enableZoom={true}
            enablePan={false}
            autoRotate={!isRunning}
            autoRotateSpeed={0.8}
            minDistance={1.5}
            maxDistance={6}
          />
        </Suspense>
      </Canvas>

      {/* Step counter overlay */}
      {frame && (
        <div className="absolute bottom-3 left-3 right-3 z-20">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full transition-all duration-100"
                style={{ width: `${(frame.step / frame.total) * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono text-cyan-400/70">
              {frame.step}/{frame.total}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
