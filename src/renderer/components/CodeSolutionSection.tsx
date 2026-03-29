import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ChevronRight, Plus, Terminal, Loader2, Play, Trash2, Ban, X, Code, FileCode } from 'lucide-react';
import { MonacoWrapper } from './MonacoWrapper';
import { useCoreServices } from '@citadel-app/ui';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

export interface Solution {
    id: string;
    language: string;
    code: string;
    path?: string;
}

export interface ExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    duration: number;
    isWarm?: boolean;
    error?: string;
}

interface CodeSolutionSectionProps {
    solutions: Solution[];
    onSolutionsChange: (solutions: Solution[]) => void;
    onRunSolution?: (solution: Solution) => Promise<ExecutionResult>;
    className?: string;
}

export const CodeSolutionSection = ({
    solutions,
    onSolutionsChange,
    onRunSolution,
    className
}: CodeSolutionSectionProps) => {
    const { settings } = useCoreServices();

    // Derive languages from settings or default
    const availableLanguages = useMemo(() => {
        if (settings?.executionEnvironments) {
            return Object.keys(settings.executionEnvironments).map(key => ({
                value: key,
                label: key.charAt(0).toUpperCase() + key.slice(1)
            }));
        }
        return [
            { value: 'typescript', label: 'TypeScript' },
            { value: 'javascript', label: 'JavaScript' },
            { value: 'python', label: 'Python' }
        ];
    }, [settings?.executionEnvironments]);

    const [activeTab, setActiveTab] = useState(solutions[0]?.id || '');
    const [isConsoleOpen, setIsConsoleOpen] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);

    // Sync activeTab when solutions load/change
    useEffect(() => {
        if (solutions.length > 0) {
            // If no tab selected, or selected tab execution no longer exists
            if (!activeTab || !solutions.find(s => s.id === activeTab)) {
                setActiveTab(solutions[0].id);
            }
        }
    }, [solutions, activeTab]);

    const handleAddSolution = useCallback(() => {
        const defaultLang = 'python';
        const snippet = settings?.executionEnvironments?.[defaultLang]?.snippet || '# Your solution here\n';

        const newSolution: Solution = {
            id: `sol-${Date.now()}`,
            language: defaultLang,
            code: snippet
        };
        const updated = [...solutions, newSolution];
        onSolutionsChange(updated);
        setActiveTab(newSolution.id);
    }, [solutions, onSolutionsChange, settings]);

    const handleRemoveSolution = useCallback((id: string) => {
        const updated = solutions.filter(s => s.id !== id);
        onSolutionsChange(updated);
        if (activeTab === id && updated.length > 0) {
            setActiveTab(updated[0].id);
        }
    }, [solutions, activeTab, onSolutionsChange]);

    const handleCodeChange = useCallback((id: string, code: string) => {
        const updated = solutions.map(s =>
            s.id === id ? { ...s, code } : s
        );
        onSolutionsChange(updated);
    }, [solutions, onSolutionsChange]);

    const handleLanguageChange = useCallback((id: string, language: string) => {
        const solution = solutions.find(s => s.id === id);
        let newCode = solution?.code || '';

        // If code is empty, or matches the old language's snippet, switch to new snippet
        if (solution && settings?.executionEnvironments) {
            const oldLangSnippet = settings.executionEnvironments[solution.language]?.snippet || '';
            const isDefault = !solution.code.trim() || solution.code.trim() === oldLangSnippet.trim() || solution.code === '# Your solution here\n';

            if (isDefault) {
                newCode = settings.executionEnvironments[language]?.snippet || '';
            }
        }

        const updated = solutions.map(s =>
            s.id === id ? { ...s, language, code: newCode } : s
        );
        onSolutionsChange(updated);
    }, [solutions, onSolutionsChange, settings]);

    const handleRun = useCallback(async () => {
        const solution = solutions.find(s => s.id === activeTab);
        if (!solution || !onRunSolution) return;

        setIsRunning(true);
        setExecutionResult(null);
        setIsConsoleOpen(true);

        try {
            const result = await onRunSolution(solution);
            setExecutionResult(result);
        } catch (error: any) {
            setExecutionResult({
                stdout: '',
                stderr: error.message || 'Unknown error occurred',
                exitCode: 1,
                duration: 0
            });
        } finally {
            setIsRunning(false);
        }
    }, [solutions, activeTab, onRunSolution]);

    const activeSolution = solutions.find(s => s.id === activeTab);

    return (
        <div className={cn("rounded-lg border border-border overflow-hidden flex flex-col h-full", className)}>
            {/* Header with Dropdown */}
            <div className="flex items-center justify-between bg-muted/50 border-b border-border px-3 py-1.5 gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">Solution</span>
                    <select
                        value={activeTab}
                        onChange={(e) => setActiveTab(e.target.value)}
                        className="flex-1 max-w-[200px] text-sm bg-background border border-input rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary font-medium"
                    >
                        {solutions.map((solution, index) => (
                            <option key={solution.id} value={solution.id}>
                                #{index + 1} ({availableLanguages.find(l => l.value === solution.language)?.label || solution.language})
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={handleAddSolution}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded transition-colors shrink-0"
                    >
                        <Plus size={14} />
                        New
                    </button>
                </div>
            </div>

            {/* Active solution editor */}
            {activeSolution ? (
                <div className="flex flex-col flex-1 h-full min-h-0 relative">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
                        <div className="flex items-center gap-2">
                            <select
                                value={activeSolution.language}
                                onChange={(e) => handleLanguageChange(activeSolution.id, e.target.value)}
                                className="text-xs bg-background border border-input rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary"
                            >
                                {availableLanguages.map(lang => (
                                    <option key={lang.value} value={lang.value}>{lang.label}</option>
                                ))}
                                {!availableLanguages.find(l => l.value === activeSolution.language) && (
                                    <option key={activeSolution.language} value={activeSolution.language}>
                                        {activeSolution.language} (Missing Env)
                                    </option>
                                )}
                            </select>

                            {activeSolution.path && (
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded border border-border/50 max-w-[300px]">
                                    <FileCode size={12} className="text-muted-foreground shrink-0" />
                                    <span className="text-[10px] text-muted-foreground truncate font-mono" title={activeSolution.path}>
                                        {activeSolution.path}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {onRunSolution && (
                                <button
                                    onClick={handleRun}
                                    disabled={isRunning}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-all",
                                        isRunning
                                            ? "bg-muted text-muted-foreground cursor-wait"
                                            : "bg-green-600 hover:bg-green-700 text-white shadow-sm"
                                    )}
                                >
                                    {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                                    {isRunning ? 'Running...' : 'Run Code'}
                                </button>
                            )}
                            {solutions.length > 1 && (
                                <button
                                    onClick={() => handleRemoveSolution(activeSolution.id)}
                                    className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                >
                                    <Trash2 size={12} />
                                </button>
                            )}
                            <button
                                onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                                className={cn(
                                    "flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors",
                                    isConsoleOpen ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                                )}
                                title="Toggle Console"
                            >
                                <Terminal size={12} />
                            </button>
                        </div>
                    </div>

                    {/* Editor Content */}
                    <div className="flex-1 min-h-0 relative">
                        <MonacoWrapper
                            className="h-full w-full absolute inset-0"
                            value={activeSolution.code}
                            language={activeSolution.language}
                            onChange={(value) => handleCodeChange(activeSolution.id, value || '')}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 13,
                                lineNumbers: 'on',
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                            }}
                        />
                    </div>

                    {/* Console Output Panel */}
                    {isConsoleOpen && (
                        <div className="h-1/3 min-h-[150px] border-t border-border bg-black text-white p-3 font-mono text-xs overflow-auto flex flex-col shrink-0">
                            <div className="flex justify-between items-center mb-2 pb-2 border-b border-white/10">
                                <span className="font-semibold text-muted-foreground flex items-center gap-2">
                                    <Terminal size={12} /> Console
                                </span>
                                <div className="flex gap-2">
                                    {executionResult && (
                                        <span className={cn(
                                            "text-[10px] px-1.5 py-0.5 rounded",
                                            executionResult.exitCode === 0 ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
                                        )}>
                                            Exit: {executionResult.exitCode} ({executionResult.duration?.toFixed(2)}s)
                                        </span>
                                    )}
                                    <button onClick={() => setExecutionResult(null)} className="hover:text-white text-white/50" title="Clear">
                                        <Ban size={12} />
                                    </button>
                                    <button onClick={() => setIsConsoleOpen(false)} className="hover:text-white text-white/50">
                                        <X size={12} />
                                    </button>
                                </div>
                            </div>

                            {isRunning ? (
                                <div className="flex items-center gap-2 text-white/50 mt-2">
                                    <Loader2 size={12} className="animate-spin" />
                                    Compiling and running container...
                                </div>
                            ) : executionResult ? (
                                <div className="space-y-2 whitespace-pre-wrap">
                                    {executionResult.stdout && (
                                        <div className="text-gray-300">{executionResult.stdout}</div>
                                    )}
                                    {executionResult.stderr && (
                                        <div className="text-red-400">{executionResult.stderr}</div>
                                    )}
                                    {executionResult.error && (
                                        <div className="text-red-500 font-bold">System Error: {executionResult.error}</div>
                                    )}
                                    {!executionResult.stdout && !executionResult.stderr && !executionResult.error && (
                                        <div className="text-white/30 italic">No output</div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-white/30 italic mt-2">Ready to execute.</div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                    <Code size={32} className="mb-2 opacity-50" />
                    <p className="text-sm">No solutions yet</p>
                    <button
                        onClick={handleAddSolution}
                        className="mt-2 flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                    >
                        <Plus size={14} />
                        Add Solution
                    </button>
                </div>
            )}
        </div>
    );
};
