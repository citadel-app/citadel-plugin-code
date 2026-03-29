import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export interface ReplSession {
    id: string;
    lang: string;
    containerName: string;
    status: 'starting' | 'running' | 'stopping' | 'stopped';
}

const LANGUAGE_IMAGES: Record<string, string> = {
    python: 'python:3.11-slim',
    node: 'node:18-slim',
    go: 'golang:1.21-alpine',
    rust: 'rust:1.72-slim',
    ruby: 'ruby:3.2-slim',
    lua: 'nickblah/lua:alpine'
};

const APP_LABEL = 'com.codex.repl=true';

export class DockerReplService extends EventEmitter {
    private sessions: Map<string, ReplSession> = new Map();
    private processes: Map<string, any> = new Map();

    async startSession(lang: string): Promise<string> {
        const normalizedLang = lang.toLowerCase();
        const image = LANGUAGE_IMAGES[normalizedLang];
        if (!image) throw new Error(`Unsupported language: ${lang}`);

        if (this.sessions.size > 0) {
            console.log(`[DockerRepl] Enforcing single session rule. Stopping existing sessions...`);
            for (const existingId of this.sessions.keys()) {
                await this.stopSession(existingId);
            }
            // Give it a moment to cleanup or just proceed as container names are unique with UUID
        }

        const sessionId = uuidv4();
        const containerName = `codex-repl-${sessionId}`;
        
        const session: ReplSession = {
            id: sessionId,
            lang: normalizedLang,
            containerName,
            status: 'starting'
        };
        this.sessions.set(sessionId, session);

        // For REPL ease, we'll start the language REPL directly if available, otherwise shell.
        let replCmd: string[] = ['/bin/sh'];
        
        if (normalizedLang === 'python') replCmd = ['python', '-i'];
        else if (normalizedLang === 'node') replCmd = ['node', '-i'];
        else if (normalizedLang === 'ruby') replCmd = ['irb'];
        else if (normalizedLang === 'go') replCmd = ['sh']; // Go has no native REPL, use shell
        else if (normalizedLang === 'rust') replCmd = ['sh'];
        else if (normalizedLang === 'lua') replCmd = ['lua'];

        const dockerArgs = [
            'run',
            '-i', // Keep stdin open
            '--rm', // Cleanup on exit
            '--name', containerName,
            '--label', APP_LABEL,
            '--label', `com.codex.lang=${normalizedLang}`,
            '--label', `com.codex.sessionId=${sessionId}`,
            image,
            'timeout', '1800s', // Auto-expire after 30 mins
            ...replCmd
        ];

        console.log(`[DockerRepl] Starting session ${sessionId} for ${lang} using ${image} with timeout 30m and cmd: ${replCmd.join(' ')}`);
        
        const child = spawn('docker', dockerArgs);
        this.processes.set(sessionId, child);

        child.stdout.on('data', (data) => {
            this.emit('output', { sessionId, data: data.toString() });
        });

        child.stderr.on('data', (data) => {
            this.emit('output', { sessionId, data: data.toString() });
        });

        child.on('close', (code) => {
            console.log(`[DockerRepl] Session ${sessionId} closed with code ${code}`);
            this.sessions.delete(sessionId);
            this.processes.delete(sessionId);
            this.emit('closed', { sessionId, code });
        });

        session.status = 'running';
        return sessionId;
    }

    async isSessionRunning(sessionId: string): Promise<boolean> {
        // First check internal map
        if (this.sessions.has(sessionId)) return true;

        // Otherwise check Docker for the label
        return new Promise((resolve) => {
            const check = spawn('docker', ['ps', '-q', '--filter', `label=com.codex.sessionId=${sessionId}`]);
            let output = '';
            check.stdout.on('data', d => output += d);
            check.on('close', () => {
                resolve(output.trim().length > 0);
            });
        });
    }

    sendInput(sessionId: string, data: string) {
        const child = this.processes.get(sessionId);
        if (child && child.stdin) {
            console.log(`[DockerRepl] Writing to session ${sessionId}:`, JSON.stringify(data));
            child.stdin.write(data);
        } else {
            console.warn(`[DockerRepl] Cannot write to session ${sessionId}: no process or stdin`);
        }
    }

    async stopSession(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.status = 'stopping';
        console.log(`[DockerRepl] Stopping session ${sessionId}`);
        
        // docker stop
        spawn('docker', ['stop', session.containerName]);
    }

    // List all containers managed by Codex (REPLs, backend services, etc.)
    async listContainers(): Promise<any[]> {
        return new Promise((resolve) => {
            // We fetch all containers and filter in JS for "managed-by=codex" or "com.codex" labels
            const ps = spawn('docker', ['ps', '-a', '--format', '{{json .}}']);
            let output = '';
            ps.stdout.on('data', d => output += d);
            ps.on('close', () => {
                const lines = output.trim().split('\n').filter(Boolean);
                const containers = lines.map(line => {
                    try {
                        const data = JSON.parse(line);
                        const labels = data.Labels || '';
                        
                        // Check for managed labels
                        // managed-by=codex OR contains com.codex
                        const isManaged = labels.includes('managed-by=codex') || labels.includes('com.codex');
                        
                        if (!isManaged) return null;

                        // Identify if this container is currently tracked by an active session
                        const isStale = labels.includes('com.codex.repl=true') && 
                                        ![...this.sessions.values()].some(s => s.containerName === data.Names);

                        return {
                            id: data.ID,
                            name: data.Names,
                            status: data.Status,
                            state: data.State,
                            image: data.Image,
                            labels: labels,
                            isStale
                        };
                    } catch (e) {
                        return null;
                    }
                }).filter(Boolean);
                resolve(containers);
            });
        });
    }

    async stopContainer(containerId: string): Promise<void> {
        return new Promise((resolve) => {
            spawn('docker', ['stop', containerId]).on('close', () => resolve());
        });
    }

    async removeContainer(containerId: string): Promise<void> {
        return new Promise((resolve) => {
            spawn('docker', ['rm', '-f', containerId]).on('close', () => resolve());
        });
    }

    // Cleanup all codex-repl containers on app shutdown
    async cleanupAll() {
        console.log('[DockerRepl] Cleaning up all codex-repl containers...');
        return new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
                console.warn('[DockerRepl] Cleanup timed out');
                resolve();
            }, 10000);

            const cleanup = spawn('docker', ['ps', '-a', '-q', '--filter', `label=${APP_LABEL}`]);
            let output = '';
            cleanup.stdout.on('data', d => output += d);
            cleanup.on('close', () => {
                const ids = output.trim().split('\n').filter(Boolean);
                if (ids.length > 0) {
                    spawn('docker', ['rm', '-f', ...ids]).on('close', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                } else {
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });
    }
}
