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
  const [count, setCount] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 2500), // Freeze
      setTimeout(() => setPhase(3), 3200), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  useEffect(() => {
    if (phase === 1) {
      let c = 0;
      const interval = setInterval(() => {
        c += Math.floor(Math.random() * 5) + 1;
        if (c > 134) c = 134;
        setCount(c);
        if (c === 134) clearInterval(interval);
      }, 50);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [phase]);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-20"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ scale: 1.1, opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: easings.expoOut }}
    >
      <div className="relative w-full h-full overflow-hidden">
        {/* Email noise */}
        {subjects.map((sub, i) => (
          <motion.div
            key={i}
            className="absolute bg-highlight px-6 py-3 rounded-lg border border-white/5 shadow-2xl backdrop-blur-sm whitespace-nowrap text-sm text-secondary font-medium tracking-wide"
            initial={{ 
              x: (i % 2 === 0 ? '-120vw' : '120vw'), 
              y: `${20 + (i * 5)}vh`,
              opacity: 0,
              scale: 0.8
            }}
            animate={phase >= 1 ? {
              x: `${(i % 3) * 10}vw`,
              y: `${10 + (i * 7)}vh`,
              opacity: phase === 2 ? 0.3 : 1, // Dim when frozen
              scale: phase === 2 ? 0.9 : 1,
            } : {}}
            transition={{
              duration: phase === 2 ? 0.2 : (1.5 + Math.random()),
              delay: phase === 2 ? 0 : i * 0.1,
              ease: phase === 2 ? "linear" : easings.expoOut
            }}
            style={{ zIndex: 10 + i }}
          >
            {sub}
          </motion.div>
        ))}

        {/* Counter */}
        <motion.div 
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
          initial={{ opacity: 0, scale: 0.8, filter: 'blur(20px)' }}
          animate={phase >= 1 ? { opacity: 1, scale: 1, filter: 'blur(0px)' } : {}}
          transition={{ duration: 1, ease: easings.expoOut }}
        >
          <div className="text-center">
            <motion.h1 
              className="text-[15vw] font-display font-bold leading-none text-white tracking-tighter"
              animate={phase === 2 ? { color: '#ff4444', scale: 1.05 } : {}}
              transition={{ duration: 0.3 }}
            >
              {count}
            </motion.h1>
            <p className="text-2xl text-secondary/60 font-sans tracking-widest uppercase mt-4">
              Unread Messages
            </p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
