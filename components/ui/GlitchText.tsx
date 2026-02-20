'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface GlitchTextProps {
  text: string;
  className?: string;
  glitchIntensity?: 'low' | 'medium' | 'high';
}

export function GlitchText({ text, className = '', glitchIntensity = 'medium' }: GlitchTextProps) {
  const [isGlitching, setIsGlitching] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsGlitching(true);
      setTimeout(() => setIsGlitching(false), 100);
    }, glitchIntensity === 'high' ? 3000 : glitchIntensity === 'medium' ? 5000 : 8000);

    return () => clearInterval(interval);
  }, [glitchIntensity]);

  return (
    <span className={`relative inline-block ${className}`}>
      <span className="relative z-10">{text}</span>
      {isGlitching && (
        <>
          <span 
            className="absolute top-0 left-0 text-umkm-primary opacity-40 z-0"
            style={{ transform: 'translate(-1px, -0.5px)', clipPath: 'inset(10% 0 60% 0)' }}
          >
            {text}
          </span>
          <span 
            className="absolute top-0 left-0 text-umkm-accent opacity-40 z-0"
            style={{ transform: 'translate(1px, 0.5px)', clipPath: 'inset(40% 0 20% 0)' }}
          >
            {text}
          </span>
        </>
      )}
    </span>
  );
}

interface TypewriterTextProps {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
  onComplete?: () => void;
  cursor?: boolean;
}

export function TypewriterText({ 
  text, 
  speed = 50, 
  delay = 0, 
  className = '',
  onComplete,
  cursor = true
}: TypewriterTextProps) {
  const [displayText, setDisplayText] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    let charIndex = 0;

    const startTyping = () => {
      const typeChar = () => {
        if (charIndex < text.length) {
          setDisplayText(text.slice(0, charIndex + 1));
          charIndex++;
          timeout = setTimeout(typeChar, speed + Math.random() * 30);
        } else {
          setIsComplete(true);
          onComplete?.();
        }
      };
      typeChar();
    };

    timeout = setTimeout(startTyping, delay);

    return () => clearTimeout(timeout);
  }, [text, speed, delay, onComplete]);

  return (
    <span className={className}>
      {displayText}
      {cursor && !isComplete && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="inline-block w-2 h-4 bg-umkm-primary ml-0.5 align-middle"
        />
      )}
    </span>
  );
}

interface MatrixRainProps {
  className?: string;
}

export function MatrixRain({ className = '' }: MatrixRainProps) {
  const [mounted, setMounted] = useState(false);
  const chars = 'UMKM01';
  const columns = 12;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render on server to avoid hydration mismatch
  if (!mounted) {
    return <div className={`absolute inset-0 ${className}`} />;
  }

  // Generate stable random values based on index
  const getStableRandom = (seed: number) => {
    const x = Math.sin(seed * 9999) * 10000;
    return x - Math.floor(x);
  };

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none opacity-[0.03] ${className}`}>
      {Array.from({ length: columns }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute top-0 font-mono text-xs text-umkm-primary whitespace-nowrap"
          style={{ left: `${(i / columns) * 100}%` }}
          initial={{ y: '-100%' }}
          animate={{ y: '100vh' }}
          transition={{
            duration: 10 + getStableRandom(i) * 5,
            repeat: Infinity,
            delay: getStableRandom(i + 100) * 4,
            ease: 'linear',
          }}
        >
          {Array.from({ length: 15 }).map((_, j) => (
            <div key={j} style={{ opacity: 1 - j * 0.05 }}>
              {chars[Math.floor(getStableRandom(i * 100 + j) * chars.length)]}
            </div>
          ))}
        </motion.div>
      ))}
    </div>
  );
}

interface ScanlineProps {
  className?: string;
}

export function Scanlines({ className = '' }: ScanlineProps) {
  return (
    <div 
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{
        background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0, 82, 255, 0.02) 3px, rgba(0, 82, 255, 0.02) 6px)',
      }}
    />
  );
}

interface BlinkingCursorProps {
  className?: string;
}

export function BlinkingCursor({ className = '' }: BlinkingCursorProps) {
  return (
    <motion.span
      animate={{ opacity: [1, 0] }}
      transition={{ duration: 0.5, repeat: Infinity }}
      className={`inline-block w-2 h-4 bg-umkm-primary ${className}`}
    />
  );
}
