import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { useUserNotes, type UserNote } from '@/hooks/useUserNotes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Bold, Italic, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Heading1, Heading2,
  Plus, Trash2, Save, Loader2, Download,
  FileText, FileDown, FileType,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function NotesPanel() {
  const { t } = useTranslation(['common']);
  const { notes, isLoading, createNote, updateNote, deleteNote } = useUserNotes();
  const [selectedNote, setSelectedNote] = useState<UserNote | null>(null);
  const [title, setTitle] = useState('');
  const [showList, setShowList] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: '<p></p>',
    onUpdate: ({ editor }) => {
      // Auto-save after 2s of inactivity
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        if (selectedNote) {
          updateNote.mutate({
            id: selectedNote.id,
            content_html: editor.getHTML(),
            content_text: editor.getText(),
          });
        }
      }, 2000);
    },
  });

  const handleSelectNote = useCallback((note: UserNote) => {
    // Save current before switching
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (selectedNote && editor) {
      updateNote.mutate({
        id: selectedNote.id,
        title,
        content_html: editor.getHTML(),
        content_text: editor.getText(),
      });
    }
    setSelectedNote(note);
    setTitle(note.title);
    editor?.commands.setContent(note.content_html || '<p></p>');
    setShowList(false);
  }, [selectedNote, editor, title, updateNote]);

  const handleCreate = () => {
    createNote.mutate(
      { title: '\u0546\u0578\u0580 \u0576\u0577\u0578\u0582\u0574', content_html: '<p></p>', content_text: '' },
      {
        onSuccess: (note) => {
          handleSelectNote(note);
        },
      }
    );
  };

  const handleSave = () => {
    if (!selectedNote || !editor) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    updateNote.mutate(
      {
        id: selectedNote.id,
        title,
        content_html: editor.getHTML(),
        content_text: editor.getText(),
      },
      { onSuccess: () => toast.success(t('common:save') + ' \u2713') }
    );
  };

  const handleDelete = () => {
    if (!selectedNote) return;
    deleteNote.mutate(selectedNote.id, {
      onSuccess: () => {
        setSelectedNote(null);
        setTitle('');
        editor?.commands.setContent('<p></p>');
        setShowList(true);
      },
    });
  };

  // Export functions
  const exportTxt = () => {
    if (!editor) return;
    const blob = new Blob([editor.getText()], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `${title || 'note'}.txt`);
  };

  const exportPdf = async () => {
    if (!editor) return;
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const text = editor.getText();
    const lines = doc.splitTextToSize(text, 180);
    doc.text(lines, 15, 15);
    doc.save(`${title || 'note'}.pdf`);
    toast.success('PDF exported');
  };

  const exportDocx = async () => {
    if (!editor) return;
    const { Document, Packer, Paragraph, TextRun } = await import('docx');
    const text = editor.getText();
    const paragraphs = text.split('\n').map(
      (line) => new Paragraph({ children: [new TextRun(line)] })
    );
    const doc = new Document({ sections: [{ children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `${title || 'note'}.docx`);
    toast.success('DOCX exported');
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Note list view
  if (showList || !selectedNote) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold text-sm">{'\u053C\u056B\u0576\u056B \u0576\u0577\u0578\u0582\u0574\u0576\u0565\u0580'}</h3>
          <Button size="sm" onClick={handleCreate} disabled={createNote.isPending}>
            {createNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            {'\u0546\u0578\u0580'}
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">{'\u0534\u0565\u057C \u0576\u0577\u0578\u0582\u0574\u0576\u0565\u0580 \u0579\u056F\u0561\u0576'}</p>
            </div>
          ) : (
            <div className="divide-y">
              {notes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => handleSelectNote(note)}
                  className="w-full text-left p-3 hover:bg-muted/50 transition-colors"
                >
                  <p className="font-medium text-sm truncate">{note.title}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {note.content_text?.slice(0, 80) || '\u0534\u0561\u057F\u0561\u0580\u056F'}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(note.updated_at).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    );
  }

  // Editor view
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { handleSave(); setShowList(true); }}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-7 text-sm font-medium flex-1 border-none shadow-none focus-visible:ring-0 px-1"
          placeholder={'\u054E\u0565\u0580\u0576\u0561\u0563\u056B\u0580'}
        />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave} disabled={updateNote.isPending}>
          {updateNote.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Download className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={exportPdf}>
              <FileDown className="h-4 w-4 mr-2" /> PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportDocx}>
              <FileType className="h-4 w-4 mr-2" /> DOCX
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportTxt}>
              <FileText className="h-4 w-4 mr-2" /> TXT
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={handleDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Format toolbar */}
      {editor && (
        <div className="flex flex-wrap gap-0.5 p-1.5 border-b bg-muted/30 flex-shrink-0">
          <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}>
            <Bold className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}>
            <Italic className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')}>
            <UnderlineIcon className="h-3.5 w-3.5" />
          </TBtn>
          <Separator orientation="vertical" className="h-6 mx-0.5" />
          <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })}>
            <Heading1 className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>
            <Heading2 className="h-3.5 w-3.5" />
          </TBtn>
          <Separator orientation="vertical" className="h-6 mx-0.5" />
          <TBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })}>
            <AlignLeft className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })}>
            <AlignCenter className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })}>
            <AlignRight className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })}>
            <AlignJustify className="h-3.5 w-3.5" />
          </TBtn>
          <Separator orientation="vertical" className="h-6 mx-0.5" />
          <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}>
            <List className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}>
            <ListOrdered className="h-3.5 w-3.5" />
          </TBtn>
        </div>
      )}

      {/* Editor content */}
      <div className="flex-1 overflow-auto">
        <EditorContent
          editor={editor}
          className="prose prose-sm dark:prose-invert max-w-none p-4 min-h-[300px] focus:outline-none"
        />
      </div>
    </div>
  );
}

function TBtn({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn("h-7 w-7 p-0", active && "bg-muted text-primary")}
    >
      {children}
    </Button>
  );
}
