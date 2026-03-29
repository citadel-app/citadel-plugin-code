import { CitadelDialog, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from '@citadel-app/ui';
import { useRef, useState, useEffect } from 'react';
import Editor, { Monaco, loader } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { Icon, cn, ConfirmDialog, useCoreServices } from '@citadel-app/ui';
import * as monaco from 'monaco-editor';
import { registerLatexLanguage } from '../lib/monaco-latex';

// Import language contributions relative to node_modules or allow resolve
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';

// Configure loader to use local monaco instance
loader.config({ monaco });

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { FileTree } from '../components/LatexEditor/FileTree';


interface LatexFile {
    name: string;
    content: string;
    isBinary?: boolean;
}

export const LatexEditorPage = () => {
    const { toast, db, dataManager, hostApi: __hostApi } = useCoreServices();
    const { theme } = useTheme();
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

    // Quick Mode State
    const [content, setContent] = useState<string>('');
    const [previewContent, setPreviewContent] = useState<string>('');
    const [autoCompile, setAutoCompile] = useState<boolean>(true);

    // Pro Mode State
    // Initialize from localStorage if available
    const [isProMode, setIsProMode] = useState<boolean>(() => {
        const saved = localStorage.getItem('latex-editor-mode');
        return saved === 'pro';
    });

    const setProModeWithStorage = (value: boolean) => {
        setIsProMode(value);
        localStorage.setItem('latex-editor-mode', value ? 'pro' : 'quick');
    };

    const [files, setFiles] = useState<LatexFile[]>([
        { name: 'main.tex', content: '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}' }
    ]);
    const [activeFileIndex, setActiveFileIndex] = useState(0);
    const activeFileIndexRef = useRef(0); // Ref to access latest index in closures
    activeFileIndexRef.current = activeFileIndex; // Sync update to avoid effect race conditions

    // Remove the effect that was updating it
    // useEffect(() => {
    //    activeFileIndexRef.current = activeFileIndex;
    // }, [activeFileIndex]);

    const [pdfData, setPdfData] = useState<string | null>(null);
    const [compilationLogs, setCompilationLogs] = useState<string>('');
    const [isLatexInstalled, setIsLatexInstalled] = useState<boolean>(true);
    const [isHelpOpen, setIsHelpOpen] = useState(false);

    const [isCompiling, setIsCompiling] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // Guard for programmatic changes
    const isProgrammaticChange = useRef(false);

    // File Creation Dialog State
    const [isNewFileOpen, setIsNewFileOpen] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const [newFileError, setNewFileError] = useState<string | null>(null);

    // Initial content as fallback
    const defaultContent = '# LaTeX Editor\n\nWrite standard Markdown mixed with LaTeX math.\n\nBlock math:\n$$ \\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2} $$\n\nInline math: $E = mc^2$';

    // Check LaTeX on mount
    useEffect(() => {
        if (__hostApi.module) {
            __hostApi.module.invoke('@citadel-app/code', 'latex.check').then((available: boolean) => {
                setIsLatexInstalled(available);
                if (!available && isProMode) {
                    setIsHelpOpen(true);
                }
            });
        }
    }, [isProMode]);

    const handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
        editorRef.current = editor;
        editor.focus();

        // Register custom LaTeX/BibTeX languages
        registerLatexLanguage(monacoInstance);

        // Load data from DB
        // Load data from DB (Quick Mode) and Files (Pro Mode)
        db.latex.get('default').then((data) => {
            const initialContent = (data && data.content) ? data.content : defaultContent;
            setContent(initialContent);
            setPreviewContent(initialContent);
            if (!isProMode) editor.setValue(initialContent);
        });

        // Load Pro Mode Files
        console.log('[LatexEditor] Loading LaTeX files...');
        dataManager.loadLatexFiles().then(loadedFiles => {
            console.log('[LatexEditor] Loaded files:', loadedFiles);
            if (loadedFiles.length > 0) {
                setFiles(loadedFiles);
                // If in Pro Mode, update editor with first file
                if (isProMode) {
                    console.log('[LatexEditor] Setting editor value from loaded file:', loadedFiles[0].name);
                    isProgrammaticChange.current = true;
                    editor.setValue(loadedFiles[0].content);
                    isProgrammaticChange.current = false;
                }
            } else {
                console.log('[LatexEditor] No files found, creating default.');
                // Initialize default if empty
                const defaultFiles = [
                    { name: 'main.tex', content: '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}' }
                ];
                setFiles(defaultFiles);
                // Persist default immediately
                dataManager.saveLatexFile('main.tex', defaultFiles[0].content);
                dataManager.saveLatexFile('main.tex', defaultFiles[0].content);
                if (isProMode) {
                    isProgrammaticChange.current = true;
                    editor.setValue(defaultFiles[0].content);
                    isProgrammaticChange.current = false;
                }
            }
        });

        // Save on change
        const disposable = editor.onDidChangeModelContent(() => {
            if (isProgrammaticChange.current) return;

            const newValue = editor.getValue();
            if (isProMode) {
                // Use Ref to get current index, as this closure captures the initial 0 value
                const idx = activeFileIndexRef.current;

                // console.log(`[LatexEditor] Content changed. Active Index: ${activeFileIndex}, Ref Index: ${idx}`);

                // Update active file
                setFiles(prev => {
                    const newFiles = [...prev];
                    if (newFiles[idx]) {
                        // console.log(`[LatexEditor] Updating file ${idx} (${newFiles[idx].name})`);
                        newFiles[idx] = { ...newFiles[idx], content: newValue };
                        // Debounced save for Pro Mode file
                        if (!newFiles[idx].isBinary) {
                            saveLatexFile(newFiles[idx].name, newValue);
                        }
                    } else {
                        console.error(`[LatexEditor] Index ${idx} out of bounds for files:`, newFiles);
                    }
                    return newFiles;
                });
            } else {
                setContent(newValue);
                saveContent(newValue); // Persist to DB

                if (autoCompile) {
                    debouncedUpdatePreview(newValue);
                }
            }
        });

        return () => disposable.dispose();
    };

    // Effect to update editor when active file changes in Pro Mode
    useEffect(() => {
        if (editorRef.current && isProMode) {
            const currentFile = files[activeFileIndex];
            if (currentFile && !currentFile.isBinary) {
                if (editorRef.current.getValue() !== currentFile.content) {
                    isProgrammaticChange.current = true;
                    editorRef.current.setValue(currentFile.content || '');
                    // Small delay to ensure the change is processed before we allow auto-compile
                    setTimeout(() => {
                        isProgrammaticChange.current = false;
                    }, 100);
                }
            }
        }
    }, [activeFileIndex, isProMode]); // Only depend on index and mode

    // Debounced save for DB (Quick Mode)
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const saveContent = (newContent: string) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            db.latex.put({
                id: 'default',
                content: newContent,
                updatedAt: new Date().toISOString()
            });
        }, 1000);
    };

    // Debounced Preview Update (Quick Mode)
    const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const debouncedUpdatePreview = (newContent: string) => {
        if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
        setIsCompiling(true);
        previewTimeoutRef.current = setTimeout(() => {
            setPreviewContent(newContent);
            setIsCompiling(false);
        }, 1200); // 1.2s delay for preview
    };

    const saveLatexFile = (name: string, content: string, isBinary: boolean = false) => {
        // Simple debounce could be added here if needed, but DataManager writes to disk which is reasonably fast for small text files.
        // For heavy typing, a debounce is better.
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            dataManager.saveLatexFile(name, content, isBinary).catch(console.error);
        }, 1000);
    };

    const handleManualCompile = async () => {
        setIsCompiling(true);

        if (isProMode) {
            if (!isLatexInstalled) {
                setIsHelpOpen(true);
                setIsCompiling(false);
                return;
            }

            try {
                // Load binary content for files that were loaded lazily (content: null)
                const filesToCompile = await Promise.all(
                    files.map(async (f) => {
                        if (f.content === null && f.isBinary) {
                            const binaryContent = await dataManager.getLatexFileContent(f.name, true);
                            return { ...f, content: binaryContent || '' };
                        }
                        return { ...f, content: f.content || '' };
                    })
                );
                const result = await __hostApi.module.invoke('@citadel-app/code', 'latex.compile', { files: filesToCompile });
                if (result.success && result.pdf) {
                    setPdfData(result.pdf);
                    setCompilationLogs('Compilation successful.');
                } else {
                    setCompilationLogs(result.logs || 'Unknown error');
                }
            } catch (e: any) {
                setCompilationLogs(e.message);
            }
        } else {
            setPreviewContent(content);
            // Small fake delay to show activity
            setTimeout(() => setIsCompiling(false), 300);
        }
        setIsCompiling(false);
    };

    const handleAddFile = () => {
        setNewFileName('');
        setNewFileError(null);
        setIsNewFileOpen(true);
    };

    const handleManualSave = async () => {
        if (isProMode) {
            const currentFile = files[activeFileIndex];
            if (currentFile) {
                setIsSaving(true);
                setIsSaving(true);
                await dataManager.saveLatexFile(currentFile.name, currentFile.content, currentFile.isBinary);
                // Artificial delay for feedback
                setTimeout(() => setIsSaving(false), 500);
            }
        } else {
            setIsSaving(true);
            saveContent(content); // already debounced but we can call db directly if we exposed it, or just rely on this
            // Actually saveContent uses db.put inside a timeout. Let's force it.
            await db.latex.put({
                id: 'default',
                content: content,
                updatedAt: new Date().toISOString()
            });
            setTimeout(() => setIsSaving(false), 500);
        }
    };

    const confirmAddFile = () => {
        const name = newFileName.trim();
        if (!name) {
            setNewFileError('File name cannot be empty');
            return;
        }
        if (files.some(f => f.name === name)) {
            setNewFileError('File already exists');
            return;
        }

        // Auto-append .tex if missing check? Maybe not, allow other extensions like .bib

        const newFile = { name, content: '' };
        setFiles(prev => [...prev, newFile]);
        setActiveFileIndex(files.length); // Switch to new file
        setIsNewFileOpen(false);

        // Persist immediately
        dataManager.saveLatexFile(name, '');
    };

    const [confirmDeleteFile, setConfirmDeleteFile] = useState<string | null>(null);

    const handleRenameFile = async (oldPath: string, newPath: string) => {
        try {
            await dataManager.renameLatexFile(oldPath, newPath);
            setFiles(prev => prev.map(f => f.name === oldPath ? { ...f, name: newPath } : f));
        } catch (error) {
            console.error('Failed to rename file:', error);
            toast('Failed to rename file', { type: 'error' });
        }
    };

    const handleDeleteFile = (path: string) => {
        const index = files.findIndex(f => f.name === path);
        if (index === -1) return;

        if (files.length <= 1 && files[0].name === path) return;
        if (files.length <= 1) return;

        setConfirmDeleteFile(path);
    };

    const executeDeleteFile = () => {
        if (!confirmDeleteFile) return;
        const path = confirmDeleteFile;
        const index = files.findIndex(f => f.name === path);
        setFiles(prev => prev.filter(f => f.name !== path));
        if (activeFileIndex >= index) setActiveFileIndex(Math.max(0, activeFileIndex - 1));
        dataManager.deleteLatexFile(path).catch(console.error);
        setConfirmDeleteFile(null);
    };

    const handleUploadFile = async () => {
        try {
            const filePath = await __hostApi.dialog.openFile();
            if (!filePath) return;

            // Read file content
            // Check extension
            const ext = filePath.split('.').pop()?.toLowerCase();
            const isImage = ['png', 'jpg', 'jpeg', 'pdf'].includes(ext || '');

            let content = '';
            let isBinary = false;

            // We need to read it.
            // If image, use readFileBinary
            if (isImage) {
                const buffer = await __hostApi.module.invoke('@citadel-app/base', 'fs.readFileBinary', filePath);
                if (buffer) {
                    // Convert to base64
                    let binary = '';
                    const len = buffer.byteLength;
                    for (let i = 0; i < len; i++) {
                        binary += String.fromCharCode(buffer[i]);
                    }
                    content = window.btoa(binary);
                    isBinary = true;
                }
            } else {
                content = await __hostApi.module.invoke('@citadel-app/base', 'fs.readFile', filePath);
            }

            const fileName = filePath.split(/[\\/]/).pop() || 'uploaded_file';
            // Check for collision?
            // Ask user for target folder? For now, upload to root or assets?
            // Let's simplified: upload to 'images/' if image, else root.

            let targetName = fileName;
            if (isImage) {
                targetName = `images/${fileName}`;
            }

            // Save to project
            await dataManager.saveLatexFile(targetName, content, isBinary);

            // Add to state
            setFiles(prev => [...prev, { name: targetName, content, isBinary }]);
        } catch (error) {
            console.error('Upload failed', error);
        }
    };

    const getEditorLanguage = () => {
        if (!isProMode) return 'markdown';
        const fileName = files[activeFileIndex]?.name || '';
        if (fileName.endsWith('.bib')) return 'latex'; // Fallback BibTeX to LaTeX highlighting
        if (fileName.endsWith('.tex') || fileName.endsWith('.cls') || fileName.endsWith('.sty')) return 'latex';
        return 'plaintext';
    };

    // Parse logs for missing packages
    const getMissingPackage = (logs: string): string | null => {
        // 1. Check for missing style/class files
        const fileMatch = logs.match(/! LaTeX Error: File `([^']+)' not found/);
        if (fileMatch && fileMatch[1]) {
            // Extract package name from filename (e.g. cite.sty -> cite)
            const file = fileMatch[1];
            const name = file.split('.')[0];

            // Map common style files to their actual package names
            const MAPPINGS: Record<string, string> = {
                'algorithmic': 'algorithms',
                'algorithm': 'algorithms',
                'algpseudocode': 'algorithmicx',
                'mathrsfs': 'jknapltx', // Common tricky one
            };

            return MAPPINGS[name] || name;
        }

        // 2. Check for Font TFM errors
        // Error: ! Font OT1/pcr/m/n/8=pcrr7t at 8.0pt not loadable: Metric (TFM) file not found.
        const fontMatch = logs.match(/! Font [^=]+=([^ ]+) at .* not loadable: Metric \(TFM\) file not found/);
        if (fontMatch && fontMatch[1]) {
            const fontName = fontMatch[1]; // e.g. pcrr7t
            if (fontName.startsWith('pcr')) return 'courier';
            if (fontName.startsWith('ptm')) return 'times';
            if (fontName.startsWith('phv')) return 'helvetic';
            if (fontName.startsWith('pzp')) return 'zapfding';
            if (fontName.startsWith('psyr')) return 'symbol';
            return 'collection-fontsrecommended'; // fallback
        }

        return null;
    };

    const missingPackage = getMissingPackage(compilationLogs);

    // Parse logs for syntax errors
    const getSyntaxError = (logs: string): { line: number, message: string, suggestion?: string } | null => {
        // 1. Check for "Undefined control sequence"
        // Format:
        // ! Undefined control sequence.
        // l.246 \subsubsubsection
        const undefinedMatch = logs.match(/! Undefined control sequence\.(?:.|\r|\n)*?l\.(\d+)\s*\\(\w+)/);
        if (undefinedMatch) {
            const line = parseInt(undefinedMatch[1]);
            const command = undefinedMatch[2];
            let suggestion = '';

            if (command === 'subsubsubsection') {
                suggestion = "Standard LaTeX does not have \\subsubsubsection. Try using \\paragraph{} instead.";
            }

            return {
                line,
                message: `Undefined command: \\${command}`,
                suggestion
            };
        }

        // 2. Generic "LaTeX Error"
        const errorMatch = logs.match(/! LaTeX Error: (.+?)\.?\n/);
        if (errorMatch) {
            const message = errorMatch[1];
            const lineMatch = logs.match(/l\.(\d+)/);
            if (lineMatch) {
                return { line: parseInt(lineMatch[1]), message };
            }
            return { line: 0, message };
        }
        return null;
    };

    const syntaxError = getSyntaxError(compilationLogs);

    return (
        <div className="h-full w-full flex flex-col bg-background min-h-0 overflow-hidden">
            {/* Toolbar */}
            <div className="h-10 border-b border-border flex items-center px-4 justify-between bg-muted/20 shrink-0">
                <div className="flex items-center gap-2 font-medieval">
                    <Icon name="Sigma" size={16} className="text-primary" />
                    <span className="text-sm font-bold uppercase tracking-widest">The Scribe</span>

                    <div className="h-4 w-[1px] bg-border mx-2" />

                    {/* Mode Toggle */}
                    <div className="flex bg-muted rounded p-0.5">
                        <button
                            onClick={() => {
                                // Switching to Markdown (Quick Mode)
                                // Force save current file in Pro Mode
                                if (isProMode) {
                                    const currentFile = files[activeFileIndex];
                                    if (currentFile) {
                                        dataManager.saveLatexFile(currentFile.name, currentFile.content).catch(console.error);
                                    }
                                }
                                setProModeWithStorage(false);
                            }}
                            className={cn("px-2 py-0.5 text-xs rounded transition-colors", !isProMode ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}
                        >
                            Markdown
                        </button>
                        <button
                            onClick={() => {
                                // Switching to Pro Mode
                                // Force save Markdown content
                                if (!isProMode) {
                                    // content state is updated on change
                                    db.latex.put({
                                        id: 'default',
                                        content: content,
                                        updatedAt: new Date().toISOString()
                                    });
                                }
                                setProModeWithStorage(true)
                            }}
                            className={cn("px-2 py-0.5 text-xs rounded transition-colors", isProMode ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}
                        >
                            LaTeX
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {!isProMode && (
                        <div className="flex items-center gap-2 mr-2">
                            <label className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={autoCompile}
                                    onChange={(e) => setAutoCompile(e.target.checked)}
                                    className="rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                Auto-Compile
                            </label>
                        </div>
                    )}

                    <button
                        onClick={handleManualSave}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 h-7 text-xs bg-muted text-muted-foreground px-4 rounded-lg hover:bg-muted/80 hover:text-foreground focus:outline-none transition-all mr-2 font-medieval border border-border/50"
                    >
                        {isSaving ? (
                            <>
                                <Icon name="Loader2" size={12} className="animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Icon name="Save" size={12} />
                                Save
                            </>
                        )}
                    </button>

                    <button
                        onClick={handleManualCompile}
                        disabled={isCompiling}
                        className={cn(
                            "flex items-center gap-1.5 h-7 text-xs bg-primary text-primary-foreground px-4 active:scale-95 btn-forged font-medieval",
                            isCompiling && "opacity-70 cursor-wait"
                        )}
                    >
                        {isCompiling ? (
                            <>
                                <Icon name="Loader2" size={12} className="animate-spin" />
                                Compiling...
                            </>
                        ) : (
                            <>
                                <Icon name="Play" size={12} fill="currentColor" />
                                Recompile
                            </>
                        )}
                    </button>
                </div>
            </div>


            {/* Split View Container */}
            <div className="flex-1 min-h-0 w-full overflow-hidden relative">
                <Group key={isProMode ? 'pro-mode' : 'quick-mode'} orientation="horizontal" className="h-full w-full">
                    {/* File Tree (Pro Mode Only) */}
                    {
                        isProMode && (
                            <Panel defaultSize="20" minSize="10" maxSize="80" className="bg-muted/5 border-r border-border/50 gothic-panel">
                                <div className="flex flex-col h-full">
                                    <div className="p-2 flex justify-between items-center border-b border-border/50">
                                        <span className="text-xs font-semibold text-muted-foreground">FILES</span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={handleUploadFile}
                                                className="p-1 hover:bg-muted rounded"
                                                title="Upload File"
                                            >
                                                <Icon name="Upload" size={12} />
                                            </button>
                                            <button onClick={handleAddFile} className="p-1 hover:bg-muted rounded" title="New File"><Icon name="Plus" size={12} /></button>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-auto p-1">
                                        <FileTree
                                            files={files}
                                            activeFile={files[activeFileIndex]?.name || null}
                                            onSelect={async (path) => {
                                                const idx = files.findIndex(f => f.name === path);
                                                if (idx !== -1) {
                                                    const currentFile = files[activeFileIndex];

                                                    // Flush save for previous if needed
                                                    if (currentFile && files[idx].name !== currentFile.name && !currentFile.isBinary) {
                                                        // @ts-ignore
                                                        dataManager.saveLatexFile(currentFile.name, currentFile.content).catch(console.error);
                                                        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
                                                    }

                                                    // Lazy load content if missing (for binaries or large files)
                                                    if (files[idx].content === null) {
                                                        // @ts-ignore
                                                        const content = await dataManager.getLatexFileContent(files[idx].name, !!files[idx].isBinary);
                                                        if (content !== null) {
                                                            setFiles(prev => {
                                                                const next = [...prev];
                                                                next[idx] = { ...next[idx], content };
                                                                return next;
                                                            });
                                                        }
                                                    }

                                                    setActiveFileIndex(idx);
                                                }
                                            }}
                                            onRename={handleRenameFile}
                                            onDelete={handleDeleteFile}
                                        />

                                        {/* Show message if no files? */}
                                        {files.length === 0 && (
                                            <div className="p-4 text-xs text-muted-foreground text-center">
                                                No files.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Panel>
                        )
                    }

                    {
                        isProMode && (
                            <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors cursor-col-resize flex items-center justify-center z-10">
                                <div className="h-4 w-0.5 bg-muted-foreground/20 rounded-full" />
                            </Separator>
                        )
                    }

                    <Panel defaultSize={isProMode ? "40" : "50"} minSize="20">
                        <div className="h-full w-full relative">
                            {isProMode && files[activeFileIndex]?.isBinary ? (
                                <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground bg-muted/5">
                                    {files[activeFileIndex].name.match(/\.(png|jpg|jpeg)$/i) ? (
                                        <div className="max-w-[90%] max-h-[90%] overflow-hidden rounded border border-border shadow-sm">
                                            <img
                                                src={`data:image/png;base64,${files[activeFileIndex].content}`}
                                                className="max-w-full max-h-full object-contain"
                                                alt="Preview"
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center">
                                            <Icon name="File" size={48} className="mb-4 opacity-50" />
                                            <p>Binary File ({files[activeFileIndex].name})</p>
                                            <p className="text-xs mt-2">Cannot be edited in text editor.</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <Editor
                                    height="100%"
                                    path={isProMode ? files[activeFileIndex]?.name : 'main.md'}
                                    defaultLanguage={isProMode ? 'latex' : 'markdown'}
                                    language={getEditorLanguage()}
                                    theme={theme === 'dark' ? 'latex-dark' : 'light'}
                                    value={isProMode ? files[activeFileIndex]?.content : content}
                                    onMount={handleEditorDidMount}
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 14,
                                        wordWrap: 'on',
                                        automaticLayout: true,
                                        fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
                                        fontLigatures: true,
                                        scrollBeyondLastLine: false,
                                        lineNumbers: isProMode ? 'on' : 'off',
                                        padding: { top: 16, bottom: 16 }
                                    }}
                                />
                            )}
                        </div>
                    </Panel>

                    <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors cursor-col-resize z-10" />

                    <Panel defaultSize={isProMode ? "40" : "50"} minSize="20">
                        <div className="h-full w-full overflow-hidden bg-white/5 relative">
                            {isProMode ? (
                                pdfData ? (
                                    <iframe
                                        src={`data:application/pdf;base64,${pdfData}`}
                                        className="w-full h-full border-none"
                                    />
                                ) : (
                                    <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                                        <Icon name="FileText" size={48} className="mb-4 opacity-50" />
                                        <p>No PDF generated yet.</p>
                                        <p className="text-sm mt-2">Click "Recompile" to build your project.</p>
                                        {compilationLogs && (
                                            <div className="mt-4 w-full bg-black/50 p-4 rounded text-xs font-mono text-left whitespace-pre-wrap max-h-[200px] overflow-auto text-red-400">
                                                {missingPackage && (
                                                    <div className="mb-3 p-2 bg-yellow-500/10 border border-yellow-500/50 rounded text-yellow-200">
                                                        <p className="font-bold flex items-center gap-2">
                                                            <Icon name="AlertTriangle" size={14} />
                                                            Missing Package Detected: {missingPackage}
                                                        </p>
                                                        <p className="mt-1">Try running this command in your terminal:</p>
                                                        <code className="block mt-1 bg-black/50 p-1.5 rounded select-all text-white">
                                                            tlmgr install {missingPackage}
                                                        </code>
                                                    </div>
                                                )}
                                                {syntaxError && syntaxError !== null && syntaxError!.line > 0 && (
                                                    <div className="mb-3 p-2 bg-destructive/10 border border-destructive/50 rounded text-destructive-foreground">
                                                        <p className="font-bold flex items-center gap-2">
                                                            <Icon name="XCircle" size={14} />
                                                            Error on Line {syntaxError!.line}
                                                        </p>
                                                        <p className="text-sm mt-1 opacity-90">{syntaxError!.message}</p>
                                                        {syntaxError!.suggestion && (
                                                            <div className="mt-2 text-xs bg-black/20 p-2 rounded flex items-start gap-2">
                                                                <Icon name="Lightbulb" size={12} className="mt-0.5 text-yellow-400" />
                                                                <span>{syntaxError!.suggestion}</span>
                                                            </div>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                if (editorRef.current) {
                                                                    editorRef.current.revealLineInCenter(syntaxError!.line);
                                                                    editorRef.current.setPosition({ lineNumber: syntaxError!.line, column: 1 });
                                                                    editorRef.current.focus();
                                                                }
                                                            }}
                                                            className="mt-2 text-xs bg-destructive/20 hover:bg-destructive/30 px-2 py-1 rounded transition-colors flex items-center gap-1"
                                                        >
                                                            <Icon name="ArrowRight" size={12} />
                                                            Jump to Line {syntaxError!.line}
                                                        </button>
                                                    </div>
                                                )}
                                                {compilationLogs}
                                            </div>
                                        )}
                                    </div>
                                )
                            ) : (
                                <div className="h-full w-full overflow-auto p-8 prose dark:prose-invert max-w-none">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkMath]}
                                        rehypePlugins={[rehypeKatex]}
                                    >
                                        {previewContent}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </div>
                    </Panel>
                </Group >
            </div>

            {/* Missing LaTeX Help Dialog */}
            <CitadelDialog open={isHelpOpen} onOpenChange={setIsHelpOpen} >
                
                    <DialogOverlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in" />
                    <DialogContent className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] max-w-lg w-full bg-background p-6 rounded-lg shadow-xl border border-border z-50 animate-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 duration-200 citadel-border">
                        <DialogTitle className="text-lg font-bold mb-2 flex items-center gap-2 font-medieval uppercase tracking-tight">
                            <Icon name="AlertTriangle" className="text-yellow-500" />
                            Compiler Not Found
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground mb-4">
                            Pro Mode requires a local LaTeX installation (`pdflatex`) to compile documents.
                        </DialogDescription>

                        <div className="space-y-4">
                            <div className="bg-muted/50 p-3 rounded-md">
                                <h4 className="font-medium text-sm mb-2 text-foreground">Recommended: Install TinyTeX</h4>
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Windows (PowerShell)</p>
                                        <code className="block bg-black/80 text-white p-2 rounded text-xs font-mono select-all">
                                            iwr -useb "https://yihui.org/tinytex/install-bin-windows.bat" | iex
                                        </code>
                                    </div>
                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">macOS / Linux</p>
                                        <code className="block bg-black/80 text-white p-2 rounded text-xs font-mono select-all">
                                            curl -sL "https://yihui.org/tinytex/install-bin-unix.sh" | sh
                                        </code>
                                    </div>
                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Alternative (Chocolatey)</p>
                                        <code className="block bg-black/80 text-white p-2 rounded text-xs font-mono select-all">
                                            choco install tinytex
                                        </code>
                                    </div>
                                </div>
                            </div>

                            <p className="text-xs text-muted-foreground">
                                After installation, please <strong>restart the application</strong> to ensure the new PATH is loaded.
                            </p>
                        </div>

                        <div className="flex justify-end mt-6">
                            <button
                                onClick={() => setIsHelpOpen(false)}
                                className="px-6 py-2 bg-primary text-primary-foreground text-sm font-bold font-medieval btn-forged"
                            >
                                Understood
                            </button>
                        </div>
                    </DialogContent>
                
            </CitadelDialog>

            {/* New File Dialog */}
            <CitadelDialog open={isNewFileOpen} onOpenChange={setIsNewFileOpen} >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="font-medieval uppercase tracking-widest">New Scroll</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">File Name</label>
                            <input
                                value={newFileName}
                                onChange={(e) => setNewFileName(e.target.value)}
                                placeholder="e.g. chapter1.tex"
                                className="w-full px-3 py-2 bg-muted/50 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') confirmAddFile();
                                }}
                                autoFocus
                            />
                            {newFileError && <p className="text-xs text-red-500">{newFileError}</p>}
                        </div>
                    </div>
                    <DialogFooter>
                        <button
                            onClick={() => setIsNewFileOpen(false)}
                            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={confirmAddFile}
                            className="px-6 py-2 bg-primary text-primary-foreground text-sm font-bold font-medieval btn-forged"
                        >
                            Forge Scroll
                        </button>
                    </DialogFooter>
                </DialogContent>
            </CitadelDialog>

            <ConfirmDialog
                open={!!confirmDeleteFile}
                onOpenChange={(open) => !open && setConfirmDeleteFile(null)}
                title="Delete File"
                description={`Are you sure you want to delete ${confirmDeleteFile}?`}
                confirmLabel="Delete"
                onConfirm={executeDeleteFile}
                variant="destructive"
            />
        </div >
    );
};
