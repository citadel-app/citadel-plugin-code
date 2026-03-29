import { useState, useCallback } from 'react';
import { ReplTerminal } from '../components/ReplTerminal';
import { Terminal, Play, RefreshCw } from 'lucide-react'; // Assuming Play and RefreshCw are also needed from lucide-react

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');
import { useRepl } from '../context/ReplContext';
import { useCoreServices } from '@citadel-app/ui';

// To handle dynamic icons for languages, we'll create a map
// This assumes `lang.icon` strings directly correspond to Lucide icon names.
// You might need to expand this map based on the actual `lang.icon` values.
const LucideIconMap: Record<string, any> = {
    Terminal: Terminal,
    Play: Play,
    RefreshCw: RefreshCw,
    // Add other Lucide icons here that might be used for `lang.icon`
    // e.g., Python: Python, Javascript: Javascript, etc.
    // For now, I'll just include the ones explicitly used or implied.
};

export const ReplPage = () => {
    const { hostApi: __hostApi } = useCoreServices();
    const { selectedLang, setSelectedLang, sessionId, setSessionId, languages } = useRepl();
    const [isStarting, setIsStarting] = useState(false);

    const handleStartSession = async () => {
        if (isStarting) return;
        setIsStarting(true);
        try {
            const id = await __hostApi.module.invoke('@citadel-app/code', 'repl.startSession', selectedLang.id);
            setSessionId(id);
        } catch (error) {
            console.error('Failed to start session:', error);
        } finally {
            setIsStarting(false);
        }
    };

    const handleStopSession = async () => {
        if (!sessionId) return;
        try {
            await __hostApi.module.invoke('@citadel-app/code', 'repl.stopSession', sessionId);
            setSessionId(null);
        } catch (error) {
            console.error('Failed to stop session:', error);
        }
    };

    const handleInput = useCallback((data: string) => {
        if (sessionId) {
            __hostApi.module.invoke('@citadel-app/code', 'repl.sendInput', sessionId, data);
        }
    }, [sessionId]);

    // Helper to render dynamic Lucide icons
    const RenderLucideIcon = ({ name, size, className }: { name: string; size: number; className?: string }) => {
        const IconComponent = LucideIconMap[name];
        if (!IconComponent) {
            console.warn(`Icon "${name}" not found in LucideIconMap.`);
            return null; // Or a fallback icon
        }
        return <IconComponent size={size} className={className} />;
    };

    return (
        <div className="h-full w-full overflow-hidden bg-background p-8 flex flex-col gap-8">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-black uppercase tracking-tighter italic flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                            <Terminal size={18} />
                        </div>
                        The Forge
                    </h1>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-2 opacity-60">
                        Multi-language isolated execution environment
                    </p>
                </div>

                <div className="flex items-center gap-4 bg-muted/20 p-2 rounded-3xl border border-white/5">
                    {sessionId ? (
                        <div className="flex items-center gap-4 px-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[10px] font-black uppercase tracking-widest">{selectedLang.name} Session Active</span>
                            </div>
                            <button
                                onClick={handleStopSession}
                                className="px-6 py-2 rounded-2xl bg-red-500 text-white font-black uppercase tracking-widest text-[9px] hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                            >
                                Terminate
                            </button>
                        </div>
                    ) : (
                        <>
                            {languages.map((lang) => (
                                <button
                                    key={lang.id}
                                    onClick={() => setSelectedLang(lang)}
                                    className={cn(
                                        "p-3 rounded-2xl transition-all flex items-center gap-2 group",
                                        selectedLang.id === lang.id ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"
                                    )}
                                    title={lang.name}
                                >
                                    <RenderLucideIcon name={lang.icon as any} size={18} className={cn(selectedLang.id === lang.id ? lang.color : "opacity-40 group-hover:opacity-100")} />
                                    {selectedLang.id === lang.id && (
                                        <span className="text-[10px] font-black uppercase tracking-widest pr-1">{lang.name}</span>
                                    )}
                                </button>
                            ))}
                            <button
                                onClick={handleStartSession}
                                disabled={isStarting}
                                className="px-8 py-3 rounded-2xl bg-foreground text-background font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-foreground/10 flex items-center gap-2 disabled:opacity-50"
                            >
                                {isStarting ? (
                                    <RenderLucideIcon name="RefreshCw" size={14} className="animate-spin" />
                                ) : (
                                    <RenderLucideIcon name="Play" size={14} className="fill-current" />
                                )}
                                Start Session
                            </button>
                        </>
                    )}
                </div>
            </header>

            <main className="flex-1 w-full min-h-0 relative">
                {!sessionId && !isStarting && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center">
                        <div className="max-w-md text-center space-y-6">
                            <div className="w-24 h-24 rounded-[2.5rem] bg-muted/20 flex items-center justify-center mx-auto mb-8 border border-white/5 shadow-2xl">
                                <RenderLucideIcon name={selectedLang.icon as any} size={48} className={cn(selectedLang.color, "opacity-20")} />
                            </div>
                            <h2 className="text-2xl font-black uppercase tracking-tighter italic">Ready to execute {selectedLang.name}?</h2>
                            <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                                Starting a session will pull the <code className="bg-muted px-1.5 py-0.5 rounded text-white">{selectedLang.image}</code> image
                                if it's not present and launch a tagged container for your session.
                            </p>
                        </div>
                    </div>
                )}

                <div className={cn("w-full h-full transition-all duration-700", !sessionId && "blur-2xl opacity-20 scale-95 pointer-events-none")}>
                    <ReplTerminal sessionId={sessionId} onInput={handleInput} />
                </div>
            </main>
        </div>
    );
};
