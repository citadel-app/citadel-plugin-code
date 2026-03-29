import React, { useState, useEffect } from 'react';
import { MonacoWrapper } from '../components/MonacoWrapper';

// Temporary mock of MarkdownViewer. Usually we would import this from @citadel-app/ui or core if we needed view-only mode.
// Actually, if !editable, the host still falls back to rendering MarkdownViewer because the section system handles it.
// The host passes `editable={true}` when editing.

interface SectionEditorProps {
    content: string;
    onChange: (content: string) => void;
    editable?: boolean;
    entryId?: string;
    basePath?: string;
}

export const CodeSectionEditor = ({ content, onChange, editable = true }: SectionEditorProps) => {
    // Determine initial language and code from content (```lang ... ```)
    const [language, setLanguage] = useState<string>('javascript');
    const [code, setCode] = useState<string>('');

    useEffect(() => {
        // Parse the markdown string ensuring we get the contents safely
        const match = content.match(/^```(\w+)?\n([\s\S]*?)```$/);
        if (match) {
            setLanguage(match[1] || 'javascript');
            setCode(match[2] || '');
        } else {
            // Not enclosed in a code block
            setCode(content);
        }
    }, [content]);

    const handleCodeChange = (newCode: string | undefined) => {
        const val = newCode || '';
        setCode(val);
        // Serialize back to markdown
        onChange(`\`\`\`${language}\n${val}\n\`\`\``);
    };

    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLang = e.target.value;
        setLanguage(newLang);
        onChange(`\`\`\`${newLang}\n${code}\n\`\`\``);
    };

    if (!editable) {
        return <div className="p-4 bg-muted/20 text-muted-foreground text-sm font-mono border rounded">{content}</div>;
    }

    return (
        <div className="flex flex-col border rounded-md shadow-sm overflow-hidden min-h-[200px]">
            <div className="bg-muted/50 px-3 py-2 border-b flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">Code Snippet</span>
                <select
                    value={language}
                    onChange={handleLanguageChange}
                    className="bg-background border rounded px-2 py-1 text-xs outline-none focus:border-primary"
                >
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="python">Python</option>
                    <option value="html">HTML</option>
                    <option value="css">CSS</option>
                    <option value="json">JSON</option>
                    <option value="rust">Rust</option>
                    <option value="go">Go</option>
                    <option value="java">Java</option>
                    <option value="cpp">C++</option>
                </select>
            </div>
            <div className="flex-1 min-h-[300px] relative">
                <MonacoWrapper
                    language={language}
                    value={code}
                    onChange={handleCodeChange}
                    options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        padding: { top: 16, bottom: 16 }
                    }}
                    className="absolute inset-0"
                />
            </div>
        </div>
    );
};
