import React, { useState } from 'react';
import { useCoreServices, Tabs } from '@citadel-app/ui';
import { Flame, Terminal, Cpu, Box, Plus, Trash2 } from 'lucide-react';

// A local helper for conditional classes
const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

export const CodeSettings = () => {
    const { settings, updateSetting, toast, hostApi: __hostApi } = useCoreServices();
    const [confirmRemoveEnv, setConfirmRemoveEnv] = useState<string | null>(null);

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            <section className="space-y-4">
                <h2 className="text-lg font-semibold border-b border-border pb-2 flex items-center gap-2">
                    <Flame size={20} />
                    <span>Code Execution</span>
                </h2>

                <div className="grid gap-4 pl-4">
                    <p className="text-sm text-muted-foreground">
                        Configure the Docker environments used to execute code safely.
                    </p>

                    <div className="grid gap-2 border-b border-border pb-4 mb-2">
                        <label className="text-sm font-medium">Execution Server URL</label>
                        <input
                            type="text"
                            className="bg-muted border border-border rounded px-3 py-2 text-sm w-full max-w-xs focus:ring-1 focus:ring-primary outline-none"
                            value={settings.executionUrl || 'http://localhost:5051'}
                            onChange={(e) => updateSetting('executionUrl', e.target.value)}
                            placeholder="http://localhost:5051"
                        />
                        <p className="text-xs text-muted-foreground">URL of the local Python Execution server.</p>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium">Environments</h3>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Configure Runtimes</p>
                        </div>

                        <Tabs.Root defaultValue={Object.keys(settings.executionEnvironments || {})[0] || 'add-new'}
                            className="border border-border rounded-xl overflow-hidden bg-card/30 flex flex-col min-h-[400px]"
                        >
                            <Tabs.List className="flex bg-muted/50 border-b border-border p-1 gap-1 overflow-x-auto scrollbar-none">
                                {Object.keys(settings.executionEnvironments || {}).map(lang => (
                                    <Tabs.Trigger
                                        key={lang}
                                        value={lang}
                                        className="px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-muted text-muted-foreground"
                                    >
                                        <div className={cn(
                                            "w-2 h-2 rounded-full",
                                            settings.executionEnvironments?.[lang]?.image ? "bg-green-400" : "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]"
                                        )} />
                                        <span className="capitalize">{lang}</span>
                                    </Tabs.Trigger>
                                ))}
                                <Tabs.Trigger
                                    value="add-new"
                                    className="px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=inactive]:hover:bg-muted text-muted-foreground ml-auto border border-dashed border-border"
                                >
                                    <Plus size={14} />
                                    Add New
                                </Tabs.Trigger>
                            </Tabs.List>

                            {Object.entries(settings.executionEnvironments || {}).map(([lang, config]: [string, any]) => (
                                <Tabs.Content key={lang} value={lang} className="p-6 outline-none animate-in fade-in slide-in-from-left-2 duration-300">
                                    <div className="flex justify-between items-center mb-6">
                                        <div className="flex items-center gap-4">
                                            <h4 className="text-lg font-bold capitalize flex items-center gap-2">
                                                {lang} Environment
                                            </h4>
                                            <span className="text-[10px] bg-muted px-2 py-1 rounded-md text-muted-foreground font-mono font-bold tracking-wider">.{config.extension}</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newEnvs = { ...settings.executionEnvironments };
                                                delete newEnvs[lang];
                                                updateSetting('executionEnvironments', newEnvs);
                                                setConfirmRemoveEnv(null);
                                            }}
                                            className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all flex items-center gap-2 text-xs font-bold"
                                            title="Delete Environment"
                                        >
                                            <Trash2 size={14} />
                                            Remove
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Docker Image</label>
                                            <div className="relative">
                                                <Box size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground opacity-50" />
                                                <input
                                                    type="text"
                                                    className="w-full bg-background/50 border border-border rounded-xl pl-10 pr-4 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                                    value={config.image}
                                                    onChange={(e) => {
                                                        const newEnvs = { ...settings.executionEnvironments };
                                                        newEnvs[lang] = { ...config, image: e.target.value };
                                                        updateSetting('executionEnvironments', newEnvs);
                                                    }}
                                                    placeholder="e.g. python:3.9-slim"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Run Command</label>
                                            <div className="relative">
                                                <Terminal size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground opacity-50" />
                                                <input
                                                    type="text"
                                                    className="w-full bg-background/50 border border-border rounded-xl pl-10 pr-4 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                                    value={config.command}
                                                    onChange={(e) => {
                                                        const newEnvs = { ...settings.executionEnvironments };
                                                        newEnvs[lang] = { ...config, command: e.target.value };
                                                        updateSetting('executionEnvironments', newEnvs);
                                                    }}
                                                    placeholder="e.g. python /code/script.py"
                                                />
                                            </div>
                                        </div>

                                        <div className="md:col-span-2 space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">LSP Command (Local)</label>
                                                <div className="relative">
                                                    <Cpu size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground opacity-50" />
                                                    <input
                                                        type="text"
                                                        className="w-full bg-background/50 border border-border rounded-xl pl-10 pr-4 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                                        value={config.lspCommand || ''}
                                                        onChange={(e) => {
                                                            const newEnvs = { ...settings.executionEnvironments };
                                                            newEnvs[lang] = { ...config, lspCommand: e.target.value };
                                                            updateSetting('executionEnvironments', newEnvs);
                                                        }}
                                                        placeholder="e.g. pylsp"
                                                    />
                                                </div>
                                                <p className="text-[10px] text-muted-foreground pl-1 italic">Used for providing intellisense features in the workshop.</p>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Default Boilerplate</label>
                                                <textarea
                                                    className="w-full bg-background/50 border border-border rounded-xl px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-h-[120px] resize-none"
                                                    value={config.snippet || ''}
                                                    onChange={(e) => {
                                                        const newEnvs = { ...settings.executionEnvironments };
                                                        newEnvs[lang] = { ...config, snippet: e.target.value };
                                                        updateSetting('executionEnvironments', newEnvs);
                                                    }}
                                                    placeholder="// Initial code for new scrolls..."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </Tabs.Content>
                            ))}

                            <Tabs.Content value="add-new" className="p-8 outline-none animate-in fade-in slide-in-from-right-2 duration-300">
                                <div className="max-w-xl mx-auto space-y-8">
                                    <div className="text-center space-y-2">
                                        <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary/20 shadow-xl shadow-primary/5">
                                            <Plus size={32} />
                                        </div>
                                        <h3 className="text-xl font-bold">New Execution Environment</h3>
                                        <p className="text-sm text-muted-foreground">Add a new language runtime.</p>
                                    </div>

                                    <div className="grid gap-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Language (ID)</label>
                                                <input
                                                    id="new-env-name"
                                                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                                    placeholder="e.g. ruby"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Extension</label>
                                                <input
                                                    id="new-env-ext"
                                                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                                    placeholder="e.g. rb"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Docker Image</label>
                                            <input
                                                id="new-env-image"
                                                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                                placeholder="e.g. ruby:alpine"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Run Command</label>
                                            <input
                                                id="new-env-cmd"
                                                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                                placeholder="ruby /code/script.rb"
                                            />
                                        </div>

                                        <button
                                            onClick={() => {
                                                const nameInput = document.getElementById('new-env-name') as HTMLInputElement;
                                                const extInput = document.getElementById('new-env-ext') as HTMLInputElement;
                                                const imageInput = document.getElementById('new-env-image') as HTMLInputElement;
                                                const cmdInput = document.getElementById('new-env-cmd') as HTMLInputElement;

                                                const name = nameInput.value.trim().toLowerCase();
                                                if (!name) return toast("Language name is required", { type: 'warning' });
                                                if (settings.executionEnvironments?.[name]) return toast("Environment already exists", { type: 'warning' });

                                                const newEnvs = { ...settings.executionEnvironments };
                                                newEnvs[name] = {
                                                    image: imageInput.value.trim() || `${name}:latest`,
                                                    command: cmdInput.value.trim() || `${name} /code/script.${extInput.value.trim() || 'txt'}`,
                                                    extension: extInput.value.trim() || 'txt'
                                                };

                                                updateSetting('executionEnvironments', newEnvs);

                                                nameInput.value = '';
                                                extInput.value = '';
                                                imageInput.value = '';
                                                cmdInput.value = '';
                                            }}
                                            className="mt-2 w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/10 hover:shadow-primary/20 hover:bg-primary/90 hover:scale-[1.01] active:scale-[0.99] transition-all"
                                        >
                                            Forged Environment
                                        </button>
                                    </div>
                                </div>
                            </Tabs.Content>
                        </Tabs.Root>
                    </div>

                    <div className="mt-4 p-4 rounded bg-primary/5 border border-primary/20">
                        <h4 className="text-sm font-medium flex items-center gap-2 text-primary mb-2">
                            How it works
                        </h4>
                        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                            <li>Code is executed inside isolated <strong>Docker containers</strong>.</li>
                            <li>The <strong>Docker Image</strong> must be available locally (run <code>docker pull &lt;image&gt;</code>).</li>
                            <li>The code file is mounted to <code>/code/script.&lt;ext&gt;</code> inside the container.</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold border-b border-border pb-2">LaTeX Configuration</h2>
                <div className="grid gap-2">
                    <label htmlFor="latexPath" className="text-sm font-medium">
                        Custom pdflatex Path
                    </label>
                    <div className="flex gap-2">
                        <input
                            id="latexPath"
                            type="text"
                            placeholder="e.g. C:\texlive\2024\bin\windows\pdflatex.exe"
                            className="flex-1 px-3 py-2 bg-muted/50 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            value={settings.latexPath || ''}
                            onChange={(e) => updateSetting('latexPath', e.target.value)}
                        />
                        <button
                            onClick={async () => {
                                try {
                                    const available = await __hostApi.module.invoke('@citadel-app/code', 'latex.check');
                                    toast(available ? "pdflatex found!" : "pdflatex not found.", { type: available ? 'success' : 'error' });
                                } catch (e) {
                                    toast("LaTeX check not available", { type: 'error' });
                                }
                            }}
                            className="px-3 py-2 bg-secondary text-secondary-foreground rounded-md text-sm hover:bg-secondary/80"
                        >
                            Verify
                        </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Leave empty to attempt auto-detection.
                    </p>
                </div>
            </section>
        </div>
    );
};
