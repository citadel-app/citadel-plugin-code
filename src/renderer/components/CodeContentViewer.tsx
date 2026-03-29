import { useState, useEffect, useCallback, useRef } from 'react';
import { useCoreServices } from '@citadel-app/ui';
import { CodeSolutionSection, Solution, ExecutionResult } from './CodeSolutionSection';

interface CodeModuleProps {
    entry: any; // Using any instead of CodexEntry to avoid importing from host
}

// --- Language to Extension Mapping ---
const extensionMap: Record<string, string> = {
    'python': 'py',
    'javascript': 'js',
    'typescript': 'ts',
    'html': 'html',
    'css': 'css',
    'sql': 'sql',
    'json': 'json',
    'markdown': 'md',
    'rust': 'rs',
    'go': 'go',
    'c': 'c',
    'cpp': 'cpp',
    'java': 'java',
    'lua': 'lua',
    'csharp': 'cs',
    'zig': 'zig',
    'ruby': 'rb',
    'swift': 'swift',
    'kotlin': 'kt',
    'dart': 'dart',
    'php': 'php',
    'shell': 'sh',
    'powershell': 'ps1',
    'batch': 'bat',
    'bash': 'sh',
    'zsh': 'sh',
    'fish': 'sh',
};

const getExtension = (lang: string) => extensionMap[lang.toLowerCase()] || 'txt';

