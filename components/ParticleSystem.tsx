import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { generateTextParticles } from '../utils/textUtils';

interface ParticleSystemProps {
  mode: number;
  dispersion: number; // 0 to 1
  hasHand: boolean;
}

const PARTICLE_COUNT = 4000;
const TEXT_1 = "Hello";
const TEXT_2 = "Artificial Intelligence";
const TEXT_3 = "恭喜你打开了一个\n神奇的网页！";

// Helper to handle multiline for canvas generation logic if needed
// Simple hack: we assume the util handles single line, we can concat or improve util.
// For simplicity in util, we pass the raw string. 
// Note: Canvas fillText doesn't support newlines by default. 
// We will replace newline with space for 3D generation or handle multiline generation manually.
// Let's stick to single line or simple multiline handling in util? 
// Updated decision: Just pass string. If multiline needed, util should be smarter.
// We will simplify TEXT_3 to be single line for stability or handle it here.
const TEXT_3_SAFE = "恭喜你打开了一个神奇的网页！";

export const ParticleSystem: React.FC<ParticleSystemProps> = ({ mode, dispersion, hasHand }) => {
  const meshRef = useRef<THREE.Points>(null);
  
  // Store target positions for each mode
  const targets = useRef<{ [key: number]: THREE.Vector3[] }>({});
  
  // Current positions and velocities
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      temp.push({
        position: new THREE.Vector3((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 20),
        velocity: new THREE.Vector3(0, 0, 0),
        targetIndex: i
      });
    }
    return temp;
  }, []);

  // Geometry attributes
  const positions = useMemo(() => new Float32Array(PARTICLE_COUNT * 3), []);
  const colors = useMemo(() => new Float32Array(PARTICLE_COUNT * 3), []);

  // Pre-generate text targets
  useEffect(() => {
    // Generate async or slightly deferred to not block UI
    setTimeout(() => {
      targets.current[1] = generateTextParticles(TEXT_1, 80, PARTICLE_COUNT);
      targets.current[2] = generateTextParticles(TEXT_2, 30, PARTICLE_COUNT); // Smaller font for long text
      targets.current[3] = generateTextParticles(TEXT_3_SAFE, 30, PARTICLE_COUNT);
    }, 100);
  }, []);

  const color1 = new THREE.Color("#00ffff"); // Cyan
  const color2 = new THREE.Color("#ff00ff"); // Magenta
  const color3 = new THREE.Color("#ffff00"); // Yellow
  const colorIdle = new THREE.Color("#444444");

  useFrame((state) => {
    if (!meshRef.current) return;

    const time = state.clock.getElapsedTime();
    const currentTargets = targets.current[mode] || [];
    const hasTargets = currentTargets.length > 0;
    
    // Determine active color
    let targetColor = colorIdle;
    if (hasHand) {
       if (mode === 1) targetColor = color1;
       if (mode === 2) targetColor = color2;
       if (mode === 3) targetColor = color3;
    }

    // Animation loop
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i];
      
      // 1. Determine Target Position
      let targetVec = new THREE.Vector3();
      
      if (hasHand && hasTargets) {
        // Map particle index to a target point (wrap around if fewer points)
        const targetPoint = currentTargets[i % currentTargets.length];
        
        // Base target from text
        targetVec.copy(targetPoint);
        
        // Apply Dispersion (Explosion effect)
        // If dispersion is high, add noise based on noise fields or simple radial explosion
        if (dispersion > 0.1) {
             const noiseX = Math.sin(i * 0.1 + time) * 10 * dispersion;
             const noiseY = Math.cos(i * 0.13 + time) * 10 * dispersion;
             const noiseZ = Math.sin(i * 0.15 + time) * 15 * dispersion;
             targetVec.add(new THREE.Vector3(noiseX, noiseY, noiseZ));
        }
      } else {
        // Idle floating state (Orbital or Noise)
        const radius = 10;
        const theta = (i / PARTICLE_COUNT) * Math.PI * 2 + time * 0.1;
        const phi = (i % 100) / 100 * Math.PI;
        
        targetVec.set(
            Math.sin(theta) * radius * Math.sin(phi),
            Math.cos(theta) * radius,
            Math.cos(phi) * radius * Math.sin(theta)
        );
      }

      // 2. Physics Update (Steering behavior: Seek)
      const force = targetVec.clone().sub(p.position);
      const dist = force.length();
      
      // Arrival smoothing
      // Speed scales with distance but clamped
      const maxSpeed = 0.5 + (dispersion * 1.5); // Move faster when dispersing
      force.normalize().multiplyScalar(Math.min(dist * 0.1, maxSpeed));
      
      // Apply force to velocity (with damping)
      p.velocity.add(force).multiplyScalar(0.92); // Friction
      
      // Update position
      p.position.add(p.velocity);

      // 3. Update Buffer Attributes
      positions[i * 3] = p.position.x;
      positions[i * 3 + 1] = p.position.y;
      positions[i * 3 + 2] = p.position.z;

      // 4. Color Update (Lerp)
      // We do a simple trick: read current, lerp to target, write back
      // Actually, updating color array every frame is expensive if not needed.
      // Let's only update if we change modes really. But smooth transition is nice.
      const rIndex = i * 3;
      const gIndex = i * 3 + 1;
      const bIndex = i * 3 + 2;

      // Simple approach: Lerp values manually
      colors[rIndex] += (targetColor.r - colors[rIndex]) * 0.05;
      colors[gIndex] += (targetColor.g - colors[gIndex]) * 0.05;
      colors[bIndex] += (targetColor.b - colors[bIndex]) * 0.05;
    }

    // Flag attributes as dirty for Three.js to re-upload to GPU
    meshRef.current.geometry.attributes.position.needsUpdate = true;
    meshRef.current.geometry.attributes.color.needsUpdate = true;
    
    // Slight rotation of the whole cloud for 3D depth perception
    meshRef.current.rotation.y = time * 0.05;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        vertexColors
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};
