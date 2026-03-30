import { definePlugin } from '@citadel-app/sdk';
import { lazy } from 'react';
import { CodeSolutionSection } from './components/CodeSolutionSection';
import { CodeSectionEditor } from './components/CodeSectionEditor';
import { CodeContentViewer } from './components/CodeContentViewer';
import { ReplProvider } from './context/ReplContext';
import { CodeStatusWidget } from './components/CodeStatusWidget';
import { CodeExecutionWidget } from './components/CodeExecutionWidget';
import pkg from '../../package.json';

// @ts-ignore
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
// @ts-ignore
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
// @ts-ignore
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
// @ts-ignore
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
// @ts-ignore
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

export const CodeModule = definePlugin({
    id: pkg.name,
    version: pkg.version,

    renderer: {
        contentModules: {
            code: {
                id: 'code',
                label: 'Code Editor',
                description: 'Monaco code editor.',
                requirements: []
            }
        },

        providers: [
            { entry: { id: 'repl-provider', scope: 'global', priority: 110 }, component: ReplProvider }
        ],

        routes: [
            { path: '/editor', component: lazy(() => import('./pages/EditorPage').then(m => ({ default: m.EditorPage }))) },
            { path: '/latex', component: lazy(() => import('./pages/LatexEditorPage').then(m => ({ default: m.LatexEditorPage }))) },
            { path: '/repl', component: lazy(() => import('./pages/ReplPage').then(m => ({ default: m.ReplPage }))) }
        ],

        globalComponents: [
            { region: 'CodeSolutionSection', component: CodeSolutionSection },
            { region: 'MonacoDiffWrapper', component: lazy(() => import('./components/MonacoDiffWrapper').then(m => ({ default: m.MonacoDiffWrapper }))) }
        ],

        navigation: [
            {
                id: 'nav-repl',
                label: 'The Forge',
                path: '/repl',
                icon: 'Terminal',
                activeClass: 'text-primary bg-primary/10',
                inactiveClass: 'text-cyan-500 hover:bg-cyan-500/10',
                priority: 30
            }
        ],

        sidebar: [
            {
                id: 'sidebar-editor',
                label: 'The Workshop',
                path: '/editor',
                icon: 'Hammer',
                priority: 30,
                tourId: 'tour-editor'
            },
            {
                id: 'sidebar-latex',
                label: 'The Scribe',
                path: '/latex',
                icon: 'Languages',
                priority: 40
            }
        ],

        sectionTemplates: [
            { 
                id: 'code', 
                label: 'Code snippet', 
                icon: 'Code', 
                content: '```javascript\n\n```',
                pattern: '^```([a-z]+)?\\n[\\s\\S]*```$'
            }
        ],

        contentViewers: {
            code: CodeContentViewer
        },

        statusWidgets: [
            { id: 'code-status', group: 'Cloud & Local Stack', component: CodeStatusWidget },
            { id: 'code-execution', group: 'Cloud & Local Stack', component: CodeExecutionWidget }
        ],

        onActivate: async (registrar) => {
            console.log('[CodePlugin] Activating renderer side...');

            // Initialize Monaco Environment for Web Workers
            (self as any).MonacoEnvironment = {
                getWorker(_: any, label: string) {
                    if (label === 'json') return new jsonWorker();
                    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
                    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
                    if (label === 'typescript' || label === 'javascript') return new tsWorker();
                    return new editorWorker();
                }
            };

            const { CodeSettings } = await import('./components/CodeSettings');
            registrar.registerSettingsPanel({
                id: 'execution',
                title: 'Code',
                icon: 'Terminal',
                component: CodeSettings,
                priority: 40
            });
        }
    }
});

