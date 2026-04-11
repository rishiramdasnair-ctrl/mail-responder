import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const easings = {
  expoOut: [0.16, 1, 0.3, 1]
};

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),  // Button appears
      setTimeout(() => setPhase(2), 800),  // Clicked
      setTimeout(() => setPhase(3), 1200), // Swoosh / Sent
      setTimeout(() => setPhase(4), 2800), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-20 bg-white"
      initial={{ clipPath: 'inset(100% 0 0 0)' }}
      animate={{ clipPath: 'inset(0% 0 0 0)' }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8, ease: easings.expoOut }}
    >
      
      {phase >= 3 && (
        <motion.div 
          className="absolute inset-0 bg-background"
          initial={{ clipPath: 'circle(0% at 50% 50%)' }}
          animate={{ clipPath: 'circle(150% at 50% 50%)' }}
          transition={{ duration: 1, ease: easings.expoOut }}
        />
      )}

      {/* Button */}
      {phase < 3 && (
        <motion.div
          className="bg-black text-white font-sans uppercase tracking-widest text-2xl py-6 px-16 relative overflow-hidden"
          initial={{ scale: 0, opacity: 0 }}
          animate={phase >= 1 ? { scale: phase >= 2 ? 0.95 : 1, opacity: 1 } : {}}
          transition={{ duration: 0.4, ease: easings.expoOut }}
        >
          {phase === 2 && (
             <motion.div 
               className="absolute inset-0 bg-white/20"
               initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.3 }}
             />
          )}
          Send Reply
        </motion.div>
      )}

      {/* SENT Text */}
      {phase >= 3 && (
        <div className="relative z-10 flex flex-col items-center mix-blend-difference text-white">
          <motion.h1
            className="text-[20vw] font-display font-black tracking-tighter leading-none uppercase"
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, ease: easings.expoOut }}
          >
            SENT
          </motion.h1>
          <motion.div
             className="w-full h-[2px] bg-white mt-4"
             initial={{ scaleX: 0 }}
             animate={{ scaleX: 1 }}
             transition={{ duration: 0.8, delay: 0.2, ease: easings.expoOut }}
          />
        </div>
      )}
    </motion.div>
  );
}