"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import DOMPurify from "dompurify";

/**
 * Editor de texto enriquecido estilo Notion.
 * Atajos: "# " título, "## " subtítulo, "- " lista, "1. " numerada, "[] " casilla,
 * "> " cita, "---" separador, Ctrl+B / Ctrl+I / Ctrl+U. Ctrl+Enter guarda.
 */
export default function RichEditor({
  value,
  onChange,
  placeholder,
  autoFocus,
  onSubmit,
  big,
  id,
  bare,
  tools = true,
}: {
  value: string;
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
  big?: boolean;
  id?: string;
  /** Sin borde, como una hoja (estilo Keep) */
  bare?: boolean;
  /** Mostrar la barra de formato */
  tools?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: placeholder ?? "Escribe… usa # para títulos, - para listas, [] para casillas" }),
    ],
    content: value || "",
    editorProps: {
      attributes: { class: `rich-body${big ? " big" : ""}`, ...(id ? { id } : {}), "aria-label": placeholder ?? "Texto" },
      handleKeyDown: (_view, e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && onSubmit) {
          onSubmit();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => onChange(ed.isEmpty ? "" : ed.getHTML(), ed.getText({ blockSeparator: "\n" }).replace(/\n{3,}/g, "\n\n")),
  });

  /* Si el valor cambia desde fuera (p. ej. tras guardar se vacía), actualizar el editor */
  useEffect(() => {
    if (!editor) return;
    const cur = editor.isEmpty ? "" : editor.getHTML();
    if (value !== cur) editor.commands.setContent(value || "", { emitUpdate: false });
  }, [value, editor]);

  return (
    <div className={`rich${bare ? " bare" : ""}`}>
      {editor && tools && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const B = ({ on, label, title, run }: { on?: boolean; label: React.ReactNode; title: string; run: () => void }) => (
    <button type="button" className={`tb${on ? " on" : ""}`} title={title} aria-label={title} aria-pressed={!!on} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );
  const c = () => editor.chain().focus();
  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Dirección del enlace (déjalo vacío para quitarlo)", prev ?? "https://");
    if (url === null) return;
    if (!url.trim()) c().extendMarkRange("link").unsetLink().run();
    else c().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };
  return (
    <div className="toolbar" role="toolbar" aria-label="Formato">
      <B title="Título" label="T1" on={editor.isActive("heading", { level: 1 })} run={() => c().toggleHeading({ level: 1 }).run()} />
      <B title="Subtítulo" label="T2" on={editor.isActive("heading", { level: 2 })} run={() => c().toggleHeading({ level: 2 }).run()} />
      <span className="tsep" />
      <B title="Negrita (Ctrl+B)" label={<b>B</b>} on={editor.isActive("bold")} run={() => c().toggleBold().run()} />
      <B title="Cursiva (Ctrl+I)" label={<i>I</i>} on={editor.isActive("italic")} run={() => c().toggleItalic().run()} />
      <B title="Subrayado (Ctrl+U)" label={<u>U</u>} on={editor.isActive("underline")} run={() => c().toggleUnderline().run()} />
      <B title="Tachado" label={<s>S</s>} on={editor.isActive("strike")} run={() => c().toggleStrike().run()} />
      <span className="tsep" />
      <B title="Lista" label="•" on={editor.isActive("bulletList")} run={() => c().toggleBulletList().run()} />
      <B title="Lista numerada" label="1." on={editor.isActive("orderedList")} run={() => c().toggleOrderedList().run()} />
      <B title="Casillas" label="☐" on={editor.isActive("taskList")} run={() => c().toggleTaskList().run()} />
      <B title="Cita" label="❝" on={editor.isActive("blockquote")} run={() => c().toggleBlockquote().run()} />
      <B title="Enlace" label="🔗" on={editor.isActive("link")} run={setLink} />
      <B title="Separador" label="—" run={() => c().setHorizontalRule().run()} />
    </div>
  );
}

/** Muestra una nota: el texto enriquecido (limpio de código peligroso) o el texto simple */
export function RichView({ html, text, className }: { html?: string; text: string; className?: string }) {
  if (html) {
    const clean = DOMPurify.sanitize(html, { ADD_ATTR: ["data-type", "data-checked", "target"] });
    return <div className={`rich-body view ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: clean }} />;
  }
  return <p className={`plain ${className ?? ""}`}>{text}</p>;
}
