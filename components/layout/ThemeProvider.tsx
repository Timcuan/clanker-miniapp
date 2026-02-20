'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>('light');

    useEffect(() => {
        const initTheme = async () => {
            let savedTheme: Theme | null = null;

            // Try to get from Telegram CloudStorage first if available
            try {
                // @ts-ignore
                const tg = window.Telegram?.WebApp;
                if (tg && tg.CloudStorage) {
                    savedTheme = await new Promise<Theme | null>((resolve) => {
                        tg.CloudStorage.getItem('umkm_theme', (err: any, value?: string) => {
                            if (!err && (value === 'light' || value === 'dark')) {
                                resolve(value as Theme);
                            } else {
                                resolve(null);
                            }
                        });
                    });
                }
            } catch (e) {
                console.warn('Failed to read theme from CloudStorage', e);
            }

            // Fallback to localStorage
            if (!savedTheme) {
                savedTheme = localStorage.getItem('umkm_theme') as Theme | null;
            }

            // User requested default to be LIGHT MODE
            const initialTheme = savedTheme || 'light';
            setTheme(initialTheme);

            if (initialTheme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        };

        initTheme();
    }, []);

    const toggleTheme = () => {
        const nextTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(nextTheme);
        localStorage.setItem('umkm_theme', nextTheme);

        // Try to save to Telegram CloudStorage
        try {
            // @ts-ignore
            const tg = window.Telegram?.WebApp;
            if (tg && tg.CloudStorage) {
                tg.CloudStorage.setItem('umkm_theme', nextTheme);
            }
        } catch (e) {
            console.warn('Failed to save theme to CloudStorage', e);
        }

        if (nextTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
