import React, { useState, useEffect, useCallback } from 'react';
import { useCoreServices, Icon } from '@citadel-app/ui';

// A local helper for conditional classes
const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

export const CodeStatusWidget = () => {
    const { settings, hostApi: __hostApi } = useCoreServices();
    
    // Execution State
    const [executionConnected, setExecutionConnected] = useState(false);
    const [executionHealth, setExecutionHealth] = useState<any | null>(null);
    const [executionError, setExecutionError] = useState<string | null>(null);

    // Docker State
    const [dockerContainers, setDockerContainers] = useState<any[]>([]);
    const [isRefreshingDocker, setIsRefreshingDocker] = useState(false);
    const [transitioningServices, setTransitioningServices] = useState<Set<string>>(new Set());

    const refreshDockerContainers = useCallback(async () => {
        setIsRefreshingDocker(true);
        try {
            const containers = await __hostApi.module.invoke('@citadel-app/code', 'repl.listContainers');
            setDockerContainers(containers || []);
        } catch (e) {
            console.error('[CodeStatusWidget] Failed to refresh Docker containers:', e);
        } finally {
            setIsRefreshingDocker(false);
        }
    }, [__hostApi]);

    const handleStopDockerContainer = async (id: string) => {
        try {
            await __hostApi.module.invoke('@citadel-app/code', 'repl.stopContainer', id);
            await refreshDockerContainers();
        } catch (e) {
            console.error('[CodeStatusWidget] Failed to stop container:', e);
        }
    };

    const handleRemoveDockerContainer = async (id: string) => {
        try {
            await __hostApi.module.invoke('@citadel-app/code', 'repl.removeContainer', id);
            await refreshDockerContainers();
        } catch (e) {
            console.error('[CodeStatusWidget] Failed to remove container:', e);
        }
    };

    const refreshExecution = useCallback(async () => {
        try {
            // Force 127.0.0.1 to avoid IPv6 issues if localhost resolves to ::1
            const baseUrl = settings?.executionUrl || 'http://127.0.0.1:5051';
            const url = baseUrl.replace('localhost', '127.0.0.1');

            const res = await fetch(`${url}/health`);
            if (res.ok) {
                const health = await res.json();
                setExecutionHealth(health);
                setExecutionConnected(true);
                setExecutionError(null);
            } else {
                setExecutionHealth(null);
                setExecutionConnected(false);
                setExecutionError(`Status ${res.status}: ${res.statusText}`);
            }
        } catch (e: any) {
            setExecutionHealth(null);
            setExecutionConnected(false);
            setExecutionError(e.message || 'Connection failed');
        }
    }, [settings?.executionUrl]);

    useEffect(() => {
        refreshExecution();
        refreshDockerContainers();

        const interval = setInterval(() => {
            refreshExecution();
            refreshDockerContainers();
        }, 5000); // 5s poll interval

        return () => clearInterval(interval);
    }, [refreshExecution, refreshDockerContainers]);

    return (
        <>
            {/* Execution Server */}
            <div className="p-5 bg-card/50 border border-border rounded-2xl shadow-sm overflow-hidden relative">
                {executionConnected && (
                    <div className="absolute top-0 right-0 p-3">
                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                    </div>
                )}
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-lg flex items-center gap-3 text-card-foreground">
                        <Icon name="SquareTerminal" size={20} className="text-orange-500" />
                        Execution Server
                    </h2>
                </div>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center p-2 bg-muted/20 rounded-lg">
                        <span className="text-muted-foreground">Status</span>
                        <span className={cn("font-bold uppercase text-[10px]", executionConnected ? "text-green-500" : "text-red-500")}>
                            {executionConnected ? 'Online' : 'Offline'}
                        </span>
                    </div>
                    {executionError && (
                        <div className="flex justify-between items-center px-2 py-1">
                            <span className="text-muted-foreground text-xs">Error</span>
                            <span className="font-mono text-[9px] font-medium text-red-400">{executionError}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center px-2 py-1">
                        <span className="text-muted-foreground text-xs">Runtime</span>
                        <span className="font-mono text-xs font-medium">{executionHealth?.service || 'Docker Managed'}</span>
                    </div>
                </div>
            </div>

            {/* Docker Infrastructure */}
            <div className="p-5 bg-card/50 border border-border rounded-2xl shadow-sm flex flex-col min-h-[400px]">
                <div className="flex items-center justify-between mb-4 border-b border-border pb-4">
                    <div>
                        <h2 className="font-bold text-lg flex items-center gap-3 text-card-foreground">
                            <Icon name="Box" size={20} className="text-cyan-500" />
                            Infrastructure
                        </h2>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Managing {dockerContainers.length} Codex instances</p>
                    </div>
                    <button
                        onClick={refreshDockerContainers}
                        disabled={isRefreshingDocker}
                        className="p-2 hover:bg-muted rounded-full transition-all disabled:opacity-50 shadow-sm border border-border"
                    >
                        <Icon name="RefreshCw" size={14} className={isRefreshingDocker ? 'animate-spin text-primary' : ''} />
                    </button>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto max-h-[350px] pr-2 custom-scrollbar">
                    {dockerContainers.length > 0 ? (
                        dockerContainers.map(container => (
                            <div key={container.id} className="p-3 bg-background border border-border rounded-xl group relative hover:shadow-md transition-all">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-mono text-[11px] font-bold truncate tracking-tight">{container.name}</span>
                                        <span className="text-[9px] text-muted-foreground font-medium opacity-60 truncate">{container.image}</span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleStopDockerContainer(container.id)}
                                            className="p-1.5 hover:bg-orange-500/10 hover:text-orange-500 rounded-lg transition-colors"
                                            title="Stop"
                                        >
                                            <Icon name="Square" size={10} />
                                        </button>
                                        <button
                                            onClick={() => handleRemoveDockerContainer(container.id)}
                                            className="p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-lg transition-colors"
                                            title="Force Remove"
                                        >
                                            <Icon name="Trash2" size={10} />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/40">
                                    <div className="flex items-center gap-2">
                                        <div className={cn(
                                            "w-1.5 h-1.5 rounded-full shadow-sm",
                                            container.state === 'running' ? "bg-green-500" : "bg-red-500"
                                        )} />
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{container.state}</span>
                                    </div>
                                    {container.isStale && (
                                        <span className="text-[8px] font-black uppercase text-orange-500 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">Stale</span>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-border rounded-2xl opacity-60 bg-muted/20">
                            <Icon name="Box" size={32} className="mb-4 text-muted-foreground" />
                            <p className="text-sm font-bold text-muted-foreground">No Managed Containers</p>
                            <p className="text-[10px] text-muted-foreground mt-1">Docker instances started by Codex will appear here.</p>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};
