import { DiffEditor, DiffEditorProps } from '@monaco-editor/react';

interface MonacoDiffWrapperProps extends DiffEditorProps {
    className?: string;
    original: string;
    modified: string;
    language?: string;
}

export const MonacoDiffWrapper = ({ className, original, modified, language = 'typescript', options, ...props }: MonacoDiffWrapperProps) => {
    // Detect dark mode - this is a rough check, ideally use context
    const isDark = document.documentElement.classList.contains('dark');

    return (
        <div className={className}>
            <DiffEditor
                height="100%"
                theme={isDark ? "vs-dark" : "light"}
                language={language}
                original={original}
                modified={modified}
                options={{
                    renderSideBySide: true,
                    useInlineViewWhenSpaceIsLimited: false,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    originalEditable: false,
                    readOnly: false,
                    ...options
                }}
                {...props}
            />
        </div>
    );
};
