'use client';

import { motion } from 'framer-motion';
import {
  Rocket,
  Shield,
  Coins,
  Zap,
  CheckCircle2,
  ExternalLink,
  Code2,
  Sparkles,
  TrendingUp,
  Lock
} from 'lucide-react';

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
  color: string;
}

function FeatureCard({ icon, title, description, delay = 0, color }: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      whileHover={{ y: -2 }}
      className="group relative overflow-hidden rounded-xl bg-white dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 p-3 sm:p-4 hover:shadow-lg hover:border-gray-200 dark:hover:border-gray-700 transition-all duration-300 backdrop-blur-sm"
    >
      <div className="relative z-10 flex items-start gap-2.5 sm:gap-3">
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl ${color} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-100 mb-0.5">{title}</h3>
          <p className="font-mono text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">{description}</p>
        </div>
      </div>
    </motion.div>
  );
}

interface StatCardProps {
  value: string;
  label: string;
  delay?: number;
}

function StatCard({ value, label, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.4 }}
      className="text-center p-2.5 sm:p-4 rounded-xl bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-900/50 border border-[#0052FF]/10 dark:border-[#0052FF]/20 backdrop-blur-sm"
    >
      <div className="font-display text-base sm:text-lg font-bold text-[#0052FF] dark:text-blue-400">
        {value}
      </div>
      <div className="font-mono text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 uppercase tracking-wider font-bold">{label}</div>
    </motion.div>
  );
}

export default function AboutSection() {
  const features = [
    {
      icon: <Rocket className="w-4 h-4 sm:w-5 sm:h-5 text-white" />,
      title: "Quick Deploy",
      description: "Launch tokens in seconds",
      color: "bg-[#0052FF]",
    },
    {
      icon: <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-white" />,
      title: "MEV Protection",
      description: "Anti-sniper bot mechanism",
      color: "bg-violet-500",
    },
    {
      icon: <Coins className="w-4 h-4 sm:w-5 sm:h-5 text-white" />,
      title: "Earn Rewards",
      description: "Collect trading fees",
      color: "bg-amber-500",
    },
    {
      icon: <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />,
      title: "Verified",
      description: "Trusted & visible tokens",
      color: "bg-emerald-500",
    },
  ];

  const techStack = [
    { icon: <Code2 className="w-4 h-4" />, name: "Clanker SDK v4" },
    { icon: <Zap className="w-4 h-4" />, name: "Base Network" },
    { icon: <Lock className="w-4 h-4" />, name: "Encrypted Sessions" },
    { icon: <TrendingUp className="w-4 h-4" />, name: "Dynamic Fees" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center space-y-2 sm:space-y-3"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", duration: 0.6 }}
          className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-[#0052FF]/20 dark:border-blue-500/30 shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0052FF] dark:text-blue-400" />
          <span className="font-mono text-[10px] sm:text-xs text-[#0052FF] dark:text-blue-400 font-bold uppercase tracking-wide">Powered by Clanker SDK</span>
        </motion.div>

        <h2 className="font-display text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100">
          Token Deployer for Base
        </h2>
        <p className="font-mono text-xs sm:text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
          Deploy ERC-20 tokens with MEV protection and instant verification.
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard value="<30s" label="Deploy" delay={0.1} />
        <StatCard value="100%" label="Verified" delay={0.2} />
        <StatCard value="0%" label="Rug Risk" delay={0.3} />
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {features.map((feature, index) => (
          <FeatureCard
            key={feature.title}
            icon={feature.icon}
            title={feature.title}
            description={feature.description}
            color={feature.color}
            delay={0.4 + index * 0.1}
          />
        ))}
      </div>

      {/* Tech Stack */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="p-3 sm:p-5 rounded-xl bg-gray-50/50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800 backdrop-blur-sm"
      >
        <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4">
          <Code2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0052FF] dark:text-blue-400" />
          <span className="font-mono text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">Tech Stack</span>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-2.5">
          {techStack.map((tech, index) => (
            <motion.div
              key={tech.name}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.9 + index * 0.1 }}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow"
            >
              <span className="text-[#0052FF] dark:text-blue-400 [&>svg]:w-3.5 [&>svg]:h-3.5 sm:[&>svg]:w-4 sm:[&>svg]:h-4">{tech.icon}</span>
              <span className="font-mono text-[10px] sm:text-xs text-gray-700 dark:text-gray-300 font-medium">{tech.name}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* CTA Links */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="flex items-center justify-center gap-3 sm:gap-4 pt-1 sm:pt-2"
      >
        <a
          href="https://clanker.world"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 font-mono text-[10px] sm:text-xs text-gray-500 hover:text-[#0052FF] transition-colors"
        >
          <span>clanker.world</span>
          <ExternalLink className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
        </a>
        <span className="text-gray-300 text-xs">•</span>
        <a
          href="https://basescan.org"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 font-mono text-[10px] sm:text-xs text-gray-500 hover:text-[#0052FF] transition-colors"
        >
          <span>BaseScan</span>
          <ExternalLink className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
        </a>
      </motion.div>

      {/* Version Info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        className="text-center pt-2"
      >
        <p className="font-mono text-[9px] sm:text-xs text-gray-400">
          UMKM v2.0 • Base Network
        </p>
      </motion.div>
    </div>
  );
}
