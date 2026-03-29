import { useRef, useState, useEffect, useCallback } from 'react';
import { MonacoWrapper } from '../components/MonacoWrapper';
import { Monaco } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { DropdownMenu as Root, DropdownMenuTrigger as Trigger, DropdownMenuContent as Content, DropdownMenuItem as Item, DropdownMenuCheckboxItem as CheckboxItem, DropdownMenuRadioItem as RadioItem, DropdownMenuLabel as Label, DropdownMenuSeparator as Separator, DropdownMenuShortcut as Shortcut, DropdownMenuGroup as Group, DropdownMenuPortal as Portal, DropdownMenuSub as Sub, DropdownMenuSubContent as SubContent, DropdownMenuSubTrigger as SubTrigger, DropdownMenuRadioGroup as RadioGroup } from '@citadel-app/ui';
const DropdownMenu = { Root, Trigger, Content, Item, CheckboxItem, RadioItem, Label, Separator, Shortcut, Group, Portal, Sub, SubContent, SubTrigger, RadioGroup };
import * as monaco from 'monaco-editor';
import { setupATA } from '../lib/ata';
import { Icon, cn, ConfirmDialog, useCoreServices } from '@citadel-app/ui';

interface ExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    duration: number;
    isWarm?: boolean;
    error?: string;
}

