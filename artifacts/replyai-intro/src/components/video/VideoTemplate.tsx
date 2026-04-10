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
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', backgroundColor: '#0a0a0a' }} className="flex items-center justify-center">
      {/* Persistent Background Layer */}
      <div 
        className="absolute inset-0 z-0 bg-dot-matrix opacity-[0.04]"
        style={{
          backgroundPosition: `${currentScene * 20}px ${currentScene * 10}px`,
          transition: 'background-position 4s ease-out'
        }}
      />
      
      {/* Background Texture Image */}
      <div className="absolute inset-0 z-0 mix-blend-overlay opacity-30">
        <img 
          src={`${import.meta.env.BASE_URL}images/bg-texture.png`} 
          alt="texture" 
          className="w-full h-full object-cover object-center pointer-events-none" 
        />
      </div>

      {/* Persistent Accent Line */}
      <motion.div
        className="absolute h-[1px] bg-primary z-10"
        animate={{
          left: ['0%', '10%', '5%', '20%', '0%'][currentScene],
          width: ['100%', '80%', '90%', '60%', '100%'][currentScene],
          top: '15%',
          opacity: [0.1, 0.3, 0.5, 0.8, 0.2][currentScene],
        }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Foreground Scenes */}
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
