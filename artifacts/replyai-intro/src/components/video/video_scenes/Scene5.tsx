import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const easings = {
  expoOut: [0.16, 1, 0.3, 1]
};

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),  // 'Reply'
      setTimeout(() => setPhase(2), 1000), // 'AI' snaps in
      setTimeout(() => setPhase(3), 1800), // Tagline
      setTimeout(() => setPhase(4), 3800), // Final slow zoom
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 1, ease: easings.expoOut }}
    >
      <motion.div 
        className="flex flex-col items-center text-center relative"
        animate={phase >= 4 ? { scale: 1.05 } : { scale: 1 }}
        transition={{ duration: 5, ease: "linear" }}
      >
        <div className="flex items-center justify-center gap-4 mb-4">
          {/* Logo Mark */}
          <motion.div
            className="w-12 h-12 bg-white flex items-center justify-center"
            initial={{ rotate: -90, scale: 0, opacity: 0 }}
            animate={phase >= 1 ? { rotate: 0, scale: 1, opacity: 1 } : {}}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <div className="w-4 h-4 bg-black rounded-full" />
          </motion.div>
          
          <div className="flex items-baseline font-display">
            <motion.span 
              className="text-[8vw] font-medium tracking-tight text-white leading-none"
              initial={{ opacity: 0, x: -20 }}
              animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.8, ease: easings.expoOut }}
            >
              Reply
            </motion.span>
            
            <motion.span
              className="text-[8vw] font-black tracking-tighter text-white leading-none"
              initial={{ opacity: 0, x: 20 }}
              animate={phase >= 2 ? { opacity: 1, x: 0 } : {}}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              AI
            </motion.span>
          </div>
        </div>

        <div className="overflow-hidden mt-8">
          <motion.div
            className="text-[1.5vw] font-sans text-white/50 tracking-[0.2em] uppercase"
            initial={{ y: '100%' }}
            animate={phase >= 3 ? { y: '0%' } : { y: '100%' }}
            transition={{ duration: 0.8, ease: easings.expoOut }}
          >
            Never miss what matters.
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