export const CodeContentViewer = ({ entry }: CodeModuleProps) => {
    const { settings, dataManager } = useCoreServices();

    // SOLUTIONS STATE MANAGEMENT
    const [localSolutions, setLocalSolutions] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const lastSavedRef = useRef<string>('');
    const debouncedSaveRef = useRef<NodeJS.Timeout | null>(null);

    // 1. Initial Load & Migration
    useEffect(() => {
        const loadAndMigrate = async () => {
            if (!entry) return;

            let solutions = entry.frontmatter?.solutions || [];

            // Handle legacy single solution migration
            if (solutions.length === 0 && entry.frontmatter?.solution) {
                solutions = [{
                    id: 'sol-1',
                    language: entry.frontmatter.language || 'typescript',
                    code: entry.frontmatter.solution
                }];
            }

            let needsFrontmatterUpdate = false;

            const processedSolutions = await Promise.all(solutions.map(async (sol: any, index: number) => {
                // Determine a safe filename if not present
                const ext = getExtension(sol.language);
                const entryName = entry.title.replace(/[^a-z0-9]/gi, '_');
                const defaultPath = `code/${entryName}/Solution_${index + 1}.${ext}`;

                // Case A: Migration needed (code in frontmatter but no path or no file)
                if (sol.code && !sol.path) {
                    console.log(`[CodeModule] Migrating solution ${sol.id} to file: ${defaultPath}`);
                    await dataManager.writeEntryFile(entry.id, defaultPath, sol.code);
                    needsFrontmatterUpdate = true;
                    return { ...sol, path: defaultPath };
                }

                // Case B: Load from existing path
                if (sol.path) {
                    try {
                        const code = await dataManager.readEntryFile(entry.id, sol.path);
                        return { ...sol, code };
                    } catch (e) {
                        console.error(`[CodeModule] Failed to read solution file: ${sol.path}`, e);
                        // If file is missing but we have code in frontmatter, try to restore
                        if (sol.code) {
                            await dataManager.writeEntryFile(entry.id, sol.path, sol.code);
                            return sol;
                        }
                    }
                }

                return sol;
            }));

            setLocalSolutions(processedSolutions);
            lastSavedRef.current = JSON.stringify(processedSolutions.map(s => s.code));

            // If we migrated items, sanitize frontmatter (remove raw code)
            if (needsFrontmatterUpdate) {
                const sanitizedFM = processedSolutions.map(s => {
                    const { code, ...rest } = s;
                    return rest;
                });
                await dataManager.updateEntry(entry.id, {
                    frontmatter: {
                        ...entry.frontmatter,
                        solutions: sanitizedFM,
                        solution: undefined, // Clear legacy single solution
                        language: undefined
                    }
                });
            }
        };

        loadAndMigrate();
    }, [entry?.id]);

    // 2. Debounced Save (Files + Frontmatter Metadata)
    const handleSolutionsChange = useCallback((newSolutions: any[]) => {
        setLocalSolutions(newSolutions);
        setIsSaving(true);

        if (debouncedSaveRef.current) {
            clearTimeout(debouncedSaveRef.current);
        }

        debouncedSaveRef.current = setTimeout(async () => {
            const currentCodes = newSolutions.map(s => s.code);
            if (JSON.stringify(currentCodes) === lastSavedRef.current) {
                setIsSaving(false);
                return;
            }

            try {
                // A. Save individual files
                let metadataChanged = false;
                const solutionsMetadata = await Promise.all(newSolutions.map(async (sol, index) => {
                    const expectedExt = getExtension(sol.language);

                    // 1. Handle Path Initialization or Extension Changes
                    if (!sol.path) {
                        const entryName = entry.title.replace(/[^a-z0-9]/gi, '_');
                        sol.path = `code/${entryName}/Solution_${index + 1}.${expectedExt}`;
                        metadataChanged = true;
                    } else {
                        const currentExt = sol.path.split('.').pop();
                        if (currentExt !== expectedExt) {
                            const newPath = sol.path.replace(/\.[^/.]+$/, `.${expectedExt}`);
                            console.log(`[CodeModule] Renaming ${sol.path} to ${newPath} due to language change`);
                            try {
                                await dataManager.renameEntryFile(entry.id, sol.path, newPath);
                                sol.path = newPath;
                                metadataChanged = true;
                            } catch (e) {
                                console.error("[CodeModule] Failed to rename file", e);
                                // If rename fails (e.g. source missing), we'll just update path and write fresh
                                sol.path = newPath;
                                metadataChanged = true;
                            }
                        }
                    }

                    await dataManager.writeEntryFile(entry.id, sol.path, sol.code);

                    // Return only metadata for frontmatter
                    const { code, ...meta } = sol;
                    return meta;
                }));

                // B. Detect metadata changes (array structure, languages, or paths)
                const oldMetadataStr = JSON.stringify(entry.frontmatter?.solutions || []);
                const newMetadataStr = JSON.stringify(solutionsMetadata);

                if (metadataChanged || newMetadataStr !== oldMetadataStr) {
                    console.log("[CodeModule] Syncing solution metadata to markdown...");
                    await dataManager.updateEntry(entry.id, {
                        frontmatter: { ...entry.frontmatter, solutions: solutionsMetadata }
                    });
                } else {
                    console.log("[CodeModule] Code saved to files. Skipping markdown update.");
                }

                lastSavedRef.current = JSON.stringify(currentCodes);
            } catch (e) {
                console.error("[CodeModule] Failed to save solutions to files", e);
            } finally {
                setIsSaving(false);
            }
        }, 1000);
    }, [entry]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (debouncedSaveRef.current) {
                clearTimeout(debouncedSaveRef.current);
            }
        };
    }, []);

    const handleRunSolution = useCallback(async (solution: Solution): Promise<ExecutionResult> => {
        if (!solution.code.trim()) {
            throw new Error("No code to execute");
        }

        // 1. Get Environment Config
        const env = settings.executionEnvironments?.[solution.language];
        if (!env) {
            throw new Error(`No execution environment configured for ${solution.language}. Please check Settings.`);
        }

        // 2. Call Execution Server
        try {
            const baseUrl = settings.executionUrl || 'http://127.0.0.1:5051';
            const url = baseUrl.replace('localhost', '127.0.0.1');

            const response = await fetch(`${url}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: solution.code,
                    language: solution.language,
                    image: env.image,
                    command: env.command
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            return await response.json();
        } catch (error: any) {
            console.error("Execution failed:", error);
            throw error;
        }
    }, [settings.executionEnvironments, settings.executionUrl]);

    return (
        <div className="h-full border-l border-border bg-background">
            <CodeSolutionSection
                solutions={localSolutions}
                onSolutionsChange={handleSolutionsChange}
                onRunSolution={handleRunSolution}
                className="h-full border-none rounded-none"
            />
        </div>
    );
};
