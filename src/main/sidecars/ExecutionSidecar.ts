import { AbstractDockerSidecar } from '@citadel-app/core';
import { is } from '@electron-toolkit/utils';
import path from 'path';
import { spawn } from 'child_process';

// We must bypass core index shielding for native node classes
export class ExecutionSidecar extends AbstractDockerSidecar {
    
    constructor() {
        super({
            id: 'execution',
            type: 'daemon',
            containerName: 'codex-execution',
            image: 'codex-execution', // We build it locally from Dockerfile.execution
            ports: ['5051:5051']
        });
    }

    protected buildDockerRunArgs(): string[] {
        const args = super.buildDockerRunArgs();
        
        // Execution container needs access to the host's Docker socket
        const dockerSocket = process.platform === 'win32' 
            ? '//var/run/docker.sock:/var/run/docker.sock' 
            : '/var/run/docker.sock:/var/run/docker.sock';
            
        // Insert volume mapping after 'run' but before image name
        args.splice(1, 0, '-v', dockerSocket);
        
        return args;
    }

    protected async onBeforeStart(): Promise<boolean> {
        console.log(`[Sidecar:execution] Building execution image codex-execution locally...`);
        
        return new Promise<boolean>((resolve) => {
            const srcDir = is.dev 
                ? path.join(process.cwd(), 'src/python') 
                : path.join(process.resourcesPath, 'tts-service', 'src', 'python'); 

            const dockerfile = 'Dockerfile.execution';
            const buildCmd = `${this.dockerPath} build -t ${this.config.image} -f ${dockerfile} .`;
            
            const buildChild = spawn(buildCmd, { cwd: srcDir, shell: true });
            
            buildChild.stdout.on('data', (data) => console.log(`[Sidecar:execution:build] ${data}`));
            buildChild.stderr.on('data', (data) => console.error(`[Sidecar:execution:build] ${data}`));

            buildChild.on('close', (code) => {
                if (code !== 0) {
                    console.error(`[Sidecar:execution] Docker build failed with code ${code}.`);
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }

    protected onClose(code: number | null): void {
        console.log(`[Sidecar:execution] Daemon naturally exited with code: ${code}`);
    }
}
