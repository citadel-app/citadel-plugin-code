import React, { useState, useEffect, useCallback } from 'react';
import { useCoreServices, Icon, cn, Button } from '@citadel-app/ui';

interface ExecutionStatus {
    status: string;
    lang: string;
    pid?: number;
}

export const CodeExecutionWidget = () => {
    const { settings, hostApi: __hostApi } = useCoreServices();
    
    // Execution State
    const [execConnected, setExecConnected] = useState(false);
    const [execStatus, setExecStatus] = useState<ExecutionStatus | null>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);

    const refreshExec = useCallback(async () => {
        try {
            const url = (settings?.executionUrl || 'http://127.0.0.1:5051').replace('localhost', '127.0.0.1');
            const res = await fetch(`${url}/health`);
            if (res.ok) {
                const status = await res.json();
                setExecStatus(status);
                setExecConnected(true);
            } else {
                setExecStatus(null);
                setExecConnected(false);
            }
        } catch (e) {
            setExecStatus(null);
            setExecConnected(false);
        }
    }, [settings]);

    useEffect(() => {
        refreshExec();
        const interval = setInterval(refreshExec, 5000);
        return () => clearInterval(interval);
    }, [refreshExec]);

    const handleStartService = async () => {
        setIsTransitioning(true);
        try {
            await __hostApi.module.invoke('@citadel-app/code', 'execution.start');
            setTimeout(refreshExec, 1500);
            setTimeout(refreshExec, 3500);
        } catch (e) {
            console.error('[CodeExecutionWidget] Failed to start Execution Sidecar:', e);
        } finally {
            setIsTransitioning(false);
        }
    };

    const handleStopService = async () => {
        setIsTransitioning(true);
        try {
            await __hostApi.module.invoke('@citadel-app/code', 'execution.stop');
            setTimeout(refreshExec, 1000);
        } catch (e) {
            console.error('[CodeExecutionWidget] Failed to stop Execution Sidecar:', e);
        } finally {
            setIsTransitioning(false);
        }
    };

    return (
        <div className="p-5 bg-card/50 border border-border rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg flex items-center gap-3 text-card-foreground">
                    <Icon name="Terminal" size={20} className="text-green-500" />
                    Code Execution Engine
                </h2>
                <button
                    onClick={() => execConnected ? handleStopService() : handleStartService()}
                    disabled={isTransitioning}
                    className="p-1.5 hover:bg-muted rounded-md transition-colors"
                    title={execConnected ? "Stop Local Execution Engine" : "Start Local Execution Engine"}
                >
                    <Icon 
                        name={isTransitioning ? 'Loader2' : (execConnected ? 'Square' : 'Play')} 
                        size={14} 
                        className={isTransitioning ? 'animate-spin' : (execConnected ? 'text-destructive' : 'text-primary')} 
                    />
                </button>
            </div>
            
            <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center p-2 bg-muted/20 rounded-lg">
                    <span className="text-muted-foreground">Status</span>
                    <span className={cn("font-bold uppercase text-[10px]", execConnected ? "text-green-500" : "text-red-500")}>
                        {execConnected ? 'Runtime Ready' : 'Stopped'}
                    </span>
                </div>
                
                <div className="flex justify-between items-center px-2 py-1 border-t border-border/40 mt-2">
                    <span className="text-muted-foreground text-xs">Primary Sandbox</span>
                    <span className="font-mono text-xs font-medium text-cyan-500">Python 3.11</span>
                </div>

                <div className="mt-4 pt-4 border-t border-border/40 space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        The Codex Execution Engine provides isolated Docker sandbox environments.
                        When active, Code Cells within documents can be evaluated safely.
                    </p>
                </div>
            </div>
        </div>
    );
};
