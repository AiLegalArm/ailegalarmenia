import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Copy,
  Eye,
  History,
  Download,
  Upload,
  Loader2,
  FileCode,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Database,
} from 'lucide-react';
import { format } from 'date-fns';
import { PromptFilesEditor } from './PromptFilesEditor';

// AI Functions list
const AI_FUNCTIONS = [
  { id: 'ai-analyze', name: 'AI Analyze', nameHy: 'AI \u054E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576' },
  { id: 'generate-document', name: 'Generate Document', nameHy: '\u0553\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569\u056B \u057D\u057F\u0565\u0572\u056E\u0578\u0582\u0574' },
  { id: 'generate-complaint', name: 'Generate Complaint', nameHy: '\u0532\u0578\u0572\u0578\u0584\u056B \u057D\u057F\u0565\u0572\u056E\u0578\u0582\u0574' },
  { id: 'legal-chat', name: 'Legal Chat', nameHy: '\u053B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u0579\u0561\u057F' },
  { id: 'ocr-process', name: 'OCR Process', nameHy: 'OCR \u0544\u0577\u0561\u056F\u0578\u0582\u0574' },
  { id: 'audio-transcribe', name: 'Audio Transcribe', nameHy: '\u0531\u0578\u0582\u0564\u056B\u0578 \u057F\u0580\u0561\u0576\u057D\u056F\u0580\u056B\u057A\u0581\u056B\u0561' },
  { id: 'extract-case-fields', name: 'Extract Case Fields', nameHy: '\u0534\u0561\u0577\u057F\u0565\u0580\u056B \u0570\u0561\u0576\u0578\u0582\u0574' },
  { id: 'legal-practice-import', name: 'Legal Practice Import', nameHy: '\u054A\u0580\u0561\u056F\u057F\u056B\u056F\u0561\u0575\u056B \u0576\u0565\u0580\u0574\u0578\u0582\u056E\u0578\u0582\u0574' },
];

interface Prompt {
  id: string;
  function_name: string;
  module_type: string;
  name_hy: string;
  name_ru: string;
  name_en: string | null;
  description: string | null;
  prompt_text: string;
  is_active: boolean;
  current_version: number;
  created_at: string;
  updated_at: string;
}

interface PromptVersion {
  id: string;
  prompt_id: string;
  version_number: number;
  prompt_text: string;
  change_reason: string | null;
  changed_at: string;
}

const PAGE_SIZE = 15;

