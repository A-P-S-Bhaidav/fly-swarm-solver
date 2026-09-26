'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

interface FlyActorProps {
  id: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  isSolving?: boolean;
  targetAngle?: number;
  captchaB64?: string | null;
  captchaType?: string;
}





export default function FlyRubikActor({
  id,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1.0,
  isSolving = false,
  targetAngle = 0,
  captchaB64 = null,
  captchaType = 'rotate',
}: FlyActorProps) {
  const { scene } = useGLTF('/models/drosophila.glb');
  const groupRef = useRef<THREE.Group>(null);
  const flyInnerRef = useRef<THREE.Group>(null);
  const lWingRef = useRef<THREE.Object3D | null>(null);
  const rWingRef = useRef<THREE.Object3D | null>(null);
  const legsRef = useRef<THREE.Object3D | null>(null);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);

    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (mesh.name === 'eyes') {
          mesh.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#b51c14'),
            roughness: 0.32,
            metalness: 0.04,
            transparent: false,
            depthWrite: true,
          });
        } else if (mesh.name === 'thorax') {
          mesh.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#ba7542'),
            roughness: 0.58,
            metalness: 0.05,
            transparent: false,
            depthWrite: true,
          });
        } else if (mesh.name === 'body') {
          mesh.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#a86630'),
            roughness: 0.62,
            metalness: 0.04,
            transparent: false,
            depthWrite: true,
          });
          mesh.renderOrder = 0;
        } else if (mesh.name === 'lWing' || mesh.name === 'rWing') {
          mesh.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#e2e9f0'),
            transparent: true,
            opacity: 0.40,
            roughness: 0.22,
            metalness: 0.02,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          mesh.renderOrder = 10;
        } else if (mesh.name === 'legs') {
          mesh.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#9e632e'),
            roughness: 0.58,
            metalness: 0.04,
            transparent: false,
            depthWrite: true,
          });
        }
      }
    });

    lWingRef.current = clone.getObjectByName('lWing') || null;
    rWingRef.current = clone.getObjectByName('rWing') || null;
    legsRef.current = clone.getObjectByName('legs') || null;

    return clone;
  }, [scene]);

  // ── AUTHENTIC INSECT KINEMATICS (ZERO JUMPING, LEGS FIRMLY ON FLOOR) ───────
  useFrame((state) => {
    const time = state.clock.getElapsedTime() + id * 1.3;

    if (flyInnerRef.current) {
      // Body stays firmly grounded on the floor (ZERO JUMPING)
      flyInnerRef.current.position.set(0, 0, 0);

      if (isSolving) {
        // Focused forward lean toward the central challenge
        flyInnerRef.current.rotation.x = -0.16 + Math.sin(time * 3.0) * 0.015;
        flyInnerRef.current.rotation.z = Math.sin(time * 2.0) * 0.01;

        // Concentrated wing quiver in active sensory engagement
        if (lWingRef.current) {
          lWingRef.current.rotation.x = 0.36;
          lWingRef.current.rotation.z = 0.05 + Math.sin(time * 26.0) * 0.06;
        }
        if (rWingRef.current) {
          rWingRef.current.rotation.x = 0.36;
          rWingRef.current.rotation.z = -0.05 - Math.sin(time * 26.0) * 0.06;
        }
      } else {
        // Natural resting fly posture
        flyInnerRef.current.rotation.x = -0.05;
        flyInnerRef.current.rotation.z = 0;

        if (lWingRef.current) {
          lWingRef.current.rotation.x = 0.32;
          lWingRef.current.rotation.z = 0.02;
        }
        if (rWingRef.current) {
          rWingRef.current.rotation.x = 0.32;
          rWingRef.current.rotation.z = -0.02;
        }
      }
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      {/* Contact shadow */}
      <mesh position={[0, 0.002, 0.25]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.45} />
      </mesh>

      {/* Drosophila Anatomical Model (100% Solid Opaque Cuticle, Real 6 Legs) */}
      <group ref={flyInnerRef} position={[0, 0, 0]}>
        <primitive object={clonedScene} />
      </group>
    </group>
  );
}

useGLTF.preload('/models/drosophila.glb');
