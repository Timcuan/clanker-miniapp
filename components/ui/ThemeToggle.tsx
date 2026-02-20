'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/layout/ThemeProvider';
import { motion } from 'framer-motion';

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();

    return (
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleTheme}
            className="p-2 rounded-xl transition-all bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md text-gray-400 hover:text-[#0052FF]"
            title={theme === 'light' ? 'Switch to Night Mode' : 'Switch to Light Mode'}
        >
            {theme === 'light' ? (
                <Moon className="w-5 h-5" />
            ) : (
                <Sun className="w-5 h-5 text-yellow-400" />
            )}
        </motion.button>
    );
}
