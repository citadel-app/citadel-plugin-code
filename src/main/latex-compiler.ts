import { MainRegistrar } from '@citadel-app/core';
import { exec } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const registerLatexHandlers = (registrar: MainRegistrar<'@citadel-app/code'>) => {
    // Check if pdflatex is available
    registrar.handle('latex.check', async () => {
        try {
            console.log('[LatexCompiler] Checking pdflatex availability...');
            console.log('[LatexCompiler] PATH:', process.env.PATH);
            
            // Check for custom path in settings
            let customPath = '';
            try {
                const settingsPath = path.join(require('electron').app.getPath('userData'), 'app-settings.json');
                if (await fs.pathExists(settingsPath)) {
                    const settings = await fs.readJson(settingsPath);
                    if (settings.latexPath) {
                        customPath = settings.latexPath;
                        console.log('[LatexCompiler] Found custom latexPath:', customPath);
                    }
                }
            } catch (e) {
                console.warn('[LatexCompiler] Failed to read settings:', e);
            }

            // Try custom path first if it exists
            if (customPath) {
                try {
                    // Check if it's a full path to executable or just a command
                    const cmd = customPath.endsWith('.exe') ? `"${customPath}" --version` : `${customPath} --version`;
                    const { stdout } = await execAsync(cmd);
                    console.log('[LatexCompiler] Custom pdflatex found:', stdout.split('\n')[0]);
                    return true;
                } catch (e: any) {
                    console.warn('[LatexCompiler] Custom path failed:', e.message);
                }
            }

            try {
                const { stdout } = await execAsync('pdflatex --version');
                console.log('[LatexCompiler] pdflatex found available in PATH:', stdout.split('\n')[0]);
                return true;
            } catch (error: any) {
            console.error('[LatexCompiler] pdflatex check failed:', error.message);
            
            // Check common paths
            const isWindows = process.platform === 'win32';
            const isMac = process.platform === 'darwin';
            const commonPaths = isWindows ? [
                path.join(os.homedir(), 'AppData', 'Roaming', 'TinyTeX', 'bin', 'windows', 'pdflatex.exe'),
                'C:\\tools\\TinyTeX\\bin\\windows\\pdflatex.exe', 
                'C:\\ProgramData\\chocolatey\\bin\\pdflatex.exe',
                'C:\\texlive\\2025\\bin\\windows\\pdflatex.exe', 
                'C:\\texlive\\2024\\bin\\windows\\pdflatex.exe',
                'C:\\texlive\\2023\\bin\\windows\\pdflatex.exe'
            ] : isMac ? [
                '/Library/TeX/texbin/pdflatex',
                '/usr/local/bin/pdflatex',
                '/opt/homebrew/bin/pdflatex',
                '/usr/bin/pdflatex'
            ] : [
                '/usr/bin/pdflatex',
                '/usr/local/bin/pdflatex'
            ];
            
            for (const p of commonPaths) {
                if (await fs.pathExists(p)) {
                    console.log('[LatexCompiler] Found fallback at:', p);
                    return true; 
                }
            }
            return false;
        }
    } finally {
            
        }
    })

    // Compile LaTeX
    registrar.handle('latex.compile', async ({ files }: { files: { name: string, content: string, isBinary?: boolean }[] }) => {
        console.log('[LatexCompiler] Received files for compilation:', files.map(f => `${f.name} (bin: ${f.isBinary})`));
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-latex-'));
        
        try {
            // write all files
            for (const file of files) {
                // Security check: prevent path traversal
                if (file.name.includes('..') || path.isAbsolute(file.name)) {
                     console.warn(`[LatexCompiler] Blocked unsafe file name: ${file.name}`);
                     continue; // Skip unsafe files
                }

                const filePath = path.join(tempDir, file.name);
                // Ensure directory exists if file has path separators
                await fs.ensureDir(path.dirname(filePath));
                
                if (file.isBinary) {
                    // Content is base64 string, write as buffer
                    if (file.content == null) {
                        console.warn(`[LatexCompiler] Skipping binary file with null content: ${file.name}`);
                        continue;
                    }
                    const buffer = Buffer.from(file.content, 'base64');
                    await fs.writeFile(filePath, buffer);
                    console.log(`[LatexCompiler] Wrote binary file: ${file.name}, Size: ${buffer.length} bytes`);
                } else {
                    await fs.writeFile(filePath, file.content || '');
                }
            }

            // Find main entry point (assume main.tex or the first .tex file)
            // Find main entry point
            // Priority:
            // 1. 'main.tex' if it contains \documentclass
            // 2. Any .tex file containing \documentclass
            // 3. 'main.tex' (fallback)
            // 4. First .tex file (fallback)
            
            let mainFile = files.find(f => f.name === 'main.tex' && f.content?.includes('\\documentclass'));
            
            if (!mainFile) {
                // Search for any file with documentclass
                mainFile = files.find(f => f.name.endsWith('.tex') && f.content?.includes('\\documentclass'));
            }
            
            if (!mainFile) {
                // Fallback to name-based
                mainFile = files.find(f => f.name === 'main.tex');
            }
            
            if (!mainFile) {
                // Final fallback
                mainFile = files.find(f => f.name.endsWith('.tex'));
            }

            if (!mainFile) {
                throw new Error('No .tex file found (must contain \\documentclass).');
            }

            const mainFileName = mainFile.name; // e.g. "my/folder/main.tex" or "main.tex"
            
            // We need to run pdflatex in the tempDir
            // If mainFile is in a subdir, we need to handle that. 
            // For now, assume flat or simple structure, let users define relative paths in includes.
            // pdflatex output-directory defaults to pwd.

            // Determine pdflatex command
            let pdflatexCmd = 'pdflatex';

            // Check settings for custom path
            try {
                const settingsPath = path.join(require('electron').app.getPath('userData'), 'app-settings.json');
                if (await fs.pathExists(settingsPath)) {
                    const settings = await fs.readJson(settingsPath);
                    if (settings.latexPath) {
                         const p = settings.latexPath;
                         // Verify it exists or is runnable
                         if (await fs.pathExists(p) || p === 'pdflatex') {
                             pdflatexCmd = p.endsWith('.exe') ? `"${p}"` : p;
                             console.log('[LatexCompiler] Using custom settings path:', pdflatexCmd);
                         }
                    }
                }
            } catch (e) {
                 console.warn('[LatexCompiler] Failed to read settings for compile:', e);
            }
            
            // If still default, try to resolve it from common paths if 'pdflatex' doesn't work
            if (pdflatexCmd === 'pdflatex') {
                try {
                    await execAsync('pdflatex --version');
                } catch (e) {
                    const isWindows = process.platform === 'win32';
                    const isMac = process.platform === 'darwin';
                    const commonPaths = isWindows ? [
                        path.join(os.homedir(), 'AppData', 'Roaming', 'TinyTeX', 'bin', 'windows', 'pdflatex.exe'),
                        'C:\\tools\\TinyTeX\\bin\\windows\\pdflatex.exe', 
                        'C:\\ProgramData\\chocolatey\\bin\\pdflatex.exe',
                        'C:\\texlive\\2025\\bin\\windows\\pdflatex.exe', 
                        'C:\\texlive\\2024\\bin\\windows\\pdflatex.exe'
                    ] : isMac ? [
                        '/Library/TeX/texbin/pdflatex',
                        '/usr/local/bin/pdflatex',
                        '/opt/homebrew/bin/pdflatex',
                        '/usr/bin/pdflatex'
                    ] : [
                        '/usr/bin/pdflatex',
                        '/usr/local/bin/pdflatex'
                    ];
                    for (const p of commonPaths) {
                        if (await fs.pathExists(p)) {
                            pdflatexCmd = `"${p}"`;
                            break;
                        }
                    }
                }
            }

            // Quote the filename to handle spaces
            // IMPORTANT: pdflatex needs the file name without path if we are in cwd, 
            // or we must be careful. We are properly setting cwd to tempDir.
            // also -interaction=nonstopmode is crucial.
            const command = `${pdflatexCmd} -interaction=nonstopmode -halt-on-error -output-directory=. "${path.basename(mainFileName)}"`;
            
            // First run
            try {
                console.log(`[LatexCompiler] Running: ${command} in ${tempDir}`);
                const { stdout, stderr } = await execAsync(command, { cwd: tempDir });
                console.log('[LatexCompiler] stdout:', stdout);
                if (stderr) console.warn('[LatexCompiler] stderr:', stderr);
            } catch (e: any) {
                // If it fails, capture stdout for logs
                console.error('LaTeX Compilation Error (Run 1):', e);
                console.error('Stdout:', e.stdout);
                console.error('Stderr:', e.stderr);
                throw new Error(`LaTeX Error: ${e.stdout || e.message}`);
            }

            // BibTeX check
            const bibFile = files.find(f => f.name.endsWith('.bib'));
            if (bibFile) {
                const basename = path.basename(mainFileName, '.tex');
                try {
                    await execAsync(`bibtex "${basename}"`, { cwd: tempDir });
                    // Run pdflatex twice more for references
                    await execAsync(command, { cwd: tempDir });
                    await execAsync(command, { cwd: tempDir });
                } catch (e: any) {
                    console.warn('BibTeX Warning:', e.message);
                }
            }

            // Read PDF
            const pdfName = mainFileName.replace(/\.tex$/, '.pdf');
            const pdfPath = path.join(tempDir, pdfName);
            
            if (await fs.pathExists(pdfPath)) {
                const pdfBuffer = await fs.readFile(pdfPath);
                return {
                    success: true,
                    pdf: pdfBuffer.toString('base64'),
                    logs: 'Compilation successful.'
                };
            } else {
                throw new Error('PDF file was not generated.');
            }

        } catch (error: any) {
            return {
                success: false,
                logs: error.message || String(error)
            };
        } finally {
            // Cleanup
            try {
                await fs.remove(tempDir);
            } catch (e) {
                console.error('Failed to clean up temp dir:', e);
            }
        }
    });
};
