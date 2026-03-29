
import React, { useState } from 'react';
import { Icon, cn, ConfirmDialog } from '@citadel-app/ui';
import * as ContextMenu from '@radix-ui/react-context-menu';

interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileNode[];
    isBinary?: boolean;
}

interface FileTreeProps {
    files: { name: string; content: string; isBinary?: boolean }[];
    activeFile: string | null;
    onSelect: (path: string) => void;
    onRename: (oldPath: string, newPath: string) => void;
    onDelete: (path: string) => void;
}

const buildTree = (files: { name: string; isBinary?: boolean }[]): FileNode[] => {
    const root: FileNode[] = [];

    files.forEach(file => {
        const parts = file.name.split('/');
        let currentLevel = root;

        parts.forEach((part, index) => {
            const isFile = index === parts.length - 1;
            const path = parts.slice(0, index + 1).join('/');

            let existing = currentLevel.find(n => n.name === part);

            if (!existing) {
                existing = {
                    name: part,
                    path,
                    type: isFile ? 'file' : 'folder',
                    children: isFile ? undefined : [],
                    isBinary: isFile ? file.isBinary : undefined
                };
                currentLevel.push(existing);
            }

            if (!isFile && existing.children) {
                currentLevel = existing.children;
            }
        });
    });

    // Sort: Folders first, then files, alphabetical
    const sortNodes = (nodes: FileNode[]) => {
        nodes.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'folder' ? -1 : 1;
        });
        nodes.forEach(n => {
            if (n.children) sortNodes(n.children);
        });
    };

    sortNodes(root);
    return root;
};

const FileTreeNode: React.FC<{
    node: FileNode;
    depth: number;
    activeFile: string | null;
    onSelect: (path: string) => void;
    onRename: (oldPath: string, newPath: string) => void;
    onDelete: (path: string) => void;
}> = ({ node, depth, activeFile, onSelect, onRename, onDelete }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isRenaming, setIsRenaming] = useState(false);
    const [newName, setNewName] = useState(node.name);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const handleRename = () => {
        const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
        const newPath = parentPath ? `${parentPath}/${newName}` : newName;
        if (newPath !== node.path) {
            onRename(node.path, newPath);
        }
        setIsRenaming(false);
    };

    return (
        <div style={{ paddingLeft: `${depth * 12}px` }}>
            <ContextMenu.Root>
                <ContextMenu.Trigger>
                    <div
                        className={cn(
                            "flex items-center gap-1.5 py-1 px-2 cursor-pointer text-sm select-none transition-colors rounded-sm mx-1",
                            activeFile === node.path && node.type === 'file' ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => {
                            if (node.type === 'folder') {
                                setIsExpanded(!isExpanded);
                            } else {
                                onSelect(node.path);
                            }
                        }}
                    >
                        <span className="opacity-70 shrink-0">
                            {node.type === 'folder' ? (
                                <Icon name={isExpanded ? "ChevronDown" : "ChevronRight"} size={14} />
                            ) : (
                                <Icon name={node.isBinary ? "Image" : "FileCode"} size={14} /> // Todo: better icons
                            )}
                        </span>

                        {isRenaming ? (
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onBlur={handleRename}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRename();
                                    if (e.key === 'Escape') setIsRenaming(false);
                                }}
                                autoFocus
                                className="bg-background border border-input rounded px-1 h-6 w-full text-xs"
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <span className="truncate">{node.name}</span>
                        )}
                    </div>
                </ContextMenu.Trigger>

                <ContextMenu.Portal>
                    <ContextMenu.Content className="min-w-[160px] bg-popover text-popover-foreground rounded-md border p-1 shadow-md animate-in fade-in-80 z-50">
                        <ContextMenu.Item
                            className="flex items-center gap-2 px-2 py-1.5 text-xs outline-none cursor-default hover:bg-accent hover:text-accent-foreground rounded-sm"
                            onSelect={() => setIsRenaming(true)}
                        >
                            <Icon name="Pencil" size={12} />
                            Rename
                        </ContextMenu.Item>
                        <ContextMenu.Item
                            className="flex items-center gap-2 px-2 py-1.5 text-xs outline-none cursor-default hover:bg-destructive hover:text-destructive-foreground rounded-sm text-destructive"
                            onSelect={() => setShowDeleteConfirm(true)}
                        >
                            <Icon name="Trash" size={12} />
                            Delete
                        </ContextMenu.Item>
                    </ContextMenu.Content>
                </ContextMenu.Portal>
            </ContextMenu.Root>

            {node.type === 'folder' && isExpanded && node.children && (
                <div>
                    {node.children.map(child => (
                        <FileTreeNode
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            activeFile={activeFile}
                            onSelect={onSelect}
                            onRename={onRename}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
                title="Delete File"
                description={`Are you sure you want to delete ${node.name}?`}
                confirmLabel="Delete"
                onConfirm={() => {
                    onDelete(node.path);
                    setShowDeleteConfirm(false);
                }}
                variant="destructive"
            />
        </div>
    );
};

export const FileTree: React.FC<FileTreeProps> = ({ files, activeFile, onSelect, onRename, onDelete }) => {
    const tree = buildTree(files);

    return (
        <div className="flex flex-col gap-0.5">
            {tree.map(node => (
                <FileTreeNode
                    key={node.path}
                    node={node}
                    depth={0}
                    activeFile={activeFile}
                    onSelect={onSelect}
                    onRename={onRename}
                    onDelete={onDelete}
                />
            ))}
        </div>
    );
};
