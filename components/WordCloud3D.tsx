'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Word } from '@/types/speech';

interface WordMeshProps {
  word: Word;
}

function WordMesh({ word }: WordMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // ゆっくり回転するアニメーション
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.1;
    }
  });

  // 頻度に基づいて色を決定（シアン→マゼンタ→イエロー）
  const color = useMemo(() => {
    const normalizedFreq = Math.min(word.frequency / 10, 1);

    if (normalizedFreq < 0.33) {
      return '#00ffff'; // Cyan - 低頻度
    } else if (normalizedFreq < 0.66) {
      return '#ff00ff'; // Magenta - 中頻度
    } else {
      return '#ffff00'; // Yellow - 高頻度（重要）
    }
  }, [word.frequency]);

  return (
    <group position={word.position}>
      <Text
        ref={meshRef}
        fontSize={word.size}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.08}
        outlineColor="rgba(0, 0, 0, 0.6)"
        outlineOpacity={0.8}
      >
        {word.text}
      </Text>
    </group>
  );
}

interface WordCloud3DProps {
  words: Word[];
}

export default function WordCloud3D({ words }: WordCloud3DProps) {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 25], fov: 75 }}
        gl={{ alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#ffffff" />
        <pointLight position={[-10, -10, -10]} intensity={0.3} color="#ffffff" />

        {words.map((word, index) => (
          <WordMesh key={`${word.text}-${index}`} word={word} />
        ))}

        <OrbitControls
          enableZoom={true}
          enablePan={true}
          enableRotate={true}
          minDistance={10}
          maxDistance={50}
        />
      </Canvas>
    </div>
  );
}
