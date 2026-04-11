import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const subjects = [
  "URGENT: Q3 Report Needed",
  "Follow up on yesterday's meeting",
  "Invoice #49281 Overdue",
  "Re: Final draft approval",
  "Client feedback attached",
  "Project timeline changes",
  "Meeting rescheduled: 2PM",
  "Action Required: Compliance update",
  "Where are we on the new launch?",
  "Checking in on status",
  "Quick question about pricing",
  "New lead from website"
];

const easings = {
  expoOut: [0.16, 1, 0.3, 1]
};

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 2500), // Freeze
      setTimeout(() => setPhase(3), 3200), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-20 bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
      transition={{ duration: 0.8, ease: easings.expoOut }}
    >
      <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
        {/* Email items rushing in */}
        {subjects.map((sub, i) => (
          <motion.div
            key={i}
            className="absolute bg-highlight px-6 py-4 border border-white/20 whitespace-nowrap text-xs text-secondary font-sans uppercase tracking-widest shadow-2xl backdrop-blur-md"
            initial={{ 
              x: i % 2 === 0 ? '-120vw' : '120vw', 
              y: `${10 + (i * 7)}vh`,
              opacity: 0,
              scale: 0.8,
              rotate: i % 2 === 0 ? -2 : 2
            }}
            animate={phase >= 1 ? {
              x: `${(i % 3) * 15 + 10}vw`,
              y: `${15 + (i * 6)}vh`,
              opacity: phase === 2 ? 0.2 : 1, // Dim when frozen
              scale: phase === 2 ? 0.95 : 1,
              rotate: 0
            } : {}}
            transition={{
              duration: phase === 2 ? 0.3 : (1.2 + (i % 3) * 0.2),
              delay: phase === 2 ? 0 : i * 0.05,
              ease: phase === 2 ? "linear" : [0.22, 1, 0.36, 1]
            }}
            style={{ zIndex: 10 + i }}
          >
            {sub}
          </motion.div>
        ))}

        {/* Chaos lines */}
        {[...Array(10)].map((_, i) => (
          <motion.div
            key={`line-${i}`}
            className="absolute bg-white/10 h-[1px] w-full"
            style={{ top: `${(i + 1) * 10}vh` }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={phase >= 1 ? { scaleX: phase === 2 ? 0 : 1, opacity: phase === 2 ? 0 : 0.5 } : {}}
            transition={{ duration: 1.5, delay: i * 0.1, ease: easings.expoOut }}
          />
        ))}

        {/* Owerwhelm text */}
        <motion.div 
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-50 mix-blend-difference"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.8, ease: easings.expoOut }}
        >
          <h1 className="text-[25vw] font-display font-bold leading-none text-white tracking-tighter uppercase">
            OVERLOAD
          </h1>
        </motion.div>
      </div>
    </motion.div>
  );
}