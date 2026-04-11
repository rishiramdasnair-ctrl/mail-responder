import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const easings = {
  expoOut: [0.16, 1, 0.3, 1]
};

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),  // Context email slides in
      setTimeout(() => setPhase(2), 1000), // Draft UI appears
      setTimeout(() => setPhase(3), 3800), // Scene begins to close
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const draftText = "Hi Sarah,\n\nThanks for reaching out. The Q3 report is attached. I've updated the projections based on yesterday's meeting.\n\nBest,\nAlex";

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-20 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05, y: -50, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: easings.expoOut }}
    >
      <div className="flex flex-row items-center justify-between w-[80vw] h-[60vh] relative">
        
        {/* Left Side: Original Context */}
        <motion.div
          className="w-[45%] h-full bg-[#111] border border-white/10 p-8 flex flex-col relative"
          initial={{ x: '-50vw', opacity: 0, rotateY: 30, perspective: 1000 }}
          animate={phase >= 1 ? { x: 0, opacity: phase >= 3 ? 0.3 : 1, rotateY: 0 } : {}}
          transition={{ duration: 1, ease: easings.expoOut }}
        >
          <div className="absolute top-0 right-0 p-4 font-sans text-[0.6vw] text-white/30 tracking-widest">CONTEXT_ID: 9481</div>
          <div className="font-sans text-[0.8vw] text-white/50 uppercase tracking-widest mb-6 border-b border-white/10 pb-4">Incoming Message</div>
          <div className="font-display font-bold text-white text-[2vw] leading-tight mb-6">URGENT: Q3 Report Needed</div>
          <div className="text-white/70 font-sans text-[1vw] leading-relaxed">
            Hey, checking in on the Q3 report. We need this for the all-hands tomorrow. Have you had a chance to update the projections we discussed?
          </div>
          
          {/* AI scan indicator */}
          <motion.div 
            className="absolute bottom-8 left-8 right-8 h-[1px] bg-white/20"
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : {}}
          >
            <motion.div 
              className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"
              initial={{ width: '0%' }}
              animate={phase >= 2 ? { width: '100%' } : {}}
              transition={{ duration: 1.5, ease: "easeInOut" }}
            />
          </motion.div>
        </motion.div>

        {/* Right Side: AI Generated Draft */}
        <motion.div
          className="w-[45%] h-full bg-white text-black p-8 flex flex-col relative overflow-hidden"
          initial={{ x: '50vw', opacity: 0, rotateY: -30, perspective: 1000 }}
          animate={phase >= 2 ? { x: 0, opacity: 1, rotateY: 0 } : {}}
          transition={{ duration: 1, ease: easings.expoOut }}
        >
          <div className="flex justify-between items-center mb-8 border-b border-black/10 pb-4">
            <div className="font-sans text-[0.8vw] font-bold uppercase tracking-widest flex items-center gap-3">
              <span className="w-2 h-2 bg-black block rounded-full animate-pulse" />
              Smart Reply
            </div>
            <div className="font-sans text-[0.6vw] uppercase tracking-widest opacity-50">Auto-Drafting</div>
          </div>
          
          <div className="font-sans text-[1vw] leading-relaxed whitespace-pre-wrap flex-1">
            {phase >= 2 && (
              <motion.span initial={{ display: "none" }} animate={{ display: "inline" }}>
                {draftText.split("").map((char, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.015 + 0.5 }}
                  >
                    {char}
                  </motion.span>
                ))}
              </motion.span>
            )}
            <motion.span
              className="inline-block w-2 h-[1em] bg-black ml-1 align-middle"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
            />
          </div>
          
          <motion.div 
            className="w-full bg-black text-white text-center py-4 font-sans uppercase tracking-widest text-[0.8vw] font-bold mt-auto"
            initial={{ y: 50, opacity: 0 }}
            animate={phase >= 2 ? { y: 0, opacity: 1 } : {}}
            transition={{ duration: 0.5, delay: 2.5 }}
          >
            Send Reply
          </motion.div>
        </motion.div>

      </div>
    </motion.div>
  );
}