export const PromptManager = () => {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFunction, setFilterFunction] = useState<string>('all');
  const [page, setPage] = useState(1);
  
  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [versionsDialogOpen, setVersionsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    function_name: '',
    module_type: '',
    name_hy: '',
    name_ru: '',
    name_en: '',
    description: '',
    prompt_text: '',
  });
  const [saving, setSaving] = useState(false);

  // Fetch prompts
  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_prompts')
        .select('*')
        .order('function_name')
        .order('module_type');
      
      if (error) throw error;
      setPrompts((data || []) as Prompt[]);
    } catch (error) {
      console.error('Error fetching prompts:', error);
      toast.error('Ошибка загрузки промптов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

  // Filtered and paginated prompts
  const filteredPrompts = useMemo(() => {
    let result = prompts;
    
    if (filterFunction !== 'all') {
      result = result.filter(p => p.function_name === filterFunction);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name_hy.toLowerCase().includes(q) ||
        p.name_ru.toLowerCase().includes(q) ||
        p.module_type.toLowerCase().includes(q) ||
        p.prompt_text.toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [prompts, filterFunction, searchQuery]);

  const totalPages = Math.ceil(filteredPrompts.length / PAGE_SIZE);
  const paginatedPrompts = filteredPrompts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Handle form submission
  const handleSave = async () => {
    if (!formData.function_name || !formData.module_type || !formData.name_hy || !formData.prompt_text) {
      toast.error('Заполните обязательные поля');
      return;
    }

    setSaving(true);
    try {
      if (selectedPrompt) {
        // Update existing
        const { error } = await supabase
          .from('ai_prompts')
          .update({
            function_name: formData.function_name,
            module_type: formData.module_type,
            name_hy: formData.name_hy,
            name_ru: formData.name_ru,
            name_en: formData.name_en || null,
            description: formData.description || null,
            prompt_text: formData.prompt_text,
          })
          .eq('id', selectedPrompt.id);
        
        if (error) throw error;
        toast.success('Промпт обновлён');
      } else {
        // Create new
        const { error } = await supabase
          .from('ai_prompts')
          .insert({
            function_name: formData.function_name,
            module_type: formData.module_type,
            name_hy: formData.name_hy,
            name_ru: formData.name_ru,
            name_en: formData.name_en || null,
            description: formData.description || null,
            prompt_text: formData.prompt_text,
          });
        
        if (error) throw error;
        toast.success('Промпт создан');
      }
      
      setEditDialogOpen(false);
      fetchPrompts();
    } catch (error: unknown) {
      console.error('Error saving prompt:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Ошибка: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedPrompt) return;
    
    try {
      const { error } = await supabase
        .from('ai_prompts')
        .delete()
        .eq('id', selectedPrompt.id);
      
      if (error) throw error;
      toast.success('Промпт удалён');
      setDeleteDialogOpen(false);
      fetchPrompts();
    } catch (error) {
      console.error('Error deleting prompt:', error);
      toast.error('Ошибка удаления промпта');
    }
  };

  // Handle duplicate
  const handleDuplicate = async (prompt: Prompt) => {
    try {
      const { error } = await supabase
        .from('ai_prompts')
        .insert({
          function_name: prompt.function_name,
          module_type: `${prompt.module_type}_copy`,
          name_hy: `${prompt.name_hy} (\u057A\u0561\u057F\u0573\u0565\u0576)`,
          name_ru: `${prompt.name_ru} (копия)`,
          name_en: prompt.name_en ? `${prompt.name_en} (copy)` : null,
          description: prompt.description,
          prompt_text: prompt.prompt_text,
        });
      
      if (error) throw error;
      toast.success('Промпт дублирован');
      fetchPrompts();
    } catch (error) {
      console.error('Error duplicating prompt:', error);
      toast.error('Ошибка дублирования промпта');
    }
  };

  // Fetch versions
  const fetchVersions = async (promptId: string) => {
    setVersionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_prompt_versions')
        .select('*')
        .eq('prompt_id', promptId)
        .order('version_number', { ascending: false });
      
      if (error) throw error;
      setVersions((data || []) as PromptVersion[]);
    } catch (error) {
      console.error('Error fetching versions:', error);
      toast.error('Ошибка загрузки версий');
    } finally {
      setVersionsLoading(false);
    }
  };

  // Export prompts to JSON
  const handleExport = () => {
    const exportData = prompts.map(p => ({
      function_name: p.function_name,
      module_type: p.module_type,
      name_hy: p.name_hy,
      name_ru: p.name_ru,
      name_en: p.name_en,
      description: p.description,
      prompt_text: p.prompt_text,
    }));
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_prompts_${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Экспорт завершён');
  };

  const stripTsComments = (input: string): string => {
    let out = '';
    let inString = false;
    let stringChar: '"' | "'" | '' = '';
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      const next = i + 1 < input.length ? input[i + 1] : '';
      const prev = i > 0 ? input[i - 1] : '';

      if (inLineComment) {
        if (char === '\n') {
          inLineComment = false;
          out += char;
        }
        continue;
      }

      if (inBlockComment) {
        if (char === '*' && next === '/') {
          inBlockComment = false;
          i++; // consume '/'
        }
        continue;
      }

      if (inTemplate) {
        out += char;
        if (char === '`' && prev !== '\\') inTemplate = false;
        continue;
      }

      if (inString) {
        out += char;
        if (char === stringChar && prev !== '\\') {
          inString = false;
          stringChar = '';
        }
        continue;
      }

      // Not in string/template/comment
      if (char === '/' && next === '/') {
        inLineComment = true;
        i++; // consume second '/'
        continue;
      }
      if (char === '/' && next === '*') {
        inBlockComment = true;
        i++; // consume '*'
        continue;
      }
      if (char === '`') {
        inTemplate = true;
        out += char;
        continue;
      }
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char as '"' | "'";
        out += char;
        continue;
      }

      out += char;
    }

    return out;
  };

  // Parse TypeScript file to extract an exported array of prompt objects
  const parseTsFile = (content: string): any[] | null => {
    try {
      const cleaned = stripTsComments(content);

      // 1) export default [ ... ]
      const exportDefaultMatch = cleaned.match(/export\s+default\s*\[/m);
      // 2) export const NAME: Type[] = [ ... ]  (also supports non-exported const)
      const exportConstMatch = cleaned.match(/(?:export\s+)?(?:const|let|var)\s+\w+[\s\S]*?=\s*\[/m);

      const match = exportDefaultMatch ?? exportConstMatch;
      if (!match) return null;

      const startIndex = cleaned.indexOf(match[0]) + match[0].length;

      // Find matching closing bracket for the array
      let depth = 1;
      let endIndex = startIndex;
      let inString = false;
      let stringChar = '';
      let inTemplateLiteral = false;

      for (let i = startIndex; i < cleaned.length && depth > 0; i++) {
        const char = cleaned[i];
        const prevChar = i > 0 ? cleaned[i - 1] : '';

        if (inTemplateLiteral) {
          if (char === '`' && prevChar !== '\\') inTemplateLiteral = false;
          continue;
        }

        if (inString) {
          if (char === stringChar && prevChar !== '\\') inString = false;
          continue;
        }

        if (char === '`') {
          inTemplateLiteral = true;
          continue;
        }

        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
          continue;
        }

        if (char === '[') depth++;
        if (char === ']') depth--;
        endIndex = i;
      }

      const arrayContent = cleaned.substring(startIndex, endIndex);
      return parseArrayContent(arrayContent);
    } catch (error) {
      console.error('parseTsFile error:', error);
      return null;
    }
  };

  // Parse array content by extracting objects
  const parseArrayContent = (content: string): any[] => {
    const results: any[] = [];
    let depth = 0;
    let objectStart = -1;
    let inString = false;
    let stringChar = '';
    let inTemplateLiteral = false;
    
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const prevChar = i > 0 ? content[i - 1] : '';
      
      if (inTemplateLiteral) {
        if (char === '`' && prevChar !== '\\') {
          inTemplateLiteral = false;
        }
        continue;
      }
      
      if (inString) {
        if (char === stringChar && prevChar !== '\\') {
          inString = false;
        }
        continue;
      }
      
      if (char === '`') {
        inTemplateLiteral = true;
        continue;
      }
      
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        continue;
      }
      
      if (char === '{') {
        if (depth === 0) objectStart = i;
        depth++;
      }
      
      if (char === '}') {
        depth--;
        if (depth === 0 && objectStart >= 0) {
          const objectStr = content.substring(objectStart, i + 1);
          const parsed = parseObjectString(objectStr);
          if (parsed) results.push(parsed);
          objectStart = -1;
        }
      }
    }
    
    return results;
  };

  // Parse a single object string
  const parseObjectString = (objStr: string): any | null => {
    try {
      // Extract key-value pairs manually
      const result: any = {};
      
      // Match key: value patterns
      const keyValueRegex = /(\w+)\s*:\s*(?:`([\s\S]*?)`|"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^,}\n]+))/g;
      
      let match;
      while ((match = keyValueRegex.exec(objStr)) !== null) {
        const key = match[1];
        // Template literal, double quote, single quote, or unquoted value
        let value = match[2] ?? match[3] ?? match[4] ?? match[5]?.trim();
        
        if (value === 'null') value = null;
        else if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (value !== null && value !== undefined && !isNaN(Number(value)) && value !== '') {
          value = Number(value);
        }
        
        result[key] = value;
      }
      
      return Object.keys(result).length > 0 ? result : null;
    } catch (error) {
      console.error('parseObjectString error:', error);
      return null;
    }
  };

  // Import prompts from JSON or TS file
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let importData: any[];

      if (file.name.endsWith('.ts') || file.name.endsWith('.tsx')) {
        // Parse TypeScript file
        const parsed = parseTsFile(text);
        if (!parsed) {
          throw new Error('Could not parse TypeScript file. Expected an exported array.');
        }
        importData = parsed;
      } else {
        // Parse as JSON
        importData = JSON.parse(text);
      }
      
      if (!Array.isArray(importData)) {
        throw new Error('Invalid format: expected an array');
      }

      const validItems = importData
        .filter((item) => item && item.function_name && item.module_type && item.name_hy && item.prompt_text)
        .map((item) => ({
          function_name: item.function_name,
          module_type: item.module_type,
          name_hy: item.name_hy,
          name_ru: item.name_ru || item.name_hy,
          name_en: item.name_en || null,
          description: item.description || null,
          prompt_text: item.prompt_text,
        }));

      const skipped = importData.length - validItems.length;
      if (validItems.length === 0) {
        throw new Error('No valid prompt records found in the imported file.');
      }

      const { error } = await supabase
        .from('ai_prompts')
        .upsert(validItems, { onConflict: 'function_name,module_type' });

      if (error) throw error;

      toast.success(`Импортировано/обновлено: ${validItems.length}, пропущено: ${skipped}`);
      await fetchPrompts();
    } catch (error: unknown) {
      console.error('Import error:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(
        file.name.endsWith('.ts')
          ? `Ошибка импорта TS: ${msg}`
          : `Ошибка импорта JSON: ${msg}`
      );
    }
    
    // Reset input
    event.target.value = '';
  };

  // Open edit dialog
  const openEditDialog = (prompt?: Prompt) => {
    if (prompt) {
      setSelectedPrompt(prompt);
      setFormData({
        function_name: prompt.function_name,
        module_type: prompt.module_type,
        name_hy: prompt.name_hy,
        name_ru: prompt.name_ru,
        name_en: prompt.name_en || '',
        description: prompt.description || '',
        prompt_text: prompt.prompt_text,
      });
    } else {
      setSelectedPrompt(null);
      setFormData({
        function_name: '',
        module_type: '',
        name_hy: '',
        name_ru: '',
        name_en: '',
        description: '',
        prompt_text: '',
      });
    }
    setEditDialogOpen(true);
  };

  // Open preview dialog
  const openPreviewDialog = (prompt: Prompt) => {
    setSelectedPrompt(prompt);
    setPreviewDialogOpen(true);
  };

  // Open versions dialog
  const openVersionsDialog = (prompt: Prompt) => {
    setSelectedPrompt(prompt);
    fetchVersions(prompt.id);
    setVersionsDialogOpen(true);
  };

  // Open delete dialog
  const openDeleteDialog = (prompt: Prompt) => {
    setSelectedPrompt(prompt);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="database" className="space-y-4">
        <TabsList>
          <TabsTrigger value="database" className="gap-2">
            <Database className="h-4 w-4" />
            База промптов
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            Файлы промптов
          </TabsTrigger>
        </TabsList>

        <TabsContent value="files">
          <PromptFilesEditor />
        </TabsContent>

        <TabsContent value="database">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            {'\u054A\u0580\u0578\u0574\u057A\u057F\u0565\u0580\u056B \u056F\u0561\u057C\u0561\u057E\u0561\u0580\u0578\u0582\u0574'} (Prompt Manager)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Поиск..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterFunction} onValueChange={setFilterFunction}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Все функции" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все функции</SelectItem>
                  {AI_FUNCTIONS.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => openEditDialog()}>
                <Plus className="mr-1.5 h-4 w-4" />
                Добавить
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-1.5 h-4 w-4" />
                Экспорт
              </Button>
              <label>
                <Button variant="outline" asChild>
                  <span>
                    <Upload className="mr-1.5 h-4 w-4" />
                    Импорт
                  </span>
                </Button>
                <input
                  type="file"
                  accept=".json,.ts,.tsx"
                  onChange={handleImport}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Всего: {prompts.length}</span>
            <span>|</span>
            <span>Показано: {filteredPrompts.length}</span>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Функция</TableHead>
                    <TableHead className="w-[150px]">Модуль/Тип</TableHead>
                    <TableHead>Название (RU)</TableHead>
                    <TableHead className="w-[100px]">Версия</TableHead>
                    <TableHead className="w-[120px]">Обновлено</TableHead>
                    <TableHead className="w-[180px] text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPrompts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        Промпты не найдены
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedPrompts.map((prompt) => (
                      <TableRow key={prompt.id}>
                        <TableCell className="font-medium">
                          <span className="rounded bg-primary/10 px-2 py-1 text-xs">
                            {prompt.function_name}
                          </span>
                        </TableCell>
                        <TableCell>{prompt.module_type}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{prompt.name_ru}</div>
                            <div className="text-xs text-muted-foreground">{prompt.name_hy}</div>
                          </div>
                        </TableCell>
                        <TableCell>v{prompt.current_version}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(prompt.updated_at), 'dd.MM.yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openPreviewDialog(prompt)}
                              title="Предпросмотр"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(prompt)}
                              title="Редактировать"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDuplicate(prompt)}
                              title="Дублировать"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openVersionsDialog(prompt)}
                              title="История версий"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDeleteDialog(prompt)}
                              title="Удалить"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedPrompt ? 'Редактировать промпт' : 'Новый промпт'}
            </DialogTitle>
            <DialogDescription>
              Заполните все обязательные поля
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Функция *</label>
                <Select
                  value={formData.function_name}
                  onValueChange={(v) => setFormData({ ...formData, function_name: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите функцию" />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_FUNCTIONS.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Модуль/Тип *</label>
                <Input
                  value={formData.module_type}
                  onChange={(e) => setFormData({ ...formData, module_type: e.target.value })}
                  placeholder="напр. defense, civil_appeal"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Название (HY) *</label>
                <Input
                  value={formData.name_hy}
                  onChange={(e) => setFormData({ ...formData, name_hy: e.target.value })}
                  placeholder={'\u0531\u0576\u057E\u0561\u0576\u0578\u0582\u0574\u0568 \u0570\u0561\u0575\u0565\u0580\u0565\u0576'}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Название (RU) *</label>
                <Input
                  value={formData.name_ru}
                  onChange={(e) => setFormData({ ...formData, name_ru: e.target.value })}
                  placeholder="Название на русском"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Название (EN)</label>
              <Input
                value={formData.name_en}
                onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                placeholder="English name (optional)"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Описание</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Краткое описание промпта..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Текст промпта *</label>
              <Textarea
                value={formData.prompt_text}
                onChange={(e) => setFormData({ ...formData, prompt_text: e.target.value })}
                placeholder="Введите полный текст промпта..."
                rows={15}
                className="font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedPrompt?.name_ru}</DialogTitle>
            <DialogDescription>
              {selectedPrompt?.function_name} / {selectedPrompt?.module_type}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-4">
            <pre className="whitespace-pre-wrap font-mono text-sm">
              {selectedPrompt?.prompt_text}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Versions Dialog */}
      <Dialog open={versionsDialogOpen} onOpenChange={setVersionsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>История версий: {selectedPrompt?.name_ru}</DialogTitle>
            <DialogDescription>
              Текущая версия: v{selectedPrompt?.current_version}
            </DialogDescription>
          </DialogHeader>
          
          {versionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              История версий пуста
            </div>
          ) : (
            <div className="space-y-4">
              {versions.map((v) => (
                <Card key={v.id}>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Версия {v.version_number}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(v.changed_at), 'dd.MM.yyyy HH:mm')}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="py-2">
                    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
                      {v.prompt_text.substring(0, 500)}...
                    </pre>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setVersionsDialogOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить промпт?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Вы действительно хотите удалить: 
              <strong> {selectedPrompt?.name_ru}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </TabsContent>
      </Tabs>
    </div>
  );
};
