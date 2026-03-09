import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getText } from '@/lib/i18n-utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  FileCode, 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  Check,
  Languages,
  RefreshCw,
  Eye,
  ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { PROMPT_FILE_CONTENTS } from './promptFilesContent';

// All prompt files in the project with Armenian names
const PROMPT_FILES = [
  {
    category: 'AI \u054E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576',
    files: [
      { path: 'supabase/functions/ai-analyze/prompts/defense.ts', name: '\u054A\u0561\u0577\u057F\u057A\u0561\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u057A\u0580\u0578\u0574\u057A\u057F' },
      { path: 'supabase/functions/ai-analyze/prompts/prosecution.ts', name: '\u0544\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B \u057A\u0580\u0578\u0574\u057A\u057F' },
      { path: 'supabase/functions/ai-analyze/prompts/judge.ts', name: '\u0534\u0561\u057F\u0561\u057E\u0578\u0580\u056B \u057A\u0580\u0578\u0574\u057A\u057F' },
      { path: 'supabase/functions/ai-analyze/prompts/aggregator.ts', name: '\u0531\u0563\u0580\u0565\u0563\u0561\u057F\u0578\u0580 \u057A\u0580\u0578\u0574\u057A\u057F' },
      { path: 'supabase/functions/ai-analyze/prompts/evidence.ts', name: '\u0531\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056B \u057A\u0580\u0578\u0574\u057A\u057F' },
      { path: 'supabase/functions/ai-analyze/prompts/procedural.ts', name: '\u0538\u0576\u0569\u0561\u0581\u0561\u056F\u0561\u0580\u0563\u0561\u0575\u056B\u0576 \u057A\u0580\u0578\u0574\u057A\u057F' },
      { path: 'supabase/functions/ai-analyze/prompts/qualification.ts', name: '\u0548\u0580\u0561\u056F\u0561\u057E\u0578\u0580\u0574\u0561\u0576 \u057A\u0580\u0578\u0574\u057A\u057F' },
      { path: 'supabase/functions/ai-analyze/prompts/rights.ts', name: '\u053B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u057A\u0580\u0578\u0574\u057A\u057F' },
      { path: 'supabase/functions/ai-analyze/prompts/substantive.ts', name: '\u0546\u0575\u0578\u0582\u0569\u0561\u056F\u0561\u0576 \u057A\u0580\u0578\u0574\u057A\u057F' },
      { path: 'supabase/functions/ai-analyze/system.ts', name: '\u0540\u0561\u0574\u0561\u056F\u0561\u0580\u0563\u0561\u0575\u056B\u0576 \u057A\u0580\u0578\u0574\u057A\u057F\u0565\u0580' },
      { path: 'supabase/functions/ai-analyze/legal-practice-kb.ts', name: 'KB \u0585\u0563\u057F\u0561\u0563\u0578\u0580\u056E\u0574\u0561\u0576 \u0570\u0580\u0561\u0570\u0561\u0576\u0563\u0576\u0565\u0580' },
    ]
  },
  {
    category: '\u0553\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u056B \u0563\u0565\u0576\u0565\u0580\u0561\u0581\u056B\u0561',
    files: [
      { path: 'supabase/functions/generate-document/prompts/general.ts', name: '\u0538\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u057A\u0580\u0578\u0574\u057A\u057F\u0565\u0580' },
      { path: 'supabase/functions/generate-document/prompts/civil.ts', name: '\u0554\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576 \u057A\u0580\u0578\u0574\u057A\u057F\u0565\u0580' },
      { path: 'supabase/functions/generate-document/prompts/criminal.ts', name: '\u0554\u0580\u0565\u0561\u056F\u0561\u0576 \u057A\u0580\u0578\u0574\u057A\u057F\u0565\u0580' },
      { path: 'supabase/functions/generate-document/prompts/administrative.ts', name: '\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576 \u057A\u0580\u0578\u0574\u057A\u057F\u0565\u0580' },
      { path: 'supabase/functions/generate-document/prompts/echr.ts', name: '\u0535\u054D\u054A\u053F \u057A\u0580\u0578\u0574\u057A\u057F\u0565\u0580' },
      { path: 'supabase/functions/generate-document/prompts/fallback.ts', name: '\u054A\u0561\u0570\u0578\u0582\u057D\u057F\u0561\u0575\u056B\u0576 \u057A\u0580\u0578\u0574\u057A\u057F\u0565\u0580' },
      { path: 'supabase/functions/generate-document/prompts/role-prompts.ts', name: '\u0534\u0565\u0580\u0565\u0580\u056B \u057A\u0580\u0578\u0574\u057A\u057F\u0565\u0580' },
      { path: 'supabase/functions/generate-document/system-prompts.ts', name: '\u0540\u0561\u0574\u0561\u056F\u0561\u0580\u0563\u0561\u0575\u056B\u0576 \u057A\u0580\u0578\u0574\u057A\u057F\u0565\u0580' },
    ]
  },
  {
    category: '\u0532\u0578\u0572\u0578\u0584\u0576\u0565\u0580\u056B \u0563\u0565\u0576\u0565\u0580\u0561\u0581\u056B\u0561',
    files: [
      { path: 'supabase/functions/generate-complaint/prompts/system-prompt.ts', name: '\u0540\u0561\u0574\u0561\u056F\u0561\u0580\u0563\u0561\u0575\u056B\u0576 \u057A\u0580\u0578\u0574\u057A\u057F' },
      { path: 'supabase/functions/generate-complaint/prompts/court-instructions.ts', name: '\u0534\u0561\u057F\u0561\u0580\u0561\u0576\u056B \u0570\u0580\u0561\u0570\u0561\u0576\u0563\u0576\u0565\u0580' },
      { path: 'supabase/functions/generate-complaint/prompts/language-instructions.ts', name: '\u053C\u0565\u0566\u057E\u056B \u0570\u0580\u0561\u0570\u0561\u0576\u0563\u0576\u0565\u0580' },
    ]
  },
  {
    category: '\u0531\u0575\u056C \u0586\u0578\u0582\u0576\u056F\u0581\u056B\u0561\u0576\u0565\u0580',
    files: [
      { path: 'supabase/functions/legal-chat/index.ts', name: '\u053B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u0579\u0561\u057F' },
      { path: 'supabase/functions/ocr-process/index.ts', name: 'OCR \u0574\u0577\u0561\u056F\u0578\u0582\u0574' },
      { path: 'supabase/functions/audio-transcribe/index.ts', name: '\u0531\u0578\u0582\u0564\u056B\u0578 \u057F\u0561\u057C\u0561\u0563\u0580\u0578\u0582\u0574' },
      { path: 'supabase/functions/extract-case-fields/index.ts', name: '\u0533\u0578\u0580\u056E\u056B \u0564\u0561\u0577\u057F\u0565\u0580\u056B \u0570\u0561\u0576\u0578\u0582\u0574' },
    ]
  },
  {
    category: '\u054D\u056F\u0566\u0562\u0576\u0561\u056F\u0561\u0576 \u057F\u057E\u0575\u0561\u056C\u0576\u0565\u0580',
    files: [
      { path: 'src/data/initialPrompts.ts', name: '\u054D\u056F\u0566\u0562\u0576\u0561\u056F\u0561\u0576 \u057A\u0580\u0578\u0574\u057A\u057F\u0565\u0580 (DB)' },
    ]
  }
];

