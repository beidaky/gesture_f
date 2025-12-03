import * as THREE from 'three';

interface PointData {
  vec: THREE.Vector3;
}

export function generateTextParticles(text: string, size: number = 40, particleCount: number = 2000): THREE.Vector3[] {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const fontStr = `bold ${size}px Arial, "Microsoft YaHei", sans-serif`;
  ctx.font = fontStr;
  
  // Measure text to size canvas
  const measurements = ctx.measureText(text);
  const width = Math.ceil(measurements.width);
  const height = size * 1.5; // Padding
  
  canvas.width = width;
  canvas.height = height;

  // Re-apply font after resize
  ctx.font = fontStr;
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Draw text centered
  ctx.fillText(text, width / 2, height / 2);

  // Get image data
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  const points: THREE.Vector3[] = [];
  
  // Sample pixels
  // We want roughly 'particleCount' points.
  // Brute force: Collect all valid pixels, then sample randomly or stride.
  const validPixels: {x: number, y: number}[] = [];
  
  for (let y = 0; y < height; y += 2) { // Skip some rows for speed
    for (let x = 0; x < width; x += 2) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3]; // Alpha channel
      if (alpha > 128) {
        validPixels.push({ x, y });
      }
    }
  }
  
  if (validPixels.length === 0) return [];

  // Center offsets
  const cx = width / 2;
  const cy = height / 2;

  // If we have fewer pixels than particles, we reuse pixels
  // If we have more, we subsample
  for (let i = 0; i < particleCount; i++) {
    const pixel = validPixels[i % validPixels.length];
    
    // Convert to 3D space
    // Scale down to world units. In ThreeJS view ~30 units wide?
    // Let's say 100px = 1 unit roughly, adaptable
    const scale = 0.15; 
    const x = (pixel.x - cx) * scale;
    const y = -(pixel.y - cy) * scale; // Flip Y
    
    points.push(new THREE.Vector3(x, y, 0));
  }

  return points;
}
