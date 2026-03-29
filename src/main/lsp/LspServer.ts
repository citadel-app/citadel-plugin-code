import { WebSocketServer } from 'ws';
import * as http from 'http';
import * as net from 'net';
import * as url from 'url';
import * as rpc from 'vscode-ws-jsonrpc';
import * as server from 'vscode-ws-jsonrpc/server';
import * as jsonrpc from 'vscode-jsonrpc/node';
// import { isRequestMessage } from 'vscode-jsonrpc';
import { spawn } from 'child_process';

export class LspServer {
    private wss: WebSocketServer;

    constructor(server: http.Server) {
        this.wss = new WebSocketServer({
            noServer: true,
            perMessageDeflate: false
        });

        server.on('upgrade', (request: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
            const pathname = request.url ? url.parse(request.url).pathname : undefined;
            if (pathname === '/lsp') {
                this.wss.handleUpgrade(request, socket, head, (webSocket) => {
                    const socket: rpc.IWebSocket = {
                        send: (content) => webSocket.send(content, (error) => {
                            if (error) {
                                throw error;
                            }
                        }),
                        onMessage: (cb) => webSocket.on('message', cb),
                        onError: (cb) => webSocket.on('error', cb),
                        onClose: (cb) => webSocket.on('close', cb),
                        dispose: () => webSocket.close()
                    };
                    // Check if the request has a query parameter for the language
                    // e.g. /lsp?lang=python
                    const query = request.url ? url.parse(request.url, true).query : {};
                    const language = query.lang as string;
                    const command = query.command as string; // The command to spawn

                    if (webSocket.readyState === webSocket.OPEN) {
                        this.launch(socket, language, command);
                    } else {
                        webSocket.on('open', () => this.launch(socket, language, command));
                    }
                });
            }
        });
    }

    private launch(socket: rpc.IWebSocket, language: string, command: string) {
        const reader = new rpc.WebSocketMessageReader(socket);
        const writer = new rpc.WebSocketMessageWriter(socket);

        if (!command) {
            console.error('[LSP] No command provided for language:', language);
            // Ideally send an error back
            return;
        }

        console.log(`[LSP] Launching ${language} with command: ${command}`);
        
        // Spawn the language server process
        // Note: The command string needs to be parsed into cmd and args
        // Simple splitting by space for now (shell: true might be better but riskier?)
        // Let's use shell: true for maximum compatibility with user commands
        const process = spawn(command, [], {
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr
        });

        process.stderr.on('data', (data) => {
            console.error(`[LSP ${language}] stderr: ${data}`);
        });

        const socketConnection = server.createConnection(reader, writer, () => {
            console.log(`[LSP] Connection closed for ${language}`);
            socket.dispose();
        });
        
        const serverConnection = server.createConnection(
            new jsonrpc.StreamMessageReader(process.stdout),
            new jsonrpc.StreamMessageWriter(process.stdin),
            () => process.kill()
        );

        server.forward(socketConnection, serverConnection, message => {
            // if (isRequestMessage(message)) {
            //     // console.log(`[LSP] Client Request: ${message.method}`);
            // }
            return message;
        });
    }
}