// Convert Armenian characters to Unicode escape sequences
const armenianToUnicode = (text: string): string => {
  return text.replace(/[\u0531-\u058F]/g, (char) => {
    return '\\u' + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
  });
};

// Check if text contains Armenian characters
const hasArmenianChars = (text: string): boolean => {
  return /[\u0531-\u058F]/.test(text);
};

// Decode literal "\\uXXXX" sequences into real characters for easier reading/editing.
const decodeUnicodeEscapes = (text: string): string => {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => {
    const code = Number.parseInt(hex, 16);
    return Number.isFinite(code) ? String.fromCharCode(code) : _m;
  });
};

// Workflow steps for the user
const WORKFLOW_STEPS = [
  { step: 1, text: "\u0538\u0576\u057F\u0580\u0565\u0584 \u0586\u0561\u0575\u056C\u0568 \u0571\u0561\u056D\u056B \u0581\u0561\u0576\u056F\u056B\u0581" },
  { step: 2, text: "\u054A\u0561\u057F\u0573\u0565\u0576\u0565\u0584 \u057A\u0580\u0578\u0574\u057A\u057F\u056B \u0562\u0578\u057E\u0561\u0576\u0564\u0561\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u056F\u0565\u0576\u057F\u0580\u0578\u0576\u0561\u056F\u0561\u0576 \u057E\u0561\u0570\u0561\u0576\u0561\u056F\u0578\u0582\u0574" },
  { step: 3, text: "\u053D\u0574\u0562\u0561\u0563\u0580\u0565\u0584 \u0570\u0561\u0575\u0565\u0580\u0565\u0576 \u057F\u0565\u0584\u057D\u057F\u0568 \u0578\u0580\u0568 \u057A\u0565\u057F\u0584 \u0567 \u0583\u0578\u056D\u0561\u0580\u056F\u0565\u056C" },
  { step: 4, text: "\u054D\u0565\u0572\u0574\u0565\u0584 '\u0553\u0578\u056D\u0561\u0580\u056F\u0565\u056C \u0561\u0574\u0562\u0578\u0572\u057B\u0568' \u056F\u0578\u0573\u0561\u056F\u0568" },
  { step: 5, text: "\u054A\u0561\u057F\u0573\u0565\u0576\u0565\u0584 \u0561\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0568 \u0587 \u057F\u0565\u0572\u0561\u0564\u0580\u0565\u0584 \u0586\u0561\u0575\u056C\u0578\u0582\u0574" },
];

