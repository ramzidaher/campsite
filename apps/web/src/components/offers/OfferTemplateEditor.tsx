'use client';

import LinkExtension from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, type ComponentType } from 'react';

const EditorContentCmp = EditorContent as ComponentType<{
  editor: Editor;
  className?: string;
}>;

export function OfferTemplateEditor({
  initialHtml,
  onHtmlChange,
  disabled = false,
}: {
  initialHtml: string;
  onHtmlChange: (html: string) => void;
  disabled?: boolean;
}) {
  const readyRef = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
      }),
      Placeholder.configure({
        placeholder:
          'Merge fields: {{candidate_name}}, {{job_title}}, {{salary}}, {{start_date}}, {{contract_type}}',
      }),
    ],
    content: initialHtml?.trim() ? initialHtml : '<p></p>',
    editable: !disabled,
    onCreate: () => {
      readyRef.current = true;
    },
    onUpdate: ({ editor: ed }) => {
      onHtmlChange(ed.getHTML());
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor || !readyRef.current) return;
    const cur = editor.getHTML();
    if (initialHtml !== cur) {
      editor.commands.setContent(initialHtml?.trim() ? initialHtml : '<p></p>', { emitUpdate: false });
    }
  }, [initialHtml, editor]);

  if (!editor) {
    return <div className="min-h-[240px] rounded-lg border border-[#e8e8e8] bg-[#fafafa]" aria-hidden />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#d8d8d8] bg-white">
      <div
        className="flex flex-wrap gap-1 border-b border-[#ececec] px-2 py-1.5 text-[12px]"
        aria-label="Formatting"
      >
        <ToolbarBtn label="Bold" onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarBtn label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarBtn label="Bullet" onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarBtn label="H2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      </div>
      <EditorContentCmp
        editor={editor}
        className="min-h-[260px] px-3 py-2 text-[14px] leading-relaxed text-[#121212] [&_.ProseMirror]:min-h-[240px] [&_.ProseMirror]:outline-none [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  );
}

function ToolbarBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded border border-[#e4e4e4] bg-white px-2 py-0.5 text-[#333] hover:bg-[#f5f5f5]"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
