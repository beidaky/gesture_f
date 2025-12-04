import React, { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { ParticleSystem } from './components/ParticleSystem';
import { HandLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';
import { Loader2, Camera, Hand, Info } from 'lucide-react';
import clsx from 'clsx';

// Constants
const TARGET_FPS = 30;
const GESTURE_CHECK_INTERVAL = 100; // ms

export default function App() {
  const [loading, setLoading] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State passed to 3D scene
  // 1 = Hello, 2 = AI, 3 = Chinese Text
  const [targetMode, setTargetMode] = useState<number>(1); 
  // 0 = Formed tightly, 1 = Exploded/Dispersed
  const [dispersionFactor, setDispersionFactor] = useState<number>(0); 
  const [activeHandCount, setActiveHandCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastVideoTimeRef = useRef(-1);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number>(0);

  // Initialize MediaPipe
  useEffect(() => {
    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2
        });
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Failed to load hand tracking model.");
        setLoading(false);
      }
    };
    initMediaPipe();
  }, []);

  // Initialize Camera
  const startCamera = async () => {
    if (!videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
      });
      videoRef.current.srcObject = stream;
      videoRef.current.addEventListener('loadeddata', predictWebcam);
      setCameraActive(true);
    } catch (err) {
      console.error(err);
      setError("Camera access denied or unavailable.");
    }
  };

  // Prediction Loop
  const predictWebcam = () => {
    if (!handLandmarkerRef.current || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    // Resize canvas to match video
    if (video.videoWidth !== canvas.width) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    let startTimeMs = performance.now();
    
    if (lastVideoTimeRef.current !== video.currentTime) {
      lastVideoTimeRef.current = video.currentTime;
      
      const results = handLandmarkerRef.current.detectForVideo(video, startTimeMs);

      // --- Logic to interpret gestures ---
      if (results.landmarks && results.landmarks.length > 0) {
        setActiveHandCount(results.landmarks.length);
        
        // Use the first detected hand for gesture (simplification)
        const landmarks = results.landmarks[0];
        
        // 1. Detect Fingers for Mode (1, 2, 3)
        // Simple heuristic: Count extended fingers
        // Tips: Thumb(4), Index(8), Middle(12), Ring(16), Pinky(20)
        // PIPs: Thumb(2), Index(6), Middle(10), Ring(14), Pinky(18)
        
        const isFingerUp = (tipIdx: number, pipIdx: number) => {
          // Y is inverted in screen coords (0 is top)
          // So if tip.y < pip.y, finger is up
          return landmarks[tipIdx].y < landmarks[pipIdx].y;
        };

        const indexUp = isFingerUp(8, 6);
        const middleUp = isFingerUp(12, 10);
        const ringUp = isFingerUp(16, 14);
        const pinkyUp = isFingerUp(20, 18);
        
        let count = 0;
        if (indexUp) count++;
        if (middleUp) count++;
        if (ringUp) count++;
        if (pinkyUp) count++;

        // Update mode based on count (debounce could be added for smoothness)
        if (count === 1) setTargetMode(1); // Hello
        else if (count === 2) setTargetMode(2); // AI
        else if (count >= 3) setTargetMode(3); // Special

        // 2. Detect Expansion/Contraction (Dispersion)
        // Calculate bounding box area or average distance from center of palm
        // Or simpler: Distance between Thumb Tip (4) and Pinky Tip (20) normalized by wrist size?
        // Let's use distance between Index Tip and Thumb Tip for "Pinch" vs "Open"
        
        // Better: Use "Hand Spread" - Average distance of tips from wrist
        const wrist = landmarks[0];
        const tips = [4, 8, 12, 16, 20];
        let totalDist = 0;
        tips.forEach(idx => {
           const dx = landmarks[idx].x - wrist.x;
           const dy = landmarks[idx].y - wrist.y;
           totalDist += Math.sqrt(dx*dx + dy*dy);
        });
        const avgSpread = totalDist / 5;
        
        // Heuristic: avgSpread ~0.15 is fist, ~0.35 is open (normalized coords)
        // Map 0.15 -> 0.4 to 0 -> 1
        const spreadNorm = Math.min(Math.max((avgSpread - 0.15) * 4, 0), 1);
        
        // Logic: 
        // Hand Open (High Spread) -> Dispersion = 1 (Explode/Diffuse) ? 
        // OR Hand Open -> Text Visible (0 Dispersion) ?
        // Request: "Control contraction and diffusion"
        // Let's map: Hand OPEN = Form Text (Calm). Hand CLOSED/FIST = Explode/Chaos.
        // OR Opposite: Hand OPEN = Spread out particles. Hand CLOSED = Pull them into text.
        // Let's go with: Hand OPEN (Spread) = Diffusion (1). Hand CLOSED (Pinch) = Contraction (0) -> Form Text.
        
        setDispersionFactor(spreadNorm); // 0 = tight/text, 1 = exploded

        // Draw for debugging
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const drawingUtils = new DrawingUtils(ctx);
          for (const hand of results.landmarks) {
            drawingUtils.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, {
              color: "#00FF00",
              lineWidth: 2
            });
            drawingUtils.drawLandmarks(hand, { color: "#FF0000", lineWidth: 1 });
          }
        }
      } else {
        setActiveHandCount(0);
        // Default idle state if no hand
        setDispersionFactor(0.1); // Slightly loose
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-black text-white overflow-hidden">
      {/* 3D Scene */}
      <div className="absolute inset-0 z-10">
         <Canvas camera={{ position: [0, 0, 30], fov: 60 }} gl={{ antialias: false }}>
            <color attach="background" args={['#020205']} />
            <ParticleSystem mode={targetMode} dispersion={dispersionFactor} hasHand={activeHandCount > 0} />
            <ambientLight intensity={0.5} />
         </Canvas>
      </div>

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 p-6 z-20 pointer-events-none w-full flex justify-between items-start">
        <div>
           <h1 className="text-2xl font-bold text-cyan-400 mb-2 tracking-tighter">PARTICLE<span className="text-white">GEN</span></h1>
           <div className="space-y-1 text-sm text-gray-400 bg-black/50 p-4 rounded-lg backdrop-blur-sm border border-white/10">
             <p className="flex items-center gap-2"><Hand className="w-4 h-4" /> Gestures:</p>
             <ul className="list-disc list-inside pl-1 space-y-1">
               <li className={clsx(targetMode === 1 && activeHandCount > 0 && "text-cyan-400 font-bold")}>☝️ 1 Finger: "Hello"</li>
               <li className={clsx(targetMode === 2 && activeHandCount > 0 && "text-cyan-400 font-bold")}>✌️ 2 Fingers: "Artificial Intelligence"</li>
               <li className={clsx(targetMode === 3 && activeHandCount > 0 && "text-cyan-400 font-bold")}>👌 3 Fingers: "Surprise Message"</li>
             </ul>
             <div className="mt-2 pt-2 border-t border-white/10">
               <p className="text-xs uppercase tracking-widest text-gray-500">Interaction</p>
               <div className="flex items-center gap-2 mt-1">
                 <span className="text-xs">Fist (Contract)</span>
                 <div className="w-24 h-1 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-500 transition-all duration-300 ease-out" 
                      style={{ width: `${(1 - dispersionFactor) * 100}%` }}
                    />
                 </div>
                 <span className="text-xs">Palm (Diffuse)</span>
               </div>
             </div>
           </div>
        </div>

        {/* Webcam Preview (Small) */}
        <div className="relative group pointer-events-auto">
          <div className="w-48 h-36 bg-gray-900 rounded-xl overflow-hidden border border-white/20 shadow-2xl relative">
             <video 
               ref={videoRef} 
               autoPlay 
               playsInline 
               muted 
               className={clsx("w-full h-full object-cover transform -scale-x-100", !cameraActive && "hidden")} 
             />
             <canvas 
               ref={canvasRef} 
               className="absolute inset-0 w-full h-full transform -scale-x-100 pointer-events-none"
             />
             
             {!cameraActive && !loading && (
               <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                 <Camera className="w-8 h-8 text-gray-500" />
                 <button 
                   onClick={startCamera}
                   className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-xs font-bold rounded-full transition-colors"
                 >
                   ENABLE CAMERA
                 </button>
               </div>
             )}

             {loading && (
               <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                 <Loader2 className="w-6 h-6 text-cyan-500 animate-spin" />
                 <span className="ml-2 text-xs text-cyan-500">Loading AI Model...</span>
               </div>
             )}
          </div>
          <p className="text-right text-xs text-gray-500 mt-2 flex items-center justify-end gap-1">
            <Info className="w-3 h-3" />
            MediaPipe Hands Tracking
          </p>
        </div>
      </div>

      {error && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-red-900/90 text-white px-6 py-3 rounded-lg border border-red-500 z-50">
          {error}
        </div>
      )}
    </div>
  );
}