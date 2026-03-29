import { ISidecarConfig, AbstractDockerSidecar } from '@citadel-app/core';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';

const LANGUAGE_IMAGES: Record<string, string> = {
    python: 'python:3.11-slim',
    node: 'node:18-slim',
    go: 'golang:1.21-alpine',
    rust: 'rust:1.72-slim',
    ruby: 'ruby:3.2-slim',
    lua: 'nickblah/lua:alpine'
};

export class ReplSidecar extends AbstractDockerSidecar {
    public readonly internalEvents = new EventEmitter();
    
    constructor(id: string, public readonly lang: string) {
        const normalizedLang = lang.toLowerCase();
        const image = LANGUAGE_IMAGES[normalizedLang];
        if (!image) throw new Error(`Unsupported language: ${lang}`);

        let replCmd: string[] = ['/bin/sh'];
        if (normalizedLang === 'python') replCmd = ['python', '-i'];
        else if (normalizedLang === 'node') replCmd = ['node', '-i'];
        else if (normalizedLang === 'ruby') replCmd = ['irb'];
        else if (normalizedLang === 'lua') replCmd = ['lua'];

        const config: ISidecarConfig = {
            id,
            type: 'repl',
            containerName: `codex-repl-${id}`,
            image: image,
            labels: {
                'com.codex.repl': 'true',
                'com.codex.lang': normalizedLang,
                'com.codex.sessionId': id
            },
            command: ['timeout', '1800s', ...replCmd]
        };
        super(config);
    }

    protected onStdout(data: string): void {
        this.internalEvents.emit('output', data);
    }

    protected onStderr(data: string): void {
        this.internalEvents.emit('output', data);
    }

    protected onClose(code: number | null): void {
        this.internalEvents.emit('closed', code);
    }

    protected async onAfterStop(): Promise<void> {
        // Automatically prune the container since it was heavily interactive
        return new Promise((resolve) => {
            console.log(`[Sidecar:${this.config.id}] Pruning container...`);
            spawn(this.dockerPath, ['rm', '-f', this.config.containerName]).on('close', () => resolve());
        });
    }
}
