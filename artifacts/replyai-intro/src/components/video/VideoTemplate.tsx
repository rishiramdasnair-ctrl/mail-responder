import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video/hooks';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

const SCENE_DURATIONS = { 
  overwhelm: 3500, 
  aiActivates: 4000, 
  smartReply: 4500, 
  sent: 3000, 
  replyAi: 4500 
};

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black flex items-center justify-center font-sans text-white">
      {/* Persistent Background Layer */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
            backgroundSize: '4vw 4vw',
          }}
          animate={{ 
            y: ['0vw', '4vw'],
            x: ['0vw', '-4vw']
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        />
      </div>
      
      {/* Persistent Noise Texture */}
      <div className="absolute inset-0 z-50 mix-blend-overlay opacity-[0.15] pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}></div>

      {/* Persistent Midground Accent Elements */}
      <motion.div
        className="absolute h-[1px] bg-white z-10"
        animate={{
          left: ['0%', '10%', '20%', '50%', '30%'][currentScene] || '0%',
          width: ['100%', '80%', '60%', '20%', '40%'][currentScene] || '100%',
          top: ['15%', '25%', '80%', '10%', '50%'][currentScene] || '15%',
          opacity: [0.1, 0.4, 0.3, 0.8, 0.2][currentScene] || 0.1,
        }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />
      
      <motion.div
        className="absolute w-[1px] bg-white z-10"
        animate={{
          top: ['0%', '20%', '10%', '60%', '10%'][currentScene] || '0%',
          height: ['100%', '60%', '80%', '40%', '70%'][currentScene] || '100%',
          left: ['85%', '75%', '10%', '90%', '50%'][currentScene] || '85%',
          opacity: [0.1, 0.2, 0.5, 0.3, 0.1][currentScene] || 0.1,
        }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />
      
      {/* Viewport Corners */}
      <div className="absolute top-8 left-8 w-4 h-4 border-t border-l border-white/30 z-40" />
      <div className="absolute top-8 right-8 w-4 h-4 border-t border-r border-white/30 z-40" />
      <div className="absolute bottom-8 left-8 w-4 h-4 border-b border-l border-white/30 z-40" />
      <div className="absolute bottom-8 right-8 w-4 h-4 border-b border-r border-white/30 z-40" />

      {/* Scene Content */}
      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key="scene1" />}
        {currentScene === 1 && <Scene2 key="scene2" />}
        {currentScene === 2 && <Scene3 key="scene3" />}
        {currentScene === 3 && <Scene4 key="scene4" />}
        {currentScene === 4 && <Scene5 key="scene5" />}
      </AnimatePresence>
    </div>
  );
}
