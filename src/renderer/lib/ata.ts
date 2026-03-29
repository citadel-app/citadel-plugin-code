import { setupTypeAcquisition } from '@typescript/ata';
import ts from 'typescript';
import * as monaco from 'monaco-editor';

export function setupATA(editor: monaco.editor.IStandaloneCodeEditor, onStatusChange?: (status: string) => void) {
    console.log('[ATA] Typescript object:', Object.keys(ts));
    const ata = setupTypeAcquisition({
        projectName: 'My ATA Project',
        typescript: ts,
        logger: {
            log: (message) => console.log('[ATA]', message),
            error: (message) => console.error('[ATA]', message),
            groupCollapsed: () => { },
            groupEnd: () => { }
        },
        delegate: {
            receivedFile: (code, path) => {
                // Add to both TS and JS defaults to cover both cases
                const ts = monaco.languages.typescript as any;
                ts.typescriptDefaults.addExtraLib(code, path);
                ts.javascriptDefaults.addExtraLib(code, path);
                console.log(`[ATA] Added ${path}`);
            },
            started: () => {
                onStatusChange?.('Fetching types...');
            },
            progress: (downloaded: number, total: number) => {
                onStatusChange?.(`Fetching types: ${downloaded}/${total}`);
            },
            finished: (files) => {
                onStatusChange?.(`Types acquired`);
                setTimeout(() => onStatusChange?.(''), 2000); // Clear after 2s
            },
        },
    });

    // Hook into editor changes
    const disposable = editor.onDidChangeModelContent(() => {
        const value = editor.getValue();
        ata(value);
    });

    // Initial run
    ata(editor.getValue());

    return {
        dispose: () => {
            disposable.dispose();
        }
    };
}
