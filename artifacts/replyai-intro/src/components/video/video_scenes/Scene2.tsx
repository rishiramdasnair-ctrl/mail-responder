import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const easings = {
  expoOut: [0.16, 1, 0.3, 1]
};

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300), // Scan line activates
      setTimeout(() => setPhase(2), 1200), // Process text
      setTimeout(() => setPhase(3), 2000), // Code blocks
      setTimeout(() => setPhase(4), 3800), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-background overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: easings.expoOut }}
    >
      {/* Grid Background */}
      <motion.div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '4vw 4vw'
        }}
        initial={{ y: '10vh' }}
        animate={phase >= 1 ? { y: 0 } : {}}
        transition={{ duration: 2, ease: easings.expoOut }}
      />

      {/* Target Reticle */}
      <motion.div
        className="absolute w-[40vw] h-[40vw] border border-white/20 rounded-full flex items-center justify-center"
        initial={{ scale: 0, rotate: -90, opacity: 0 }}
        animate={phase >= 1 ? { scale: 1, rotate: 0, opacity: 1 } : {}}
        transition={{ duration: 1.5, ease: easings.expoOut }}
      >
        <div className="absolute w-2 h-2 bg-white top-0 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute w-2 h-2 bg-white bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" />
        <div className="absolute w-2 h-2 bg-white left-0 top-1/2 -translate-y-1/2 -translate-x-1/2" />
        <div className="absolute w-2 h-2 bg-white right-0 top-1/2 -translate-y-1/2 translate-x-1/2" />
      </motion.div>

      {/* Scanning Line */}
      <motion.div
        className="absolute w-full h-[2px] bg-white shadow-[0_0_20px_rgba(255,255,255,0.8)]"
        initial={{ top: '0%', opacity: 0 }}
        animate={phase >= 1 ? { top: '100%', opacity: [0, 1, 1, 0] } : {}}
        transition={{ duration: 3, ease: "linear" }}
      />

      {/* Text Content */}
      <div className="z-30 text-center mix-blend-difference">
        <motion.h2
          className="text-[8vw] font-display font-bold tracking-tighter text-white uppercase"
          initial={{ opacity: 0, letterSpacing: '0.2em' }}
          animate={phase >= 2 ? { opacity: 1, letterSpacing: '-0.02em' } : {}}
          transition={{ duration: 1, ease: easings.expoOut }}
        >
          AI ACTIVATES
        </motion.h2>
      </div>

      {/* Code Blocks */}
      {phase >= 3 && (
        <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between py-12 px-8 font-sans text-xs text-white/40">
          <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
            <pre><code>{`> ANALYZING INBOX...
> 124 UNREAD THREADS
> EXTRACTING CONTEXT...`}</code></pre>
          </motion.div>
          <motion.div className="self-end text-right" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
            <pre><code>{`> INTENT RECOGNIZED
> GENERATING RESPONSE...
> STATUS: READY`}</code></pre>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}