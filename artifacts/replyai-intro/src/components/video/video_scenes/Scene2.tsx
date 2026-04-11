import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const easings = {
  expoOut: [0.16, 1, 0.3, 1]
};

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),  // Initial scan
      setTimeout(() => setPhase(2), 1000), // Text reveal
      setTimeout(() => setPhase(3), 1800), // Code blocks
      setTimeout(() => setPhase(4), 3200), // Prep for exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-20 overflow-hidden"
      initial={{ clipPath: 'polygon(0 50%, 100% 50%, 100% 50%, 0 50%)' }}
      animate={{ clipPath: 'polygon(0 0%, 100% 0%, 100% 100%, 0 100%)' }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 1, ease: easings.expoOut }}
    >
      {/* Central Targeting UI */}
      <motion.div
        className="absolute w-[40vw] h-[40vw] border border-white/10 rounded-full flex items-center justify-center"
        initial={{ scale: 0, rotate: -180, opacity: 0 }}
        animate={phase >= 1 ? { scale: 1, rotate: 0, opacity: 1 } : {}}
        transition={{ duration: 1.5, ease: easings.expoOut }}
      >
        <div className="absolute w-[30vw] h-[30vw] border border-white/5 rounded-full" />
        <div className="absolute w-[20vw] h-[20vw] border border-white/20 rounded-full" />
        
        {/* Crosshairs */}
        <div className="absolute w-full h-[1px] bg-white/10" />
        <div className="absolute h-full w-[1px] bg-white/10" />
      </motion.div>

      {/* Hero Text */}
      <div className="z-30 text-center mix-blend-difference">
        <div className="overflow-hidden">
          <motion.h2
            className="text-[10vw] font-display font-bold tracking-tighter text-white uppercase leading-none"
            initial={{ y: '100%' }}
            animate={phase >= 2 ? { y: '0%' } : { y: '100%' }}
            transition={{ duration: 0.8, ease: easings.expoOut }}
          >
            AI ACTIVATES
          </motion.h2>
        </div>
        <div className="overflow-hidden mt-4">
          <motion.p
            className="text-[1.2vw] font-sans tracking-[0.3em] text-white/60"
            initial={{ y: '-100%' }}
            animate={phase >= 2 ? { y: '0%' } : { y: '-100%' }}
            transition={{ duration: 0.8, delay: 0.1, ease: easings.expoOut }}
          >
            INITIALIZING NEURAL CONTEXT
          </motion.p>
        </div>
      </div>

      {/* Code Blocks - Left */}
      <div className="absolute left-8 bottom-16 pointer-events-none z-10 font-sans text-[0.8vw] text-white/50 leading-relaxed">
        <motion.div 
          initial={{ opacity: 0, x: -20 }} 
          animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }} 
          transition={{ duration: 0.5 }}
        >
          <pre><code>{`> ANALYZING INBOX...
> 124 UNREAD THREADS
> EXTRACTING CONTEXT...
> IDENTIFYING INTENT: URGENT`}</code></pre>
        </motion.div>
      </div>

      {/* Code Blocks - Right */}
      <div className="absolute right-8 top-16 pointer-events-none z-10 font-sans text-[0.8vw] text-white/50 text-right leading-relaxed">
        <motion.div 
          initial={{ opacity: 0, x: 20 }} 
          animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }} 
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <pre><code>{`> INTENT RECOGNIZED
> GENERATING RESPONSE...
> STATUS: READY
> AWAITING CONFIRMATION`}</code></pre>
        </motion.div>
      </div>

      {/* Glitch Overlay Effect */}
      {phase >= 4 && (
        <motion.div 
          className="absolute inset-0 bg-white z-50 mix-blend-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.8, 0, 0.4, 0] }}
          transition={{ duration: 0.4, ease: "linear" }}
        />
      )}
    </motion.div>
  );
}
