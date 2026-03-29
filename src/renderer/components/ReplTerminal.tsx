import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useCoreServices } from '@citadel-app/ui';
import 'xterm/css/xterm.css';

interface ReplTerminalProps {
    sessionId: string | null;
    onInput: (data: string) => void;
}

export const ReplTerminal = ({ sessionId, onInput }: ReplTerminalProps) => {
    const { hostApi: __hostApi } = useCoreServices();
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const onInputRef = useRef(onInput);
    const sessionIdRef = useRef(sessionId);

    // State for smart local echo
    const lineBuffer = useRef('');
    const cursorPos = useRef(0);
    const history = useRef<string[]>([]);
    const historyPos = useRef(-1);

    useEffect(() => {
        onInputRef.current = onInput;
    }, [onInput]);

    useEffect(() => {
        sessionIdRef.current = sessionId;
    }, [sessionId]);

    useEffect(() => {
        if (!terminalRef.current) return;
        if (!sessionId) {
            console.log('[ReplTerminal] No active session, skipping initialization');
            return;
        }

        const term = new Terminal({
            cursorBlink: true,
            cursorStyle: 'block',
            fontSize: 14,
            fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
            theme: {
                background: 'rgba(0,0,0,0.5)',
                foreground: '#ffffff',
                cursor: '#ff3e3e',
                selectionBackground: 'rgba(255, 255, 255, 0.1)'
            },
            allowProposedApi: true,
            convertEol: true,
            rows: 24,
            cols: 80
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);

        const safeFit = () => {
            requestAnimationFrame(() => {
                try {
                    if (terminalRef.current?.offsetWidth && terminalRef.current?.offsetHeight) {
                        fitAddon.fit();
                    }
                } catch (e) { }
            });
        };

        setTimeout(safeFit, 50);
        setTimeout(safeFit, 500);
        term.focus();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // Smart Local Echo Handler
        term.onData((data) => {
            if (!sessionIdRef.current) return;

            // Handle special keys
            switch (data) {
                case '\r': // Enter
                    term.write('\r\n');
                    onInputRef.current(lineBuffer.current + '\n');
                    if (lineBuffer.current.trim()) {
                        history.current.push(lineBuffer.current);
                    }
                    lineBuffer.current = '';
                    cursorPos.current = 0;
                    historyPos.current = -1;
                    break;

                case '\x7f': // Backspace
                    if (cursorPos.current > 0) {
                        const left = lineBuffer.current.slice(0, cursorPos.current - 1);
                        const right = lineBuffer.current.slice(cursorPos.current);
                        lineBuffer.current = left + right;
                        cursorPos.current--;

                        // Overwrite and rewrite line remainder
                        term.write('\b');
                        term.write(right + ' '); // Overwrite last char
                        for (let i = 0; i < right.length + 1; i++) term.write('\b');
                    }
                    break;

                case '\x1b[A': // Up Arrow
                    if (history.current.length > 0) {
                        if (historyPos.current === -1) historyPos.current = history.current.length - 1;
                        else if (historyPos.current > 0) historyPos.current--;

                        const cmd = history.current[historyPos.current];
                        // Clear current line
                        for (let i = 0; i < cursorPos.current; i++) term.write('\b \b');
                        for (let i = 0; i < lineBuffer.current.length - cursorPos.current; i++) term.write(' ');
                        for (let i = 0; i < lineBuffer.current.length - cursorPos.current; i++) term.write('\b');

                        term.write(cmd);
                        lineBuffer.current = cmd;
                        cursorPos.current = cmd.length;
                    }
                    break;

                case '\x1b[B': // Down Arrow
                    if (historyPos.current !== -1) {
                        historyPos.current++;
                        let cmd = '';
                        if (historyPos.current >= history.current.length) {
                            historyPos.current = -1;
                        } else {
                            cmd = history.current[historyPos.current];
                        }

                        // Clear current line
                        for (let i = 0; i < cursorPos.current; i++) term.write('\b \b');
                        term.write(cmd);
                        lineBuffer.current = cmd;
                        cursorPos.current = cmd.length;
                    }
                    break;

                case '\x1b[C': // Right Arrow
                    if (cursorPos.current < lineBuffer.current.length) {
                        cursorPos.current++;
                        term.write(data);
                    }
                    break;

                case '\x1b[D': // Left Arrow
                    if (cursorPos.current > 0) {
                        cursorPos.current--;
                        term.write(data);
                    }
                    break;

                default:
                    // Only printable characters (ignoring other escape sequences for now)
                    if (data.length === 1 && data.charCodeAt(0) >= 32) {
                        const left = lineBuffer.current.slice(0, cursorPos.current);
                        const right = lineBuffer.current.slice(cursorPos.current);
                        lineBuffer.current = left + data + right;
                        cursorPos.current++;

                        term.write(data + right);
                        for (let i = 0; i < right.length; i++) term.write('\b');
                    }
            }
        });

        window.addEventListener('resize', safeFit);

        // Listen for output from main process
        const unsubscribe = __hostApi.on('module:repl:output', (payload: { sessionId: string, data: string }) => {
            if (payload.sessionId === sessionIdRef.current) {
                term.write(payload.data);
            }
        });

        const unsubscribeClosed = __hostApi.on('module:repl:closed', (payload: { sessionId: string, code: number }) => {
            if (payload.sessionId === sessionIdRef.current) {
                term.write('\r\n\x1b[31m[Session Closed]\x1b[0m\r\n');
            }
        });

        return () => {
            window.removeEventListener('resize', safeFit);
            unsubscribe();
            unsubscribeClosed();
            term.dispose();
            xtermRef.current = null;
        };
    }, [sessionId]);

    const handleContainerClick = () => {
        if (xtermRef.current) xtermRef.current.focus();
    };

    return (
        <div
            className="w-full h-full bg-black/40 backdrop-blur-md rounded-3xl p-6 overflow-hidden border border-white/5 shadow-2xl cursor-text relative"
            onClick={handleContainerClick}
        >
            <div ref={terminalRef} className="w-full h-full min-h-[300px]" />
        </div>
    );
};
