// Removed reference to vite/client to fix "Cannot find type definition" error
// /// <reference types="vite/client" />

declare global {
  namespace JSX {
    interface IntrinsicElements {
      color: any;
      ambientLight: any;
      points: any;
      bufferGeometry: any;
      bufferAttribute: any;
      pointsMaterial: any;
    }
  }
}

export {};