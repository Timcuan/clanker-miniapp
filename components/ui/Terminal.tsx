'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface TerminalLineProps {
  prefix?: string;
  text: string;
  type?: 'command' | 'output' | 'success' | 'error' | 'info' | 'warning';
  delay?: number;
  typing?: boolean;
  onComplete?: () => void;
}

export function TerminalLine({
  prefix = '$',
  text,
  type = 'command',
  delay = 0,
  typing = false,
  onComplete
}: TerminalLineProps) {
  const [displayText, setDisplayText] = useState(typing ? '' : text);
  const [showCursor, setShowCursor] = useState(typing);


  useEffect(() => {
    if (!typing) return;

    let timeout: NodeJS.Timeout;
    let charIndex = 0;

    const startTyping = () => {
      const typeChar = () => {
        if (charIndex < text.length) {
          setDisplayText(text.slice(0, charIndex + 1));
          charIndex++;
          timeout = setTimeout(typeChar, 30 + Math.random() * 40);
        } else {
          setShowCursor(false);
          onComplete?.();
        }
      };
      typeChar();
    };

    timeout = setTimeout(startTyping, delay);

    return () => clearTimeout(timeout);
  }, [text, typing, delay, onComplete]);

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return 'text-emerald-600 dark:text-emerald-400';
      case 'error':
        return 'text-red-500 dark:text-red-400';
      case 'warning':
        return 'text-amber-600 dark:text-amber-400';
      case 'info':
        return 'text-umkm-primary dark:text-umkm-accent';
      case 'output':
        return 'text-gray-600 dark:text-gray-300';
      default:
        return 'text-gray-800 dark:text-white';
    }
  };

  const getPrefixStyles = () => {
    switch (type) {
      case 'success':
        return 'text-emerald-500';
      case 'error':
        return 'text-red-500';
      case 'warning':
        return 'text-amber-500';
      case 'info':
        return 'text-umkm-primary';
      default:
        return 'text-umkm-secondary';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: delay / 1000, duration: 0.2 }}
      className="font-mono text-xs sm:text-sm leading-relaxed flex"
    >
      {type === 'command' && (
        <span className={`${getPrefixStyles()} mr-2 select-none`}>{prefix}</span>
      )}
      {type !== 'command' && (
        <span className="text-gray-300 mr-2 select-none">│</span>
      )}
      <span className={getTypeStyles()}>
        {displayText}
        {showCursor && (
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity }}
            className="inline-block w-2 h-4 bg-umkm-primary ml-0.5 align-middle"
          />
        )}
      </span>
    </motion.div>
  );
}

interface TerminalProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export function Terminal({ children, title = 'umkm-terminal', className = '' }: TerminalProps) {
  return (
    <div className={`terminal-window rounded-2xl overflow-hidden shadow-xl shadow-gray-200/50 dark:shadow-black/50 ${className}`}>
      {/* Terminal Header */}
      <div className="terminal-header flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-400" />
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-400" />
        </div>
        <span className="flex-1 text-center text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{title}</span>
        <div className="w-10 sm:w-12" />
      </div>

      {/* Terminal Body */}
      <div className="terminal-body bg-white dark:bg-gray-950 p-3 sm:p-5 border border-t-0 border-gray-100 dark:border-gray-800 min-h-[180px] sm:min-h-[200px] overflow-auto">
        {children}
      </div>
    </div>
  );
}

interface TerminalInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  prefix?: string;
  type?: 'text' | 'password';
  disabled?: boolean;
  autoFocus?: boolean;
}

export function TerminalInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Enter command...',
  prefix = '$',
  type = 'text',
  disabled = false,
  autoFocus = false,
}: TerminalInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !disabled) {
      onSubmit();
    }
  };

  return (
    <div className="flex items-center font-mono text-sm">
      <span className="text-umkm-primary mr-2 select-none">{prefix}</span>
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className="flex-1 bg-transparent border-none outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 caret-umkm-primary"
        style={{ caretColor: '#0052FF' }}
      />
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.5, repeat: Infinity }}
        className="w-2 h-4 bg-umkm-primary"
      />
    </div>
  );
}

interface TerminalLoaderProps {
  text?: string;
}

export function TerminalLoader({ text = 'Processing' }: TerminalLoaderProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 font-mono text-sm text-umkm-primary">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-4 h-4 border-2 border-umkm-primary border-t-transparent rounded-full"
      />
      <span>{text}{dots}</span>
    </div>
  );
}

interface AsciiArtProps {
  art: string;
  color?: string;
  animate?: boolean;
}

export function AsciiArt({ art, color = 'text-umkm-primary', animate = true }: AsciiArtProps) {
  const lines = art.split('\n');

  return (
    <pre className={`font-mono text-xs leading-tight ${color} select-none`}>
      {lines.map((line, i) => (
        <motion.div
          key={i}
          initial={animate ? { opacity: 0, x: -20 } : {}}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
        >
          {line}
        </motion.div>
      ))}
    </pre>
  );
}

// UMKM Terminal ASCII Art - Desktop
export const UMKM_ASCII = `
██╗   ██╗███╗   ███╗██╗  ██╗███╗   ███╗
██║   ██║████╗ ████║██║ ██╔╝████╗ ████║
██║   ██║██╔████╔██║█████╔╝ ██╔████╔██║
██║   ██║██║╚██╔╝██║██╔═██╗ ██║╚██╔╝██║
╚██████╔╝██║ ╚═╝ ██║██║  ██╗██║ ╚═╝ ██║
 ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝
`;

// Compact version for mobile/Telegram MiniApp
export const UMKM_ASCII_COMPACT = `
╦ ╦╔╦╗╦╔═╔╦╗
║ ║║║║╠╩╗║║║
╚═╝╩ ╩╩ ╩╩ ╩
`;

// Simple text logo for very small screens
export const UMKM_LOGO_TEXT = '[UMKM]';

// Deploy icon - compact
export const DEPLOY_ASCII = `
  /\\
 /  \\
/____\\
  ||
`;

// Keep for backwards compatibility
export const CLANKER_ASCII = UMKM_ASCII;

// Responsive ASCII component
export function ResponsiveAscii({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      {/* Desktop */}
      <pre className="hidden sm:block font-mono text-xs leading-none text-umkm-primary dark:text-blue-400 whitespace-pre">
        {UMKM_ASCII}
      </pre>
      {/* Mobile */}
      <pre className="sm:hidden font-mono text-xs leading-none text-umkm-primary dark:text-blue-400 whitespace-pre text-center">
        {UMKM_ASCII_COMPACT}
      </pre>
    </div>
  );
}
