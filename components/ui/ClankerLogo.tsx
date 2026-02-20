'use client';

import { motion } from 'framer-motion';

interface ClankerLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  showText?: boolean;
}

export default function ClankerLogo({ size = 'md', animated = true, showText = false }: ClankerLogoProps) {
  const sizeMap = {
    sm: { width: 24, height: 24 },
    md: { width: 28, height: 28 },
    lg: { width: 32, height: 32 },
    xl: { width: 40, height: 40 }
  };

  const { width, height } = sizeMap[size];

  return (
    <div className="flex items-center gap-2">
      <motion.div
        initial={animated ? { scale: 0, opacity: 0 } : undefined}
        animate={animated ? { scale: 1, opacity: 1 } : undefined}
        transition={animated ? { duration: 0.4, type: "spring", stiffness: 200 } : undefined}
        className="relative flex-shrink-0"
      >
        {/* Base Chain Official Logo Style */}
        <svg
          width={width}
          height={height}
          viewBox="0 0 111 111"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Blue circle background */}
          <circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF" />

          {/* White "b" shape - Base logo */}
          <path
            d="M55.4 93.3c20.9 0 37.9-17 37.9-37.9 0-20.9-17-37.9-37.9-37.9-20.2 0-36.7 15.8-37.8 35.7h50.1v4.4H17.6c1.1 19.9 17.6 35.7 37.8 35.7z"
            fill="white"
          />
        </svg>

        {/* Subtle glow effect */}
        {animated && (
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.35, 0.2] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full bg-[#0052FF]/30 blur-lg -z-10"
          />
        )}
      </motion.div>

      {showText && (
        <div className="flex items-center min-w-0">
          {/* Stylized UMKM text with gradient and modern font */}
          <div className="flex items-center">
            <span className="font-display text-lg sm:text-xl font-extrabold tracking-tight">
              <span className="text-[#0052FF] dark:text-blue-400">U</span>
              <span className="text-[#0052FF] dark:text-blue-400">M</span>
              <span className="text-[#1a73e8] dark:text-blue-300">K</span>
              <span className="text-[#1a73e8] dark:text-blue-300">M</span>
            </span>
            {animated && (
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
                className="w-0.5 h-4 sm:h-5 bg-[#0052FF] dark:bg-blue-400 ml-0.5 rounded-full"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
