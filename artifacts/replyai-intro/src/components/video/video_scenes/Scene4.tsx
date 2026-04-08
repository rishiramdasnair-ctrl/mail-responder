import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const easings = {
  expoOut: [0.16, 1, 0.3, 1]
};

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),  // Draw plane
      setTimeout(() => setPhase(2), 1000), // Fly plane
      setTimeout(() => setPhase(3), 1300), // Sent stamp
      setTimeout(() => setPhase(4), 2500), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-background"
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 1, ease: easings.expoOut }}
    >
      <div className="relative h-[200px] w-full flex items-center justify-center">
        {/* Paper Plane */}
        <motion.div
          className="absolute text-white"
          initial={{ x: '-30vw', scale: 0 }}
          animate={
            phase === 1 ? { x: 0, scale: 2 } : 
            phase >= 2 ? { x: '50vw', scale: 1, rotate: 15, opacity: 0 } : 
            {}
          }
          transition={
            phase === 1 ? { type: 'spring', stiffness: 300, damping: 20 } :
            { duration: 0.5, ease: 'easeIn' }
          }
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <motion.path 
              d="m22 2-7 20-4-9-9-4Z" 
              initial={{ pathLength: 0 }}
              animate={phase >= 1 ? { pathLength: 1 } : {}}
              transition={{ duration: 0.8, ease: "easeInOut" }}
            />
            <motion.path 
              d="M22 2 11 13" 
              initial={{ pathLength: 0 }}
              animate={phase >= 1 ? { pathLength: 1 } : {}}
              transition={{ duration: 0.8, ease: "easeInOut" }}
            />
          </svg>
        </motion.div>

        {/* SENT Text */}
        <motion.h1
          className="text-[18vw] font-display font-black tracking-tighter absolute leading-none"
          initial={{ opacity: 0, scale: 2, filter: 'blur(20px)' }}
          animate={phase >= 3 ? { opacity: 1, scale: 1, filter: 'blur(0px)', color: ['#ff4444', '#ffffff'] } : {}}
          transition={{ duration: 0.6, ease: easings.expoOut, color: { duration: 0.4, delay: 0.1 } }}
        >
          SENT
        </motion.h1>
        
        {/* Checkmark flash */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center text-[#ff4444] pointer-events-none"
          initial={{ opacity: 0, scale: 0 }}
          animate={phase >= 3 ? { opacity: [0, 1, 0], scale: [0.5, 1.5, 2] } : {}}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
           <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </motion.div>
      </div>
    </motion.div>
  );
}
