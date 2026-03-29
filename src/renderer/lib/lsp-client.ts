
import { MonacoLanguageClient } from 'monaco-languageclient';
import { CloseAction, ErrorAction, MessageTransports } from 'vscode-languageclient';
import { WebSocketMessageReader, WebSocketMessageWriter, toSocket } from 'vscode-ws-jsonrpc';
import * as monaco from 'monaco-editor';

export function createLanguageClient(transports: MessageTransports): MonacoLanguageClient {
    return new MonacoLanguageClient({
        name: 'Codex Language Client',
        clientOptions: {
            // use a language id as a root uri
            documentSelector: ['python', 'java', 'javascript', 'typescript'], // extend as needed
            // disable the default error handler
            errorHandler: {
                error: () => ({ action: ErrorAction.Continue }),
                closed: () => ({ action: CloseAction.DoNotRestart })
            }
        },
        messageTransports: transports
    });
}

export function createUrl(hostname: string, port: number, path: string): string {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${hostname}:${port}${path}`;
}

export async function initLSP(language: string, command: string): Promise<{ dispose: () => void }> {
    let client: MonacoLanguageClient | null = null;
    let webSocket: WebSocket | null = null;

    const anyApi = (window as any).api;
    const context = await anyApi.app.getInitContext();
    // Use module.invoke to fetch the port that was allocated by the code module
    const portFn = anyApi.module.invoke('@citadel-app/code', 'lsp.getPort');
    const port = (await portFn) || 3000;
    const url = createUrl('localhost', port, `/lsp?lang=${language}&command=${encodeURIComponent(command)}`);
    webSocket = new WebSocket(url);

    webSocket.onopen = () => {
        const socket = toSocket(webSocket!);
        const reader = new WebSocketMessageReader(socket);
        const writer = new WebSocketMessageWriter(socket);
        client = createLanguageClient({ reader, writer });
        client.start();
        console.log(`[LSP Client] Started for ${language}`);
        
        reader.onClose(() => client?.stop());
    };
    
    webSocket.onerror = (e) => {
        console.error(`[LSP Client] WebSocket error for ${language}:`, e);
    };

    return {
        dispose: () => {
            if (client) {
                client.stop();
            }
            if (webSocket) {
                webSocket.close();
            }
        }
    };
}
