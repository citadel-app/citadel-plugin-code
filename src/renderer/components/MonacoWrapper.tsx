import Editor, { EditorProps, Monaco } from '@monaco-editor/react';
import { useCallback, useEffect, useRef, useId, useState } from 'react';
import { useCoreServices } from '@citadel-app/ui';
import * as monaco from 'monaco-editor';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface MonacoWrapperProps extends EditorProps {
    className?: string;
    defaultValue?: string;
}

const languageToExt: Record<string, string> = {
    'python': 'py',
    'javascript': 'js',
    'typescript': 'ts',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'rust': 'rs',
    'go': 'go',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'markdown': 'md',
    'latex': 'tex',
    'sql': 'sql',
    'lua': 'lua',
};

export const MonacoWrapper = ({ className, language, onMount, ...props }: MonacoWrapperProps) => {
    const { settings } = useCoreServices();
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const instanceId = useId().replace(/:/g, ''); // Unique ID per editor instance
    const [isAtaLoading, setIsAtaLoading] = useState(false);

    // Detect dark mode - this is a rough check, ideally use context
    const [isDark, setIsDark] = useState(() => {
        if (typeof document === 'undefined') {
            return false;
        }
        return document.documentElement.classList.contains('dark');
    });


    useEffect(() => {
        if (typeof document === 'undefined') {
            return;
        }
        const detectDark = () => {
            const currentlyDark = document.documentElement.classList.contains('dark');
            setIsDark(prev => (prev !== currentlyDark ? currentlyDark : prev));
        };
        // Initial sync in case the theme changed before mount
        detectDark();
        // Observe changes to the `class` attribute on <html> to detect theme toggles
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (
                    mutation.type === 'attributes' &&
                    mutation.attributeName === 'class' &&
                    mutation.target === document.documentElement
                ) {
                    detectDark();
                    break;
                }
            }
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        });
        return () => {
            observer.disconnect();
        };
    }, []);


    // Determine path based on language to help LSP/ATA
    const ext = language ? languageToExt[language] || 'txt' : 'txt';
    const modelPath = `inmemory://model-${instanceId}.${ext}`;

    const handleEditorDidMount = useCallback((editor: monaco.editor.IStandaloneCodeEditor, m: Monaco) => {
        editorRef.current = editor;

        // Parent onMount call
        if (onMount) onMount(editor, m);
    }, [onMount]);

    useEffect(() => {
        if (!editorRef.current || !language) return;

        let isCancelled = false;
        let ataDisposable: { dispose: () => void } | null = null;
        let lspDisposable: { dispose: () => void } | null = null;

        const init = async () => {
            // 1. Setup ATA for JS/TS
            if (language === 'typescript' || language === 'javascript') {
                console.log(`[MonacoWrapper] Initializing ATA for ${language}`);
                const { setupATA } = await import('../lib/ata');

                if (isCancelled || !editorRef.current) return;

                ataDisposable = setupATA(editorRef.current, (status) => {
                    setIsAtaLoading(!!status);
                });
            }

            // 2. Setup LSP for other languages
            if (language !== 'typescript' && language !== 'javascript') {
                const env = settings?.executionEnvironments?.[language];
                if (env && env.lspCommand) {
                    console.log(`[MonacoWrapper] Initializing LSP for ${language} with: ${env.lspCommand}`);
                    const { initLSP } = await import('../lib/lsp-client');

                    if (isCancelled) return;

                    lspDisposable = await initLSP(language, env.lspCommand!);

                    // If we finished but unmounted in the meantime
                    if (isCancelled && lspDisposable) {
                        lspDisposable.dispose();
                    }
                }
            }
        };

        init();

        return () => {
            isCancelled = true;
            console.log(`[MonacoWrapper] Cleaning up ${language} logic`);
            if (ataDisposable) ataDisposable.dispose();
            if (lspDisposable) lspDisposable.dispose();

            // Clear markers when switching or unmounting
            const model = editorRef.current?.getModel();
            if (model) {
                monaco.editor.setModelMarkers(model, 'owner', []);
            }
        };
    }, [language, settings?.executionEnvironments]);

    return (
        <div className={cn("relative w-full h-full min-h-[100px]", className)}>
            <Editor
                height="100%"
                theme={isDark ? "vs-dark" : "light"}
                language={language}
                path={modelPath}
                onMount={handleEditorDidMount}
                {...props}
            />
            {isAtaLoading && (
                <div className="absolute bottom-2 right-4 flex items-center gap-2 px-2 py-1 bg-primary/10 text-[10px] text-primary rounded-md animate-pulse z-10">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                    Types acquiring...
                </div>
            )}
        </div>
    );
};
