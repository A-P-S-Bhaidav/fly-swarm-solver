'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

interface FlyActorProps {
  id: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  isSolving?: boolean;
  isHighlighted?: boolean;
}

export default function FlyRubikActor({
  id,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1.0,
  isSolving = false,
  isHighlighted = false,
}: FlyActorProps) {
  const { scene } = useGLTF('/models/drosophila.glb');
  const groupRef = useRef<THREE.Group>(null);
  const flyInnerRef = useRef<THREE.Group>(null);

  const actorParts = useMemo(() => {
    const clone = scene.clone(true);
    const materials: THREE.Material[] = [];
    let eyeMat: THREE.MeshStandardMaterial | null = null;

    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (mesh.name === 'eyes') {
          eyeMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#9F1D20'),
            emissive: new THREE.Color('#DC2626'),
            emissiveIntensity: 0.08,
            roughness: 0.28,
            metalness: 0.06,
          });
          mesh.material = eyeMat;
          materials.push(eyeMat);
        } else if (mesh.name === 'thorax') {
          const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#9A6136'),
            roughness: 0.56,
            metalness: 0.08,
          });
          mesh.material = mat;
          materials.push(mat);
        } else if (mesh.name === 'body') {
          const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#835028'),
            roughness: 0.6,
            metalness: 0.06,
          });
          mesh.material = mat;
          mesh.renderOrder = 0;
          materials.push(mat);
        } else if (mesh.name === 'lWing' || mesh.name === 'rWing') {
          const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#DCE4DF'),
            transparent: true,
            opacity: 0.36,
            roughness: 0.2,
            metalness: 0.04,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          mesh.material = mat;
          mesh.renderOrder = 10;
          materials.push(mat);
        } else if (mesh.name === 'legs') {
          const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#6F4422'),
            roughness: 0.58,
            metalness: 0.06,
          });
          mesh.material = mat;
          materials.push(mat);
        }
      }
    });

    const lWing = clone.getObjectByName('lWing') ?? null;
    const rWing = clone.getObjectByName('rWing') ?? null;

    return { clone, lWing, rWing, eyeMat, materials };
  }, [scene]);

  const lWingRef = useRef<THREE.Object3D | null>(null);
  const rWingRef = useRef<THREE.Object3D | null>(null);
  const eyeMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  useEffect(() => {
    lWingRef.current = actorParts.lWing;
    rWingRef.current = actorParts.rWing;
    eyeMatRef.current = actorParts.eyeMat;

    return () => {
      lWingRef.current = null;
      rWingRef.current = null;
      eyeMatRef.current = null;
      for (const m of actorParts.materials) {
        m.dispose();
      }
    };
  }, [actorParts]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime() + id * 1.3;

    if (eyeMatRef.current) {
      eyeMatRef.current.emissiveIntensity = isSolving
        ? 0.22 + Math.sin(time * 8.0) * 0.08
        : isHighlighted
        ? 0.16
        : 0.06;
    }

    if (flyInnerRef.current) {
      flyInnerRef.current.position.set(0, 0, 0);

      if (isSolving) {
        flyInnerRef.current.rotation.x = -0.15 + Math.sin(time * 3.0) * 0.014;
        flyInnerRef.current.rotation.z = Math.sin(time * 2.0) * 0.01;

        if (lWingRef.current) {
          lWingRef.current.rotation.x = 0.36;
          lWingRef.current.rotation.z = 0.05 + Math.sin(time * 26.0) * 0.055;
        }
        if (rWingRef.current) {
          rWingRef.current.rotation.x = 0.36;
          rWingRef.current.rotation.z = -0.05 - Math.sin(time * 26.0) * 0.055;
        }
      } else {
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
      {/* Grounded contact shadow */}
      <mesh position={[0, 0.002, 0.25]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.5} />
      </mesh>

      {/* Selected agent floor reticle */}
      {isHighlighted && (
        <mesh position={[0, 0.005, 0.22]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.56, 0.6, 36]} />
          <meshBasicMaterial color="#52B788" transparent opacity={0.75} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Grounded Drosophila melanogaster specimen */}
      <group ref={flyInnerRef} position={[0, 0, 0]}>
        <primitive object={actorParts.clone} />
      </group>
    </group>
  );
}

useGLTF.preload('/models/drosophila.glb');
