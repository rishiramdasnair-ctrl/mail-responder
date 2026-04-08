import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const easings = {
  expoOut: [0.16, 1, 0.3, 1]
};

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),  // Original email
      setTimeout(() => setPhase(2), 1200), // Draft box appears
      setTimeout(() => setPhase(3), 4000), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const draftText = "Hi Sarah,\n\nThanks for reaching out. The Q3 report is attached. I've updated the projections based on yesterday's meeting.\n\nLet me know if you need anything else.\n\nBest,\nAlex";

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center gap-12 px-[10vw] z-20"
      initial={{ scale: 0.9, opacity: 0, filter: 'blur(10px)' }}
      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
      exit={{ scale: 1.1, opacity: 0, x: '-10vw' }}
      transition={{ duration: 0.8, ease: easings.expoOut }}
    >
      {/* Original Email */}
      <motion.div
        className="w-1/2 max-w-[500px] glass-panel rounded-xl p-8 border border-white/10"
        initial={{ x: '-20vw', opacity: 0 }}
        animate={phase >= 1 ? { x: 0, opacity: 1 } : {}}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      >
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white/50 font-medium">S</div>
          <div>
            <div className="font-bold text-white text-lg">Sarah Jenkins</div>
            <div className="text-sm text-white/40">sarah@example.com</div>
          </div>
        </div>
        <div className="font-semibold text-xl text-white mb-4">URGENT: Q3 Report Needed</div>
        <div className="text-white/70 leading-relaxed font-sans">
          Hey, checking in on the Q3 report. We need this for the all-hands tomorrow. Have you had a chance to update the projections we discussed?
        </div>
      </motion.div>

      {/* AI Draft */}
      <motion.div
        className="w-1/2 max-w-[500px] bg-white rounded-xl p-8 text-black shadow-2xl relative overflow-hidden"
        initial={{ x: '20vw', opacity: 0 }}
        animate={phase >= 2 ? { x: 0, opacity: 1 } : {}}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      >
        {/* Sparkles icon */}
        <div className="absolute top-4 right-4 text-[#ff4444]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
        </div>
        
        <div className="font-medium text-black/50 mb-6 text-sm uppercase tracking-wider">Drafting Reply...</div>
        <div className="text-black/90 leading-relaxed font-sans whitespace-pre-wrap text-lg min-h-[200px]">
          {phase >= 2 && (
            <motion.span
              initial={{ display: "none" }}
              animate={{ display: "inline" }}
            >
              {draftText.split("").map((char, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.01 }}
                >
                  {char}
                </motion.span>
              ))}
            </motion.span>
          )}
          <motion.span
            className="inline-block w-2 h-5 bg-black ml-1 align-middle"
            animate={{ opacity: [1, 0, 1] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
