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

  // 頻度に基づいて色を決定（青→緑→黄→赤）
  const color = useMemo(() => {
    const hue = (1 - Math.min(word.frequency / 10, 1)) * 240; // 240 (blue) to 0 (red)
    return `hsl(${hue}, 80%, 60%)`;
  }, [word.frequency]);

  return (
    <group position={word.position}>
      <Text
        ref={meshRef}
        fontSize={word.size}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="#000000"
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
        className="bg-gradient-to-b from-slate-900 to-slate-800"
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />

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
