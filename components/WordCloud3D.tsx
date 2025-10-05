'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Word } from '@/types/speech';

interface WordMeshProps {
  word: Word;
  onWordClick?: (word: Word) => void;
  onWordDelete?: (word: Word) => void;
}

function WordMesh({ word, onWordClick, onWordDelete }: WordMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [isHovered, setIsHovered] = useState(false);

  // 各文字ごとに異なる回転パラメータを生成（useMemoで固定）
  const rotationParams = useMemo(() => {
    // シード値を文字列から生成（同じ単語は同じ回転パターンになる）
    const seed = word.text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = (index: number) => {
      const x = Math.sin(seed * 12.9898 + index) * 43758.5453;
      return x - Math.floor(x);
    };

    return {
      // 初期回転角度（0-2π）
      initialY: random(1) * Math.PI * 2,
      // 回転速度（0.05 ~ 0.2、各文字で異なる）
      speedY: random(2) * 0.15 + 0.05,
    };
  }, [word.text]);

  // 初期回転と両面表示を設定
  useFrame(() => {
    if (meshRef.current && !meshRef.current.userData.initialized) {
      meshRef.current.rotation.y = rotationParams.initialY;
      meshRef.current.userData.initialized = true;

      // マテリアルを両面表示に設定
      if (meshRef.current.material) {
        const material = meshRef.current.material as THREE.Material;
        material.side = THREE.DoubleSide;
      }
    }
  });

  // Y軸で異なる速度で回転するアニメーション
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * rotationParams.speedY;
    }
  });

  // 頻度に基づいて色を決定（黒背景に映える明るいカラー）
  const color = useMemo(() => {
    const normalizedFreq = Math.min(word.frequency / 10, 1);

    if (normalizedFreq < 0.25) {
      return '#93C5FD'; // Blue-300 - 低頻度（明るいブルー）
    } else if (normalizedFreq < 0.5) {
      return '#C4B5FD'; // Violet-300 - 中低頻度（明るいパープル）
    } else if (normalizedFreq < 0.75) {
      return '#F9A8D4'; // Pink-300 - 中高頻度（明るいピンク）
    } else {
      return '#FCD34D'; // Yellow-300 - 高頻度（明るいゴールド）
    }
  }, [word.frequency]);

  return (
    <group position={word.position}>
      <Text
        ref={meshRef}
        fontSize={isHovered ? word.size * 1.2 : word.size}
        color={isHovered ? '#ffffff' : color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="rgba(0, 0, 0, 0.8)"
        outlineOpacity={0.8}
        onClick={(e) => {
          e.stopPropagation();
          onWordClick?.(word);
        }}
        onContextMenu={(e) => {
          e.stopPropagation();
          onWordDelete?.(word);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setIsHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setIsHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        {word.text}
      </Text>
    </group>
  );
}

interface WordCloud3DProps {
  words: Word[];
  onWordClick?: (word: Word) => void;
  onWordDelete?: (word: Word) => void;
}

export default function WordCloud3D({ words, onWordClick, onWordDelete }: WordCloud3DProps) {
  // 画面サイズに応じてカメラ位置とFOVを調整
  const [cameraConfig, setCameraConfig] = useState({
    position: [0, 0, 25] as [number, number, number],
    fov: 75,
  });

  useEffect(() => {
    const updateCameraConfig = () => {
      // メディアクエリを使用してブラウザズームにも対応
      const isMobile = window.matchMedia('(max-width: 767px)').matches;
      const isTablet = window.matchMedia('(min-width: 768px) and (max-width: 1023px)').matches;

      if (isMobile) {
        // モバイル: カメラを引いて広角に
        setCameraConfig({ position: [0, 0, 30], fov: 80 });
      } else if (isTablet) {
        // タブレット: 中間の設定
        setCameraConfig({ position: [0, 0, 27], fov: 77 });
      } else {
        // デスクトップ: デフォルト設定
        setCameraConfig({ position: [0, 0, 25], fov: 75 });
      }
    };

    updateCameraConfig();

    // リサイズとズーム変更の両方を検知
    window.addEventListener('resize', updateCameraConfig);

    // メディアクエリの変更を直接監視（ズーム対応）
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const tabletQuery = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');

    const handleChange = () => updateCameraConfig();
    mobileQuery.addEventListener('change', handleChange);
    tabletQuery.addEventListener('change', handleChange);

    return () => {
      window.removeEventListener('resize', updateCameraConfig);
      mobileQuery.removeEventListener('change', handleChange);
      tabletQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: cameraConfig.position, fov: cameraConfig.fov }}
        gl={{ alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#ffffff" />
        <pointLight position={[-10, -10, -10]} intensity={0.3} color="#ffffff" />

        {words.map((word, index) => (
          <WordMesh
            key={`${word.text}-${index}`}
            word={word}
            onWordClick={onWordClick}
            onWordDelete={onWordDelete}
          />
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