export const PromptFilesEditor = () => {
  const { i18n } = useTranslation();
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['\u0553\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u056B \u0563\u0565\u0576\u0565\u0580\u0561\u0581\u056B\u0561']);
  const [selectedFile, setSelectedFile] = useState<{path: string; name: string} | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewDirty, setPreviewDirty] = useState(false);
  const [previewMode, setPreviewMode] = useState<'text' | 'code'>('text');

  const selectedRawContent = selectedFile ? PROMPT_FILE_CONTENTS[selectedFile.path] : undefined;

  // Using centralized getText from @/lib/i18n-utils

  const handleConvert = useCallback(() => {
    const converted = armenianToUnicode(inputText);
    setOutputText(converted);
    
    if (hasArmenianChars(inputText)) {
      const count = (inputText.match(/[\u0531-\u058F]/g) || []).length;
      toast.success(`${count} \u057D\u056B\u0574\u057E\u0578\u056C \u0583\u0578\u056D\u0561\u0580\u056F\u057E\u0565\u0581`);
    } else {
      toast.info('\u0540\u0561\u0575\u0565\u0580\u0565\u0576 \u057D\u056B\u0574\u057E\u0578\u056C\u0576\u0565\u0580 \u0579\u0565\u0576 \u0563\u057F\u0576\u057E\u0565\u056C');
    }
  }, [inputText]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text');
    
    // Auto-convert on paste if Armenian chars detected
    if (hasArmenianChars(pastedText)) {
      e.preventDefault();
      const converted = armenianToUnicode(pastedText);
      setInputText(prev => prev + pastedText);
      setOutputText(converted);
      
      const count = (pastedText.match(/[\u0531-\u058F]/g) || []).length;
      toast.success(`\u0531\u057E\u057F\u0578-\u0583\u0578\u056D\u0561\u0580\u056F\u0578\u0582\u0574\u055D ${count} \u057D\u056B\u0574\u057E\u0578\u056C`);
    }
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('\u054A\u0561\u057F\u0573\u0565\u0576\u057E\u0565\u0581');
  }, [outputText]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const copyFilePath = (path: string) => {
    navigator.clipboard.writeText(path);
    toast.success("\u0556\u0561\u0575\u056C\u056B \u0573\u0561\u0576\u0561\u057A\u0561\u0580\u0570\u0568 \u057A\u0561\u057F\u0573\u0565\u0576\u057E\u0565\u0581");
  };

  const viewFile = (file: {path: string; name: string}) => {
    setSelectedFile(file);
    setPreviewDirty(false);

    const raw = PROMPT_FILE_CONTENTS[file.path];
    if (!raw) {
      const fallback = `// \u0549\u056F\u0561 \u0562\u0578\u057E\u0561\u0576\u0564\u0561\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576 (\u0561\u0575\u057D \u0586\u0561\u0575\u056C\u0568 \u0579\u056B \u0562\u0561\u057E\u0561\u0580\u0561\u0580\u0578\u0582\u0574 \u056F\u0561\u0574 \u0573\u0561\u0576\u0561\u057A\u0561\u0580\u0570\u0568 \u057D\u056D\u0561\u056C \u0567)\n// ${file.path}\n`;
      setPreviewContent(fallback);
      return;
    }

    setPreviewContent(previewMode === 'text' ? decodeUnicodeEscapes(raw) : raw);
  };

  // Reset to original file content (static import), always in TEXT mode (decoded)
  // NOTE: This resets to the original imported content, NOT a database update
  const reloadSelectedFile = useCallback(() => {
    if (!selectedFile) return;
    
    // Force re-read from the static import (this won't change unless the file is modified on disk and HMR triggers)
    const raw = PROMPT_FILE_CONTENTS[selectedFile.path];
    if (!raw) {
      toast.error("\u0556\u0561\u0575\u056C\u0568 \u0579\u056B \u0563\u057F\u0576\u057E\u0565\u056C");
      return;
    }
    
    // Always reload in decoded (text) mode for easier editing
    const decoded = decodeUnicodeEscapes(raw);
    setPreviewContent(decoded);
    setPreviewMode('text');
    setPreviewDirty(false);
    toast.info("\u054E\u0565\u0580\u0561\u056F\u0561\u0576\u0563\u0576\u057E\u0565\u0581 \u057D\u056F\u0566\u0562\u0576\u0561\u056F\u0561\u0576 \u0562\u0578\u057E\u0561\u0576\u0564\u0561\u056F\u0578\u0582\u0569\u0575\u0561\u0576\u0568");
  }, [selectedFile]);

  // Auto-refresh: if the underlying file changes (HMR) and the user hasn't edited manually.
  useEffect(() => {
    if (!selectedFile) return;
    if (previewDirty) return;
    if (!selectedRawContent) return;
    // Apply based on current mode
    const content = previewMode === 'text' ? decodeUnicodeEscapes(selectedRawContent) : selectedRawContent;
    setPreviewContent(content);
  }, [previewDirty, previewMode, selectedFile?.path, selectedRawContent]);

  // Toggle between decoded Armenian text and raw Unicode escapes
  const togglePreviewMode = useCallback(() => {
    if (!previewContent) return;
    
    setPreviewMode((prev) => {
      const next = prev === 'text' ? 'code' : 'text';
      
      // Convert content based on mode switch
      if (next === 'text') {
        // code -> text: decode \uXXXX to readable Armenian
        setPreviewContent(decodeUnicodeEscapes(previewContent));
      } else {
        // text -> code: encode Armenian to \uXXXX
        setPreviewContent(armenianToUnicode(previewContent));
      }
      
      // Don't mark as dirty when just switching view mode
      return next;
    });
  }, [previewContent]);

  const convertEntireContent = useCallback(() => {
    if (!previewContent) return;
    const converted = armenianToUnicode(previewContent);
    setPreviewContent(converted);
    
    if (hasArmenianChars(previewContent)) {
      const count = (previewContent.match(/[\u0531-\u058F]/g) || []).length;
      toast.success(`${count} \u057D\u056B\u0574\u057E\u0578\u056C \u0583\u0578\u056D\u0561\u0580\u056F\u057E\u0565\u0581`);
    } else {
      toast.info("\u0540\u0561\u0575\u0565\u0580\u0565\u0576 \u057D\u056B\u0574\u057E\u0578\u056C\u0576\u0565\u0580 \u0579\u0565\u0576 \u0563\u057F\u0576\u057E\u0565\u056C");
    }
  }, [previewContent]);

  const insertToOutput = useCallback(() => {
    if (outputText && selectedFile) {
      navigator.clipboard.writeText(outputText);
      toast.success(`\u054A\u0561\u057F\u0580\u0561\u057D\u057F \u0567 \u057F\u0565\u0572\u0561\u0564\u0580\u0565\u056C\u0578\u0582 \u0570\u0561\u0574\u0561\u0580\u055D ${selectedFile.name}`);
    }
  }, [outputText, selectedFile]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: File List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCode className="h-5 w-5" />
            {"\u054A\u0580\u0578\u0574\u057A\u057F\u0565\u0580\u056B \u0586\u0561\u0575\u056C\u0565\u0580"}
          </CardTitle>
          <CardDescription className="text-xs">
            {"\u054D\u0565\u0572\u0574\u0565\u0584 \u0586\u0561\u0575\u056C\u056B \u057E\u0580\u0561 \u0562\u0578\u057E\u0561\u0576\u0564\u0561\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0564\u056B\u057F\u0565\u056C\u0578\u0582 \u0570\u0561\u0574\u0561\u0580"}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[450px] pr-4">
            <div className="space-y-1">
              {PROMPT_FILES.map((group) => (
                <Collapsible 
                  key={group.category}
                  open={expandedCategories.includes(group.category)}
                  onOpenChange={() => toggleCategory(group.category)}
                >
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-between px-2 py-1.5 h-auto text-sm"
                    >
                      <div className="flex items-center gap-1.5">
                        {expandedCategories.includes(group.category) 
                          ? <ChevronDown className="h-3.5 w-3.5" />
                          : <ChevronRight className="h-3.5 w-3.5" />
                        }
                        <span className="font-medium text-xs">{group.category}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs h-5">{group.files.length}</Badge>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-4 space-y-0.5 mt-0.5">
                    {group.files.map((file) => (
                      <div 
                        key={file.path}
                        className={`flex items-center justify-between p-1.5 rounded-md hover:bg-muted/50 group cursor-pointer text-xs ${
                          selectedFile?.path === file.path ? 'bg-primary/10 border border-primary/20' : ''
                        }`}
                        onClick={() => viewFile(file)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-xs">{file.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate font-mono">
                            {file.path.split('/').pop()}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              viewFile(file);
                            }}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyFilePath(file.path);
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Middle: File Preview & Editor */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-5 w-5" />
            {selectedFile ? selectedFile.name : "\u053D\u0574\u0562\u0561\u0563\u0580\u056B\u0579"}
          </CardTitle>
          {selectedFile && (
            <CardDescription className="text-xs font-mono truncate">
              {selectedFile.path}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* Important notice */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-xs font-medium mb-1 text-amber-700 dark:text-amber-400">
              {"\u053F\u0561\u0580\u0587\u0578\u0580\u055D"} {"\u054D\u0561 \u0586\u0561\u0575\u056C\u0565\u0580\u056B \u0576\u0561\u056D\u0561\u0564\u056B\u057F\u0578\u0582\u0574\u0576 \u0567 (read-only preview)"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {"\u053D\u0574\u0562\u0561\u0563\u0580\u0565\u056C\u0578\u0582 \u0570\u0561\u0574\u0561\u0580 \u0583\u0578\u056D\u0561\u0580\u056F\u0565\u0584 \u057F\u0565\u0584\u057D\u057F\u0568, \u057A\u0561\u057F\u0573\u0565\u0576\u0565\u0584 \u0587 \u057F\u0565\u0572\u0561\u0564\u0580\u0565\u0584 \u056E\u0580\u0561\u0563\u0580\u056B \u056F\u0578\u0564\u0578\u0582\u0574\u0589"}
            </p>
          </div>
          
          {/* Workflow hint */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs font-medium mb-2">{"\u053B\u0576\u0579\u057A\u0565\u057D \u0585\u0563\u057F\u0561\u0563\u0578\u0580\u056E\u0565\u056C\u055D"}</p>
            <ol className="text-[10px] text-muted-foreground space-y-1 list-decimal list-inside">
              {WORKFLOW_STEPS.map((item) => (
                <li key={item.step}>{item.text}</li>
              ))}
            </ol>
          </div>

          <Textarea
            value={previewContent}
            onChange={(e) => {
              setPreviewDirty(true);
              setPreviewContent(e.target.value);
            }}
            className="min-h-[300px] font-mono text-xs bg-muted/30"
            placeholder={"\u054A\u0561\u057F\u0573\u0565\u0576\u0565\u0584 \u057A\u0580\u0578\u0574\u057A\u057F\u056B \u0562\u0578\u057E\u0561\u0576\u0564\u0561\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0561\u0575\u057D\u057F\u0565\u0572..."}
          />
          
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={togglePreviewMode}
              disabled={!previewContent}
              className="text-xs"
            >
              {previewMode === 'text'
                ? "\\uXXXX"
                : "\u0531\u0576\u0569\u0565\u0580\u0561\u056E\u0561\u0576\u0581"}
            </Button>
            {selectedFile && previewDirty && (
              <Button
                variant="outline"
                size="sm"
                onClick={reloadSelectedFile}
                className="text-xs border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                {"\u054E\u0565\u0580\u0561\u056F\u0561\u0576\u0563\u0576\u0565\u056C"}
              </Button>
            )}
            <Button 
              variant="default" 
              size="sm"
              onClick={convertEntireContent}
              disabled={!previewContent}
              className="text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              {"\u0553\u0578\u056D\u0561\u0580\u056F\u0565\u056C \u0561\u0574\u0562\u0578\u0572\u057B\u0568"}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(previewContent);
                toast.success("\u0532\u0578\u057E\u0561\u0576\u0564\u0561\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u057A\u0561\u057F\u0573\u0565\u0576\u057E\u0565\u0581");
              }}
              disabled={!previewContent}
              className="text-xs"
            >
              <Copy className="h-3 w-3 mr-1" />
              {"\u054A\u0561\u057F\u0573\u0565\u0576\u0565\u056C"}
            </Button>
            {selectedFile && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => copyFilePath(selectedFile.path)}
                className="text-xs"
              >
                <Copy className="h-3 w-3 mr-1" />
                {"\u0543\u0561\u0576\u0561\u057A\u0561\u0580\u0570"}
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setPreviewContent('')}
              disabled={!previewContent}
              className="text-xs"
            >
              {"\u0544\u0561\u0584\u0580\u0565\u056C"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Right: Unicode Converter */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Languages className="h-5 w-5" />
            {"Unicode \u0583\u0578\u056D\u0561\u0580\u056F\u056B\u0579"}
          </CardTitle>
          <CardDescription className="text-xs">
            {"\u0540\u0561\u0575\u0565\u0580\u0565\u0576 \u2192 \\uXXXX \u0561\u057E\u057F\u0578\u0574\u0561\u057F"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="space-y-1.5">
            <Label className="text-xs">
              {"\u0544\u0578\u0582\u057F\u0584\u0561\u0563\u0580\u0565\u0584 \u057F\u0565\u0584\u057D\u057F\u0568 (\u0570\u0561\u0575\u0565\u0580\u0565\u0576)"}
            </Label>
            <Textarea
              placeholder={"\u054F\u0565\u0572\u0561\u0564\u0580\u0565\u0584 \u0570\u0561\u0575\u0565\u0580\u0565\u0576 \u057F\u0565\u0584\u057D\u057F..."}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onPaste={handlePaste}
              className="min-h-[120px] font-mono text-xs"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleConvert} size="sm" className="flex-1 text-xs">
              <RefreshCw className="h-3 w-3 mr-1" />
              {"\u0553\u0578\u056D\u0561\u0580\u056F\u0565\u056C"}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => { setInputText(''); setOutputText(''); }}
              className="text-xs"
            >
              {"\u0544\u0561\u0584\u0580\u0565\u056C"}
            </Button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{"\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584 (Unicode)"}</Label>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleCopy}
                disabled={!outputText}
                className="h-6 text-xs"
              >
                {copied ? (
                  <><Check className="h-3 w-3 mr-1" /> {"\u054A\u0561\u057F\u0573\u0565\u0576\u057E\u0565\u0581"}</>
                ) : (
                  <><Copy className="h-3 w-3 mr-1" /> {"\u054A\u0561\u057F\u0573\u0565\u0576\u0565\u056C"}</>
                )}
              </Button>
            </div>
            <Textarea
              value={outputText}
              readOnly
              className="min-h-[120px] font-mono text-xs bg-muted"
              placeholder={"\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0568 \u056F\u0563\u0561 \u0561\u0575\u057D\u057F\u0565\u0572..."}
            />
          </div>

          {/* Insert button */}
          {outputText && selectedFile && (
            <Button 
              onClick={insertToOutput}
              className="w-full text-xs"
              size="sm"
            >
              <ArrowRight className="h-3 w-3 mr-1" />
              {"\u054F\u0565\u0572\u0561\u0564\u0580\u0565\u056C"} {selectedFile.name}{"-\u0578\u0582\u0574"}
            </Button>
          )}

          {/* Quick tip */}
          <div className="rounded-lg border p-2 bg-muted/30">
            <p className="text-[10px] text-muted-foreground">
              <strong>Tip:</strong> {"\u054F\u0565\u0584\u057D\u057F\u0568 \u057F\u0565\u0572\u0561\u0564\u0580\u0565\u056C\u056B\u057D \u0561\u057E\u057F\u0578\u0574\u0561\u057F \u056F\u0583\u0578\u056D\u0561\u0580\u056F\u057E\u056B\u0589"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