export const EditorPage = () => {
    const { theme } = useTheme();
    const { settings, vaultPath, toast, hostApi } = useCoreServices();
    const fs = hostApi?.fs;

    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const [fileName, setFileName] = useState('untitled');
    const [language, setLanguage] = useState('typescript');

    const [isRunning, setIsRunning] = useState(false);
    const [isConsoleOpen, setIsConsoleOpen] = useState(false);
    const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
    const [ataStatus, setAtaStatus] = useState('');

    const handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor, _monaco: Monaco) => {
        editorRef.current = editor;
        editor.focus();

        // Load default snippet instead of DB
        const snippet = settings?.executionEnvironments?.['typescript']?.snippet;
        if (snippet) editor.setValue(snippet);

        return () => { };
    };

    // Save language change (Ephemeral snippet switch)
    useEffect(() => {
        if (editorRef.current) {
            const currentCode = editorRef.current.getValue() || '';
            const oldLang = (editorRef.current.getModel() as any)?.language; // Approximate
            // Usually handled by the onSelect in dropdown
        }
    }, [language]);

    const abortControllerRef = useRef<AbortController | null>(null);

    // Cancel execution on unmount or language change
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    useEffect(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsRunning(false);
        }
    }, [language]);

    const handleRun = async () => {
        // If already running, abort
        if (isRunning) {
            abortControllerRef.current?.abort();
            setIsRunning(false);
            setExecutionResult((prev) => prev ? { ...prev, stderr: prev.stderr + '\n[Execution cancelled by user]' } : null);
            return;
        }

        const code = editorRef.current?.getValue();
        if (!code || !code.trim()) return;

        setIsRunning(true);
        setExecutionResult(null);
        setIsConsoleOpen(true);

        const env = settings.executionEnvironments?.[language];
        if (!env) {
            setExecutionResult({
                stdout: '',
                stderr: `No execution environment configured for ${language}.`,
                exitCode: 1,
                duration: 0,
                error: 'Configuration Error'
            });
            setIsRunning(false);
            return;
        }

        // Create new AbortController
        abortControllerRef.current = new AbortController();

        try {
            // Force 127.0.0.1
            const baseUrl = settings.executionUrl || 'http://127.0.0.1:5051';
            const url = baseUrl.replace('localhost', '127.0.0.1');

            const response = await fetch(`${url}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code,
                    language,
                    image: env.image,
                    command: env.command,
                    extension: env.extension
                }),
                signal: abortControllerRef.current.signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const result = await response.json();
            setExecutionResult(result);
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log('Execution cancelled');
                setExecutionResult({
                    stdout: '',
                    stderr: 'Execution cancelled.',
                    exitCode: 130, // Standard SIGINT exit code
                    duration: 0,
                    error: 'Cancelled'
                });
            } else {
                setExecutionResult({
                    stdout: '',
                    stderr: error.message || 'Unknown error occurred',
                    exitCode: 1,
                    duration: 0,
                    error: 'Execution Failed'
                });
            }
        } finally {
            // Only turn off isRunning if we haven't started a NEW run immediately (unlikely here but good practice)
            // But since we strictly await, it's fine.
            // Check if this is still the active controller?
            // Actually simpler: just turn off loading if matches
            setIsRunning(false);
            abortControllerRef.current = null;
        }
    };

    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [saveDialogName, setSaveDialogName] = useState('');

    const handleSaveToPlayground = async () => {
        const code = editorRef.current?.getValue();
        if (!code) return;

        // Determine extension
        const env = settings.executionEnvironments?.[language];
        const ext = env?.extension || 'txt';

        let name = fileName;
        if (name === 'untitled') {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            name = `playground-${timestamp}`;
        }

        setSaveDialogName(name);
        setShowSaveDialog(true);
    };

    const confirmSaveToPlayground = async () => {
        const code = editorRef.current?.getValue();
        if (!code || !saveDialogName) return;

        const env = settings.executionEnvironments?.[language];
        const ext = env?.extension || 'txt';
        const fname = saveDialogName;
        setFileName(fname);
        setShowSaveDialog(false);

        try {
            const playgroundDir = `${vaultPath}/00_Playground`;
            if (!(await fs.exists(playgroundDir))) {
                await fs.createDirectory(playgroundDir);
            }

            const fullPath = `${playgroundDir}/${fname}.${ext}`;
            await fs.writeFile(fullPath, code);
            toast(`Saved to ${fullPath}`, { type: 'success' });
        } catch (e: any) {
            console.error(e);
            toast(`Failed to save: ${e.message}`, { type: 'error' });
        }
    };

    return (
        <>
        <div className="h-full w-full flex flex-col bg-background">
            {/* Editor Toolbar */}
            <div className="h-10 border-b border-border flex items-center px-4 justify-between bg-muted/20">
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRun}
                        // disabled={isRunning} // No longer disabled, now it cancels
                        className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-all ${isRunning
                            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            : "bg-green-600 hover:bg-green-700 text-white shadow-sm"
                            }`}
                    >
                        {isRunning ? <Icon name="Square" size={12} className="fill-current" /> : <Icon name="Play" size={12} />}
                        {isRunning ? 'Stop' : 'Run'}
                    </button>
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                            <button className="flex items-center gap-1.5 h-6 text-xs bg-transparent border border-border rounded px-2 hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-primary transition-colors">
                                {language}
                                <Icon name="ChevronDown" size={12} className="opacity-50" />
                            </button>
                        </DropdownMenu.Trigger>

                        <DropdownMenu.Portal>
                            <DropdownMenu.Content
                                className="min-w-[120px] bg-popover text-popover-foreground rounded-md border border-border shadow-md p-1 z-50 animate-in fade-in-0 zoom-in-95"
                                sideOffset={5}
                                align="end"
                            >
                                {Object.keys(settings.executionEnvironments || {}).map(lang => (
                                    <DropdownMenu.Item
                                        key={lang}
                                        className="text-xs px-2 py-1.5 rounded-sm outline-none cursor-pointer flex items-center justify-between hover:bg-accent hover:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                                        onSelect={() => {
                                            setLanguage(lang);
                                            // Check if we should replace content
                                            const currentCode = editorRef.current?.getValue() || '';
                                            const oldSnippet = settings.executionEnvironments?.[language]?.snippet || '';
                                            const isDefault = !currentCode.trim() || currentCode === '// Start coding...' || currentCode === oldSnippet;

                                            if (isDefault) {
                                                const newSnippet = settings.executionEnvironments?.[lang]?.snippet;
                                                if (newSnippet && editorRef.current) {
                                                    editorRef.current.setValue(newSnippet);
                                                }
                                            }
                                        }}
                                    >
                                        <span className="capitalize">{lang}</span>
                                        {language === lang && <Icon name="Check" size={12} />}
                                    </DropdownMenu.Item>
                                ))}
                                {(!settings.executionEnvironments || Object.keys(settings.executionEnvironments).length === 0) && (
                                    ['typescript', 'javascript', 'python'].map(lang => (
                                        <DropdownMenu.Item
                                            key={lang}
                                            className="text-xs px-2 py-1.5 rounded-sm outline-none cursor-pointer flex items-center justify-between hover:bg-accent hover:text-accent-foreground"
                                            onSelect={() => setLanguage(lang)}
                                        >
                                            <span className="capitalize">{lang}</span>
                                            {language === lang && <Icon name="Check" size={12} />}
                                        </DropdownMenu.Item>
                                    ))
                                )}
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                    <div className="w-px h-4 bg-border mx-1" />
                    <button
                        onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                        className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${isConsoleOpen ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                            }`}
                        title="Toggle Console"
                    >
                        <Icon name="Terminal" size={12} />
                    </button>
                    {ataStatus && (
                        <span className="text-xs text-blue-400 ml-4 flex items-center gap-1 animate-pulse">
                            <Icon name="Download" size={12} />
                            {ataStatus}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* <button
                        onClick={handleSaveToPlayground}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors shadow-sm"
                    >
                        <Icon name="Save" size={12} />
                        Save
                    </button> */}
                </div>
            </div>

            {/* Monaco Editor */}
            <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
                <div className="flex-1 relative min-h-0">
                    <MonacoWrapper
                        className="h-full w-full"
                        language={language}
                        defaultValue="// Start coding..."
                        onMount={handleEditorDidMount}
                        options={{
                            minimap: { enabled: true },
                            fontSize: 14,
                            wordWrap: 'on',
                            automaticLayout: true,
                            fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
                            fontLigatures: true,
                        }}
                    />
                </div>

                {/* Console Output Panel */}
                {isConsoleOpen && (
                    <div className="h-1/3 min-h-[150px] border-t border-border bg-black text-white p-3 font-mono text-xs overflow-auto flex flex-col shrink-0">
                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-white/10">
                            <span className="font-semibold text-muted-foreground flex items-center gap-2">
                                <Icon name="Terminal" size={12} /> Console
                            </span>
                            <div className="flex gap-2">
                                {executionResult && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${executionResult.exitCode === 0 ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
                                        }`}>
                                        Exit: {executionResult.exitCode} ({executionResult.duration?.toFixed(2)}s)
                                    </span>
                                )}
                                <button onClick={() => setExecutionResult(null)} className="hover:text-white text-white/50" title="Clear">
                                    <Icon name="Ban" size={12} />
                                </button>
                                <button onClick={() => setIsConsoleOpen(false)} className="hover:text-white text-white/50">
                                    <Icon name="X" size={12} />
                                </button>
                            </div>
                        </div>

                        {isRunning ? (
                            <div className="flex items-center gap-2 text-white/50 mt-2">
                                <Icon name="Loader2" size={12} className="animate-spin" />
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
        </div>

            <ConfirmDialog
                open={showSaveDialog}
                onOpenChange={setShowSaveDialog}
                title="Save to Playground"
                description={
                    <div className="space-y-2">
                        <label className="text-sm font-medium block">File name</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-primary/50"
                            value={saveDialogName}
                            onChange={(e) => setSaveDialogName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && confirmSaveToPlayground()}
                            autoFocus
                        />
                    </div>
                }
                confirmLabel="Save"
                onConfirm={confirmSaveToPlayground}
            />
        </>
    );
};
