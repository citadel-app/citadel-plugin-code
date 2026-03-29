import { Monaco } from '@monaco-editor/react';

export const registerLatexLanguage = (monaco: Monaco) => {
    // Register LaTeX
    if (!monaco.languages.getLanguages().some(l => l.id === 'latex')) {
        monaco.languages.register({ id: 'latex' });
        
        monaco.languages.setMonarchTokensProvider('latex', {
            displayName: 'LaTeX',
            defaultToken: '',
            tokenPostfix: '.latex',

            // Common LaTeX keywords and commands
            keywords: [
                '\\documentclass', '\\usepackage', '\\begin', '\\end', 
                '\\section', '\\subsection', '\\subsubsection', '\\paragraph',
                '\\chapter', '\\part', '\\tableofcontents', '\\listoffigures',
                '\\listoftables', '\\maketitle', '\\author', '\\title', '\\date',
                '\\cite', '\\ref', '\\label', '\\include', '\\input',
                '\\newcommand', '\\renewcommand', '\\providecommand',
                '\\bf', '\\it', '\\rm', '\\sc', '\\sf', '\\sl', '\\tt',
                '\\textbf', '\\textit', '\\textrm', '\\textsc', '\\textsf', '\\textsl', '\\texttt',
                '\\emph'
            ],

            escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

            tokenizer: {
                root: [
                    // Comments
                    [/%.*$/, 'comment'],

                    // Math (Block and Inline)
                    [/(\$\$)([^$]+)(\$\$)/, ['delimiter.bracket', 'string.math', 'delimiter.bracket']],
                    [/(\$)([^$]+)(\$)/, ['delimiter.bracket', 'string.math', 'delimiter.bracket']],
                    [/\\\[/, { token: 'delimiter.bracket', next: '@mathBlock' }],
                    [/\\\(/, { token: 'delimiter.bracket', next: '@mathInline' }],

                    // Commands / Keywords
                    [/\\(?:begin|end|documentclass|usepackage|bibliographystyle|bibliography)\b/, 'keyword'],
                    [/\\(?:section|subsection|subsubsection|paragraph|chapter|part)\b/, 'keyword.flow'],
                    [/\\[a-zA-Z@]+/, 'keyword'],

                    // Arguments (curly braces)
                    [/{/, { token: 'delimiter.curly', next: '@curly' }],
                    [/}/, 'delimiter.curly'],
                    
                    // Optional Arguments (square brackets)
                    [/\[/, { token: 'delimiter.square', next: '@square' }],
                    [/\]/, 'delimiter.square'],

                    // Special characters
                    [/[&^#]/, 'keyword.operator'],
                ],

                curly: [
                    [/{/, { token: 'delimiter.curly', next: '@push' }],
                    [/}/, { token: 'delimiter.curly', next: '@pop' }],
                    [/[^{}]+/, 'string'],
                ],

                square: [
                    [/\[/, { token: 'delimiter.square', next: '@push' }],
                    [/\]/, { token: 'delimiter.square', next: '@pop' }],
                    [/[^\[\]]+/, 'string.attribute'],
                ],

                mathBlock: [
                    [/\\\]/, { token: 'delimiter.bracket', next: '@pop' }],
                    [/[^\\\]]+/, 'string.math'],
                    [/./, 'string.math'] // Fallback
                ],

                mathInline: [
                    [/\\\)/, { token: 'delimiter.bracket', next: '@pop' }],
                    [/[^\\\)]+/, 'string.math'],
                    [/./, 'string.math'] // Fallback
                ]
            }
        });

        // Define a Theme that mimics VS Code Dark+ for LaTeX
        monaco.editor.defineTheme('latex-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'keyword', foreground: 'C586C0' }, // Purple (Control flow)
                { token: 'keyword.flow', foreground: '569CD6', fontStyle: 'bold' }, // Blue (Sections)
                { token: 'string.math', foreground: 'DCDCAA' }, // Yellow (Math)
                { token: 'comment', foreground: '6A9955' }, // Green
                { token: 'delimiter.curly', foreground: 'F1D700' }, // Yellow brackets
                { token: 'delimiter.square', foreground: 'D16969' }, // Red brackets
                { token: 'string', foreground: 'CE9178' }, // Orange (Arguments)
                { token: 'string.attribute', foreground: '9CDCFE' }, // Light Blue (Optional Args)
            ],
            colors: {}
        });
    }

    // Register BibTeX
    if (!monaco.languages.getLanguages().some(l => l.id === 'bibtex')) {
        monaco.languages.register({ id: 'bibtex' });
        
        monaco.languages.setMonarchTokensProvider('bibtex', {
            displayName: 'BibTeX',
            tokenizer: {
                root: [
                    [/@\w+/, 'keyword'],
                    [/\w+(?=\s*=)/, 'attribute.name'], // Keys usually followed by =
                    [/[{}"]/, 'delimiter'],
                    [/([a-zA-Z0-9_\-]+)(,)/, ['string.key', 'delimiter']], // Citation keys
                    [/%.*$/, 'comment'],
                    [/[0-9]+/, 'number']
                ]
            }
        });
        
        // BibTeX Theme extensions could go here or share 'latex-dark'
    }
};
