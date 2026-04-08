import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const easings = {
  expoOut: [0.16, 1, 0.3, 1]
};

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300), // scan line
      setTimeout(() => setPhase(2), 1000), // text appear
      setTimeout(() => setPhase(3), 1800), // subtitle
      setTimeout(() => setPhase(4), 3500), // exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const title = "ReplyAI";

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-20"
      initial={{ clipPath: 'inset(0% 100% 0% 0%)' }}
      animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
      exit={{ clipPath: 'inset(0% 0% 0% 100%)', filter: 'blur(10px)' }}
      transition={{ duration: 1, ease: easings.expoOut }}
    >
      {/* Scan line */}
      <motion.div
        className="absolute top-0 bottom-0 w-[2px] bg-primary shadow-[0_0_20px_#ffffff] z-30"
        initial={{ left: '0%', opacity: 0 }}
        animate={phase >= 1 ? { left: '100%', opacity: [0, 1, 1, 0] } : {}}
        transition={{ duration: 2.5, ease: "easeInOut" }}
      />

      <div className="text-center relative z-40 flex flex-col items-center">
        <h1 className="text-[10vw] font-display font-bold text-white tracking-tighter flex overflow-hidden">
          {title.split('').map((char, i) => (
            <motion.span
              key={i}
              className="inline-block"
              initial={{ opacity: 0, y: 50, filter: 'blur(10px)' }}
              animate={phase >= 2 ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
              transition={{
                duration: 0.8,
                delay: 0.1 * i,
                ease: easings.expoOut
              }}
            >
              {char}
            </motion.span>
          ))}
        </h1>
        <motion.p
          className="text-2xl text-accent/80 font-sans tracking-wide mt-4"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: easings.expoOut }}
        >
          Your inbox, handled.
        </motion.p>
      </div>

      {/* Network nodes background */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" opacity="0.15">
        {[...Array(20)].map((_, i) => (
          <motion.circle
            key={`node-${i}`}
            cx={`${Math.random() * 100}%`}
            cy={`${Math.random() * 100}%`}
            r="2"
            fill="white"
            initial={{ scale: 0 }}
            animate={phase >= 1 ? { scale: [0, 1.5, 1], opacity: [0, 1, 0.5] } : {}}
            transition={{ delay: Math.random() * 2, duration: 1 }}
          />
        ))}
      </svg>
    </motion.div>
  );
}
