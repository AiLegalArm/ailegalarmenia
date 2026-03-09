import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Bold, 
  Italic, 
  Underline as UnderlineIcon, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify,
  List,
  ListOrdered,
  Undo,
  Redo,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';

interface DocumentEditorProps {
  content: string;
  onChange: (content: string) => void;
  editable?: boolean;
}

export function DocumentEditor({ content, onChange, editable = true }: DocumentEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: convertToHtml(content),
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getText());
    },
  });

  useEffect(() => {
    if (editor && content) {
      const currentContent = editor.getText();
      if (currentContent !== content) {
        editor.commands.setContent(convertToHtml(content));
      }
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-white dark:bg-gray-900">
      {editable && (
        <div className="border-b bg-muted/50 p-2 flex flex-wrap gap-1">
          {/* Text formatting */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title={'\u0416\u0438\u0440\u043D\u044B\u0439'}
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title={'\u041A\u0443\u0440\u0441\u0438\u0432'}
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')}
            title={'\u041F\u043E\u0434\u0447\u0451\u0440\u043A\u043D\u0443\u0442\u044B\u0439'}
          >
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>

          <Separator orientation="vertical" className="h-8 mx-1" />

          {/* Headings */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            title={'\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A 1'}
          >
            <Heading1 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            title={'\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A 2'}
          >
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            title={'\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A 3'}
          >
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setParagraph().run()}
            active={editor.isActive('paragraph')}
            title={'\u041F\u0430\u0440\u0430\u0433\u0440\u0430\u0444'}
          >
            <Pilcrow className="h-4 w-4" />
          </ToolbarButton>

          <Separator orientation="vertical" className="h-8 mx-1" />

          {/* Alignment */}
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            active={editor.isActive({ textAlign: 'left' })}
            title={'\u041F\u043E \u043B\u0435\u0432\u043E\u043C\u0443 \u043A\u0440\u0430\u044E'}
          >
            <AlignLeft className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            active={editor.isActive({ textAlign: 'center' })}
            title={'\u041F\u043E \u0446\u0435\u043D\u0442\u0440\u0443'}
          >
            <AlignCenter className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            active={editor.isActive({ textAlign: 'right' })}
            title={'\u041F\u043E \u043F\u0440\u0430\u0432\u043E\u043C\u0443 \u043A\u0440\u0430\u044E'}
          >
            <AlignRight className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            active={editor.isActive({ textAlign: 'justify' })}
            title={'\u041F\u043E \u0448\u0438\u0440\u0438\u043D\u0435'}
          >
            <AlignJustify className="h-4 w-4" />
          </ToolbarButton>

          <Separator orientation="vertical" className="h-8 mx-1" />

          {/* Lists */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title={'\u041C\u0430\u0440\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0441\u043F\u0438\u0441\u043E\u043A'}
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title={'\u041D\u0443\u043C\u0435\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0441\u043F\u0438\u0441\u043E\u043A'}
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>

          <Separator orientation="vertical" className="h-8 mx-1" />

          {/* Undo/Redo */}
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title={'\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C'}
          >
            <Undo className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title={'\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C'}
          >
            <Redo className="h-4 w-4" />
          </ToolbarButton>
        </div>
      )}

      <EditorContent 
        editor={editor} 
        className="prose prose-sm dark:prose-invert max-w-none p-6 min-h-[400px] focus:outline-none"
      />
    </div>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "h-8 w-8 p-0",
        active && "bg-muted text-primary"
      )}
    >
      {children}
    </Button>
  );
}

// Convert plain text to HTML for the editor
function convertToHtml(text: string): string {
  if (!text) return '<p></p>';
  
  const lines = text.split('\n');
  let html = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check for headers (all caps lines or specific patterns)
    if (/^[А-ЯA-Z\s]{5,}$/.test(trimmed) || 
        /^(ЗАЯВЛЕНИЕ|ЖАЛОБА|ХОДАТАЙСТВО|ИСКОВОЕ|ОБРАЩЕНИЕ|ТРЕБОВАНИЕ|\u0534\u056B\u0574\u0578\u0582\u0574|\u0532\u0578\u0572\u0578\u0584)/i.test(trimmed)) {
      html += `<h1 style="text-align: center">${trimmed}</h1>`;
    }
    // Section headers (numbered)
    else if (/^\d+\./.test(trimmed) || /^(I\.|II\.|III\.|IV\.|V\.)/.test(trimmed)) {
      html += `<h3>${line}</h3>`;
    }
    // Empty lines
    else if (trimmed === '') {
      html += '<p><br></p>';
    }
    // Regular paragraphs
    else {
      html += `<p style="text-align: justify">${line}</p>`;
    }
  }
  
  return html || '<p></p>';
}
