import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useCoreServices } from '@citadel-app/ui';

interface Language {
    id: string;
    name: string;
    icon: string;
    color: string;
    image: string;
}

const LANGUAGES: Language[] = [
    { id: 'python', name: 'Python', icon: 'Python', color: 'text-blue-400', image: 'python:3.11-slim' },
    { id: 'node', name: 'Node.js', icon: 'nodedotjs', color: 'text-green-400', image: 'node:18-slim' },
    { id: 'go', name: 'Go', icon: 'Go', color: 'text-sky-400', image: 'golang:1.21-alpine' },
    { id: 'rust', name: 'Rust', icon: 'Rust', color: 'text-orange-400', image: 'rust:1.72-slim' },
    { id: 'ruby', name: 'Ruby', icon: 'Ruby', color: 'text-red-400', image: 'ruby:3.2-slim' },
    { id: 'lua', name: 'Lua', icon: 'lua', color: 'text-sky-500', image: 'nickblah/lua:alpine' }
];

interface ReplContextType {
    selectedLang: Language;
    setSelectedLang: (lang: Language) => void;
    sessionId: string | null;
    setSessionId: (id: string | null) => void;
    languages: Language[];
}

const ReplContext = createContext<ReplContextType | null>(null);

export const useRepl = () => {
    const context = useContext(ReplContext);
    if (!context) {
        throw new Error('useRepl must be used within a ReplProvider');
    }
    return context;
};

export const ReplProvider = ({ children }: { children: ReactNode }) => {
    const { hostApi: __hostApi } = useCoreServices();
    const [selectedLang, setSelectedLang] = useState<Language>(LANGUAGES[0]);
    const [sessionId, setSessionId] = useState<string | null>(null);

    // Validate session on mount and whenever sessionId changes
    useEffect(() => {
        if (!sessionId) return;

        const validate = async () => {
            const isRunning = await __hostApi.module.invoke('@citadel-app/code', 'repl.checkSession', sessionId);
            if (!isRunning) {
                console.warn(`[ReplContext] Session ${sessionId} is no longer running. Clearing.`);
                setSessionId(null);
            }
        };

        validate();
    }, [sessionId]);

    return (
        <ReplContext.Provider value={{
            selectedLang,
            setSelectedLang,
            sessionId,
            setSessionId,
            languages: LANGUAGES
        }}>
            {children}
        </ReplContext.Provider>
    );
};
