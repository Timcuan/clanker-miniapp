'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface CLIButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'info' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  className?: string;
  fullWidth?: boolean;
  agentId?: string;
}

export function CLIButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  className = '',
  fullWidth = false,
  agentId,
}: CLIButtonProps) {
  const baseStyles = 'font-mono relative overflow-hidden transition-all duration-200 flex items-center justify-center gap-2 border';

  const variantStyles = {
    primary: 'bg-umkm-primary text-white border-umkm-primary hover:bg-umkm-secondary hover:shadow-[0_4px_20px_rgba(0,82,255,0.25)]',
    secondary: 'bg-white dark:bg-gray-900 border-umkm-primary/30 dark:border-umkm-primary/50 text-umkm-primary hover:bg-umkm-light dark:hover:bg-gray-800 hover:border-umkm-primary/50',
    danger: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 hover:border-red-300',
    ghost: 'bg-transparent border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900',
    success: 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600 shadow-[0_4px_15px_rgba(16,185,129,0.25)]',
    info: 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 shadow-[0_4px_15px_rgba(59,130,246,0.25)]',
    warning: 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600 shadow-[0_4px_15px_rgba(245,158,11,0.25)]',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-3 sm:px-4 py-2.5 text-xs sm:text-sm rounded-xl',
    lg: 'px-4 sm:px-6 py-3 sm:py-3.5 text-sm sm:text-base rounded-xl',
  };

  const disabledStyles = disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
  const widthStyles = fullWidth ? 'w-full' : '';

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled || loading}
      whileHover={!disabled && !loading ? { scale: 1.02 } : {}}
      whileTap={!disabled && !loading ? { scale: 0.98 } : {}}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${disabledStyles} ${widthStyles} ${className}`}
      {...(agentId && { 'data-agent': agentId })}
    >
      {/* Subtle shine effect */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
        initial={{ x: '-100%' }}
        animate={{ x: '100%' }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'linear', repeatDelay: 1 }}
      />

      {loading ? (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
        />
      ) : icon ? (
        icon
      ) : null}

      <span className="relative z-10">{loading ? 'Processing...' : children}</span>

    </motion.button>
  );
}

interface CLICardProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
  agentId?: string;
}

export function CLICard({ children, title, className = '', onClick, hoverable = false, agentId }: CLICardProps) {
  const Component = onClick ? motion.button : motion.div;

  return (
    <Component
      onClick={onClick}
      whileHover={hoverable ? { scale: 1.01 } : {}}
      whileTap={hoverable ? { scale: 0.99 } : {}}
      className={`relative w-full text-left block bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md active:shadow-sm transition-all ${hoverable ? 'cursor-pointer' : ''} ${className}`}
      {...(agentId && { 'data-agent': agentId })}
    >
      {title && (
        <div className="px-3 sm:px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          <span className="font-mono text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">{`// ${title}`}</span>
        </div>
      )}
      <div className="p-3 sm:p-4">
        {children}
      </div>
    </Component>
  );
}

interface CLIInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
  label?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  agentId?: string;
}

export function CLIInput({
  value,
  onChange,
  placeholder = '',
  type = 'text',
  label,
  error,
  disabled = false,
  className = '',
  agentId,
}: CLIInputProps) {
  return (
    <div className={`space-y-1.5 sm:space-y-2 ${className}`}>
      {label && (
        <label className="block font-mono text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
          <span className="text-[#0052FF] font-medium">const</span> {label} <span className="text-gray-400 dark:text-gray-500">=</span>
        </label>
      )}
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full bg-white dark:bg-gray-900 border ${error ? 'border-red-300 dark:border-red-500/50 bg-red-50/50 dark:bg-red-950/20' : 'border-gray-200 dark:border-gray-800'} rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 font-mono text-xs sm:text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20 transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          style={{ caretColor: '#0052FF' }}
          {...(agentId && { 'data-agent': agentId })}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-[10px] sm:text-xs">
          {type === 'password' ? '••••' : ''}
        </span>
      </div>
      {error && (
        <p className="font-mono text-[10px] sm:text-xs text-red-500">
          <span className="text-red-600 font-medium">Error:</span> {error}
        </p>
      )}
    </div>
  );
}

interface StatusBadgeProps {
  status: 'online' | 'offline' | 'pending' | 'error';
  text?: string;
}

export function StatusBadge({ status, text }: StatusBadgeProps) {
  const statusStyles = {
    online: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50',
    offline: 'bg-gray-50 dark:bg-gray-900/30 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-800',
    pending: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50',
    error: 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50',
  };

  const statusDot = {
    online: 'bg-emerald-500',
    offline: 'bg-gray-400',
    pending: 'bg-amber-500',
    error: 'bg-red-500',
  };

  const defaultText = {
    online: 'CONNECTED',
    offline: 'DISCONNECTED',
    pending: 'PENDING',
    error: 'ERROR',
  };

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border font-mono text-xs ${statusStyles[status]}`}>
      <motion.span
        animate={status === 'pending' ? { opacity: [1, 0.3, 1] } : status === 'online' ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
        className={`w-2 h-2 rounded-full ${statusDot[status]}`}
      />
      {text || defaultText[status]}
    </div>
  );
}
