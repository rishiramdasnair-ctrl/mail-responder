import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const easings = {
  expoOut: [0.16, 1, 0.3, 1]
};

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),  // Original email zooms in
      setTimeout(() => setPhase(2), 1200), // Draft slides up over it
      setTimeout(() => setPhase(3), 4200), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const draftText = "Hi Sarah,\n\nThanks for reaching out. The Q3 report is attached. I've updated the projections based on yesterday's meeting.\n\nLet me know if you need anything else.\n\nBest,\nAlex";

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-background overflow-hidden z-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(20px)' }}
      transition={{ duration: 0.8, ease: easings.expoOut }}
    >
      {/* Background Code Scroller */}
      <motion.div
        className="absolute right-0 top-0 bottom-0 w-1/3 opacity-[0.03] font-sans text-[0.5rem] leading-tight overflow-hidden break-all text-white"
        initial={{ y: '0%' }}
        animate={{ y: '-50%' }}
        transition={{ duration: 20, ease: "linear", repeat: Infinity }}
      >
        {Array(100).fill("function processContext(msg) { return ai.parse(msg.body); } const reply = generate(context); ").join("")}
      </motion.div>

      {/* Container for emails */}
      <div className="relative w-[80vw] max-w-[800px] h-[60vh]">
        
        {/* Original Email */}
        <motion.div
          className="absolute top-0 left-0 w-3/4 bg-highlight border border-white/10 p-8 shadow-2xl"
          initial={{ opacity: 0, y: 50, rotateX: -20, perspective: 1000 }}
          animate={phase >= 1 ? { 
            opacity: phase >= 2 ? 0.3 : 1, 
            y: phase >= 2 ? -20 : 0, 
            rotateX: 0,
            scale: phase >= 2 ? 0.9 : 1 
          } : {}}
          transition={{ duration: 0.8, ease: easings.expoOut }}
        >
          <div className="font-sans text-sm text-secondary uppercase tracking-widest mb-4 border-b border-white/10 pb-2">Incoming Message</div>
          <div className="font-display font-bold text-white text-2xl mb-4">URGENT: Q3 Report Needed</div>
          <div className="text-secondary/80 font-sans text-sm leading-relaxed">
            Hey, checking in on the Q3 report. We need this for the all-hands tomorrow. Have you had a chance to update the projections we discussed?
          </div>
        </motion.div>

        {/* AI Draft */}
        <motion.div
          className="absolute bottom-0 right-0 w-3/4 bg-white text-black p-8 shadow-2xl"
          initial={{ opacity: 0, y: 100, x: 50 }}
          animate={phase >= 2 ? { opacity: 1, y: 0, x: 0 } : {}}
          transition={{ duration: 0.8, ease: easings.expoOut }}
        >
          <div className="flex justify-between items-center mb-6 border-b border-black/10 pb-4">
            <div className="font-sans text-sm font-bold uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 bg-black block animate-pulse" />
              Smart Reply
            </div>
            <div className="font-sans text-xs uppercase tracking-widest opacity-50">Drafting...</div>
          </div>
          
          <div className="font-sans text-base leading-relaxed whitespace-pre-wrap min-h-[150px]">
            {phase >= 2 && (
              <motion.span initial={{ display: "none" }} animate={{ display: "inline" }}>
                {draftText.split("").map((char, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.01 + 0.3 }}
                  >
                    {char}
                  </motion.span>
                ))}
              </motion.span>
            )}
            <motion.span
              className="inline-block w-2 h-4 bg-black ml-1 align-middle"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
            />
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}