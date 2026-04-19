'use client';

import type { Editor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

import { BroadcastCraftImage } from '@/components/broadcasts/broadcastCraftImageExtension';
import '@/components/broadcasts/broadcastCraftImage.css';
import { forwardRef, useEffect, useImperativeHandle, useRef, type ComponentType } from 'react';

import styles from './BroadcastBodyEditor.module.css';

/** TipTap’s JSX typings can disagree with React 19’s ReactNode until peers align; render is sound. */
const TiptapEditorContent = EditorContent as ComponentType<{
  editor: NonNullable<ReturnType<typeof useEditor>>;
  className?: string;
}>;
export type BroadcastBodyEditorHandle = {
  focus: () => void;
  bold: () => void;
  italic: () => void;
  bulletList: () => void;
  orderedList: () => void;
  undo: () => void;
  redo: () => void;
  /** Inserts a block image (Craft-style frame in the editor). */
  insertImage: (src: string, alt?: string) => void;
};

type Props = {
  markdown: string;
  onMarkdownChange: (md: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

function getMarkdown(editor: Editor | null): string {
  if (!editor) return '';
  const fn = (editor as unknown as { getMarkdown?: () => string }).getMarkdown;
  return typeof fn === 'function' ? fn() : '';
}

export const BroadcastBodyEditor = forwardRef<BroadcastBodyEditorHandle, Props>(
  function BroadcastBodyEditor(
    { markdown, onMarkdownChange, disabled = false, placeholder },
    ref,
  ) {
    const skipSyncRef = useRef(false);

    const editor = useEditor(
      {
        immediatelyRender: false,
        extensions: [
          StarterKit.configure({
            heading: { levels: [1, 2, 3] },
            link: {
              openOnClick: false,
              autolink: true,
              defaultProtocol: 'https',
            },
          }),
          Placeholder.configure({
            placeholder: placeholder ?? 'Write something…',
          }),
          BroadcastCraftImage.configure({
            inline: false,
            allowBase64: false,
          }),
          Markdown.configure({
            markedOptions: { gfm: true },
          }),
        ],
        content: markdown,
        contentType: 'markdown',
        editable: !disabled,
        editorProps: {
          attributes: {
            class: `text-[17px] leading-[1.65] text-[#37352f]`,
            spellcheck: 'true',
            style: 'caret-color: #37352f',
          },
        },
        onUpdate: ({ editor: ed }) => {
          skipSyncRef.current = true;
          onMarkdownChange(getMarkdown(ed));
        },
      },
      [],
    );

    useEffect(() => {
      if (!editor) return;
      editor.setEditable(!disabled);
    }, [disabled, editor]);

    useEffect(() => {
      if (!editor) return;
      if (skipSyncRef.current) {
        skipSyncRef.current = false;
        return;
      }
      const current = getMarkdown(editor);
      if (current === markdown) return;
      editor.commands.setContent(markdown || '', { contentType: 'markdown' });
    }, [markdown, editor]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          editor?.chain().focus().run();
        },
        bold: () => {
          editor?.chain().focus().toggleBold().run();
        },
        italic: () => {
          editor?.chain().focus().toggleItalic().run();
        },
        bulletList: () => {
          editor?.chain().focus().toggleBulletList().run();
        },
        orderedList: () => {
          editor?.chain().focus().toggleOrderedList().run();
        },
        undo: () => {
          editor?.chain().focus().undo().run();
        },
        redo: () => {
          editor?.chain().focus().redo().run();
        },
        insertImage: (src: string, alt?: string) => {
          if (!src.trim()) return;
          editor?.chain().focus().setImage({ src: src.trim(), alt: alt?.trim() ?? '' }).run();
        },
      }),
      [editor],
    );

    if (!editor) {
      return (
        <div
          className="min-h-[min(55vh,360px)] w-full animate-pulse rounded-b-xl bg-[#f7f5f2]"
          aria-hidden
        />
      );
    }

    return (
      <div className={`${styles.root} relative`}>
        <TiptapEditorContent editor={editor} className="px-5 py-5 sm:px-6 sm:py-6" />
      </div>
    );
  },
);

BroadcastBodyEditor.displayName = 'BroadcastBodyEditor';
