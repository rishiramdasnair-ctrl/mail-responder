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
  "Checking in on status"
];

const easings = {
  expoOut: [0.16, 1, 0.3, 1]
};

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 2200), // Freeze and scale
      setTimeout(() => setPhase(3), 3000), // Exit transition
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
      transition={{ duration: 0.8, ease: easings.expoOut }}
    >
      {/* Email items rushing in */}
      {subjects.map((sub, i) => (
        <motion.div
          key={i}
          className="absolute bg-[#0a0a0a] px-6 py-4 border border-white/20 whitespace-nowrap text-xs text-white/80 font-sans uppercase tracking-widest shadow-2xl backdrop-blur-md"
          initial={{ 
            x: i % 2 === 0 ? '-80vw' : '80vw', 
            y: `${(i - 4) * 12}vh`,
            opacity: 0,
            scale: 0.8,
            rotate: i % 2 === 0 ? -4 : 4,
            filter: 'blur(10px)'
          }}
          animate={phase >= 1 ? {
            x: `${(i % 3) * 10 - 10}vw`,
            y: `${(i - 4) * 10}vh`,
            opacity: phase >= 2 ? 0.1 : 1, // Dim when frozen
            scale: phase >= 2 ? 0.95 : 1,
            rotate: 0,
            filter: 'blur(0px)'
          } : {}}
          transition={{
            duration: phase >= 2 ? 0.4 : (1.2 + (i % 3) * 0.2),
            delay: phase >= 2 ? 0 : i * 0.08,
            ease: phase >= 2 ? "linear" : easings.expoOut
          }}
          style={{ zIndex: 10 + i }}
        >
          {sub}
        </motion.div>
      ))}

      {/* Owerwhelm text */}
      <motion.div 
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-50 mix-blend-difference"
        initial={{ opacity: 0, scale: 0.8, y: 50 }}
        animate={phase >= 2 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.8, y: 50 }}
        transition={{ duration: 0.8, ease: easings.expoOut }}
      >
        <h1 className="text-[18vw] font-display font-black leading-none text-white tracking-tighter uppercase">
          OVERLOAD
        </h1>
        <p className="font-sans tracking-[0.5em] text-white/50 text-[1.5vw] mt-4">SYSTEM INUNDATED</p>
      </motion.div>
    </motion.div>
  );
}
