import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const easings = {
  expoOut: [0.16, 1, 0.3, 1]
};

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),  // Button drops in
      setTimeout(() => setPhase(2), 600),  // Clicked
      setTimeout(() => setPhase(3), 1000), // White expansion
      setTimeout(() => setPhase(4), 1400), // SENT text reveals
      setTimeout(() => setPhase(5), 2600), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-20 overflow-hidden bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
    >
      
      {/* Background expands to white */}
      {phase >= 3 && (
        <motion.div 
          className="absolute inset-0 bg-white"
          initial={{ clipPath: 'circle(0% at 50% 50%)' }}
          animate={{ clipPath: 'circle(150% at 50% 50%)' }}
          transition={{ duration: 1.2, ease: easings.expoOut }}
        />
      )}

      {/* The Button */}
      {phase < 3 && (
        <motion.div
          className="bg-white text-black font-sans uppercase tracking-widest text-2xl py-6 px-16 relative flex items-center gap-4"
          initial={{ scale: 0.8, opacity: 0, y: 20 }}
          animate={phase >= 1 ? { scale: phase === 2 ? 0.9 : 1, opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4, ease: easings.expoOut }}
        >
          Send Reply
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </motion.div>
      )}

      {/* SENT Text */}
      {phase >= 4 && (
        <div className="relative z-10 flex flex-col items-center mix-blend-difference text-white">
          <div className="overflow-hidden">
            <motion.h1
              className="text-[25vw] font-display font-black tracking-tighter leading-none uppercase"
              initial={{ y: '100%' }}
              animate={{ y: '0%' }}
              transition={{ duration: 0.8, ease: easings.expoOut }}
            >
              SENT
            </motion.h1>
          </div>
          
          <motion.div
             className="w-full h-[2px] bg-white mt-4 origin-left"
             initial={{ scaleX: 0 }}
             animate={{ scaleX: 1 }}
             transition={{ duration: 0.8, delay: 0.2, ease: easings.expoOut }}
          />
        </div>
      )}
    </motion.div>
  );
}
