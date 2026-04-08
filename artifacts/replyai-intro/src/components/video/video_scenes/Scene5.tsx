import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const easings = {
  expoOut: [0.16, 1, 0.3, 1]
};

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),  // REPLY
      setTimeout(() => setPhase(2), 1200), // AI
      setTimeout(() => setPhase(3), 2000), // Tagline
      setTimeout(() => setPhase(4), 4000), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-20"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(20px)' }}
      transition={{ duration: 1, ease: easings.expoOut }}
    >
      <div className="flex flex-col items-center text-center">
        <motion.div 
          className="font-display leading-[0.8]"
          initial={{ opacity: 0, y: 40 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: easings.expoOut }}
        >
          <span className="text-[8vw] font-medium tracking-tight text-white/80 uppercase">Reply</span>
        </motion.div>
        
        <motion.div
          className="font-display leading-[0.8]"
          initial={{ opacity: 0, y: 40, scale: 0.9 }}
          animate={phase >= 2 ? { opacity: 1, y: 0, scale: 1 } : {}}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        >
          <span className="text-[18vw] font-black tracking-tighter text-white">AI</span>
        </motion.div>
      </div>

      <motion.div
        className="mt-12 text-2xl font-sans text-secondary/60 tracking-widest uppercase"
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 1 } : {}}
        transition={{ duration: 1, ease: "linear" }}
      >
        Never miss what matters.
      </motion.div>
    </motion.div>
  );
}
