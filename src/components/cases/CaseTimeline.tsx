import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { 
  FileText, 
  MessageSquare, 
  Edit, 
  Plus,
  Loader2,
  Brain,
  Mic,
  FileSearch,
  Filter
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface TimelineEvent {
  id: string;
  type: 'file' | 'analysis' | 'note' | 'status_change' | 'created' | 'ocr' | 'audio';
  title: string;
  description?: string;
  timestamp: string;
  icon: React.ReactNode;
}

interface CaseTimelineProps {
  caseId: string;
}

// Types for query results
interface CaseFile {
  id: string;
  original_filename: string;
  created_at: string;
}

interface Analysis {
  id: string;
  role: string;
  created_at: string;
}

interface OcrResult {
  id: string;
  created_at: string;
  file_id: string;
}

interface AudioTranscription {
  id: string;
  created_at: string;
  file_id: string;
}

interface CaseData {
  created_at: string;
  updated_at: string;
  title: string;
}

interface TimelineData {
  caseData: CaseData | null;
  files: CaseFile[];
  analyses: Analysis[];
  ocrResults: OcrResult[];
  audioTranscriptions: AudioTranscription[];
}

// Default filter types
const DEFAULT_FILTER_TYPES = new Set(['file', 'analysis', 'note', 'created', 'ocr', 'audio']);

export function CaseTimeline({ caseId }: CaseTimelineProps) {
  const { t } = useTranslation(['cases', 'common', 'ai']);
  
  // Filter state
  const [filterTypes, setFilterTypes] = useState<Set<string>>(DEFAULT_FILTER_TYPES);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);

  // Single consolidated query for all timeline data
  const { data: timelineData, isLoading } = useQuery({
    queryKey: ['timeline-data', caseId],
    queryFn: async (): Promise<TimelineData> => {
      // Fetch case data and files in parallel (files needed for OCR/audio lookups)
      const [caseResult, filesResult, analysesResult] = await Promise.all([
        supabase
          .from('cases')
          .select('created_at, updated_at, title')
          .eq('id', caseId)
          .single(),
        supabase
          .from('case_files')
          .select('id, original_filename, created_at')
          .eq('case_id', caseId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('ai_analysis')
          .select('id, role, created_at')
          .eq('case_id', caseId)
          .order('created_at', { ascending: false }),
      ]);

      if (caseResult.error) throw caseResult.error;
      if (filesResult.error) throw filesResult.error;
      if (analysesResult.error) throw analysesResult.error;

      const files = filesResult.data || [];
      const fileIds = files.map(f => f.id);

      // Only fetch OCR and audio if there are files
      let ocrResults: OcrResult[] = [];
      let audioTranscriptions: AudioTranscription[] = [];

      if (fileIds.length > 0) {
        const [ocrResult, audioResult] = await Promise.all([
          supabase
            .from('ocr_results')
            .select('id, created_at, file_id')
            .in('file_id', fileIds)
            .order('created_at', { ascending: false }),
          supabase
            .from('audio_transcriptions')
            .select('id, created_at, file_id')
            .in('file_id', fileIds)
            .order('created_at', { ascending: false }),
        ]);

        if (ocrResult.error) throw ocrResult.error;
        if (audioResult.error) throw audioResult.error;

        ocrResults = ocrResult.data || [];
        audioTranscriptions = audioResult.data || [];
      }

      return {
        caseData: caseResult.data,
        files,
        analyses: analysesResult.data || [],
        ocrResults,
        audioTranscriptions,
      };
    },
  });

  // Build file lookup map for OCR/audio descriptions
  const fileMap = useMemo(() => {
    const map = new Map<string, string>();
    timelineData?.files.forEach(file => {
      map.set(file.id, file.original_filename);
    });
    return map;
  }, [timelineData?.files]);

  // Build timeline events with memoization
  const events = useMemo((): TimelineEvent[] => {
    if (!timelineData) return [];
    
    const result: TimelineEvent[] = [];

    // Case created
    if (timelineData.caseData) {
      result.push({
        id: 'created',
        type: 'created',
        title: t('cases:case_created'),
        timestamp: timelineData.caseData.created_at,
        icon: <Plus className="h-4 w-4" />,
      });
    }

    // Files uploaded
    timelineData.files.forEach(file => {
      result.push({
        id: `file-${file.id}`,
        type: 'file',
        title: t('cases:upload_file'),
        description: file.original_filename,
        timestamp: file.created_at,
        icon: <FileText className="h-4 w-4" />,
      });
    });

    // AI analyses
    const roleLabels: Record<string, string> = {
      advocate: t('ai:advocate'),
      prosecutor: t('ai:prosecutor'),
      judge: t('ai:judge'),
      aggregator: t('ai:aggregator'),
    };
    
    timelineData.analyses.forEach(analysis => {
      result.push({
        id: `analysis-${analysis.id}`,
        type: 'analysis',
        title: t('ai:ai_analysis'),
        description: roleLabels[analysis.role] || analysis.role,
        timestamp: analysis.created_at,
        icon: <Brain className="h-4 w-4" />,
      });
    });
    
    // OCR results
    timelineData.ocrResults.forEach(ocr => {
      result.push({
        id: `ocr-${ocr.id}`,
        type: 'ocr',
        title: t('cases:ocr_processed'),
        description: fileMap.get(ocr.file_id),
        timestamp: ocr.created_at,
        icon: <FileSearch className="h-4 w-4" />,
      });
    });
    
    // Audio transcriptions
    timelineData.audioTranscriptions.forEach(audio => {
      result.push({
        id: `audio-${audio.id}`,
        type: 'audio',
        title: t('cases:audio_transcribed'),
        description: fileMap.get(audio.file_id),
        timestamp: audio.created_at,
        icon: <Mic className="h-4 w-4" />,
      });
    });

    // Sort by timestamp descending
    result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return result;
  }, [timelineData, fileMap, t]);
  
  // Apply filters with memoization
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Filter by type
      if (!filterTypes.has(event.type)) {
        return false;
      }
      
      // Filter by date range
      const eventDate = new Date(event.timestamp);
      if (dateFrom && eventDate < dateFrom) {
        return false;
      }
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (eventDate > endOfDay) {
          return false;
        }
      }
      
      return true;
    });
  }, [events, filterTypes, dateFrom, dateTo]);
  
  const handleTypeToggle = (type: string) => {
    const newTypes = new Set(filterTypes);
    if (newTypes.has(type)) {
      newTypes.delete(type);
    } else {
      newTypes.add(type);
    }
    setFilterTypes(newTypes);
  };
  
  const resetFilters = () => {
    setFilterTypes(new Set(['file', 'analysis', 'note', 'created', 'ocr', 'audio']));
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Filter UI component (extracted to avoid duplication)
  const FilterUI = () => (
    <div className="mb-4 space-y-4">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowFilters(!showFilters)}
        className="w-full justify-center whitespace-normal text-center"
      >
        <Filter className="mr-2 h-4 w-4 shrink-0" />
        <span className="leading-tight">{t('cases:filter_timeline')}</span>
      </Button>
      
      {showFilters && (
        <div className="rounded-lg border p-4 space-y-4">
          {/* Event type filters */}
          <div>
            <h4 className="mb-3 text-sm font-medium">{t('cases:filter_by_type')}</h4>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="filter-analysis"
                  checked={filterTypes.has('analysis')}
                  onCheckedChange={() => handleTypeToggle('analysis')}
                />
                <Label htmlFor="filter-analysis" className="text-sm cursor-pointer">
                  {t('cases:filter_ai_analysis')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="filter-ocr"
                  checked={filterTypes.has('ocr')}
                  onCheckedChange={() => handleTypeToggle('ocr')}
                />
                <Label htmlFor="filter-ocr" className="text-sm cursor-pointer">
                  {t('cases:filter_ocr')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="filter-audio"
                  checked={filterTypes.has('audio')}
                  onCheckedChange={() => handleTypeToggle('audio')}
                />
                <Label htmlFor="filter-audio" className="text-sm cursor-pointer">
                  {t('cases:filter_audio')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="filter-file"
                  checked={filterTypes.has('file')}
                  onCheckedChange={() => handleTypeToggle('file')}
                />
                <Label htmlFor="filter-file" className="text-sm cursor-pointer">
                  {t('cases:filter_files')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="filter-note"
                  checked={filterTypes.has('note')}
                  onCheckedChange={() => handleTypeToggle('note')}
                />
                <Label htmlFor="filter-note" className="text-sm cursor-pointer">
                  {t('cases:filter_notes')}
                </Label>
              </div>
            </div>
          </div>
          
          {/* Date range filters */}
          <div>
            <h4 className="mb-3 text-sm font-medium">{t('cases:filter_by_date')}</h4>
            <div className="grid grid-cols-2 gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    {dateFrom ? format(dateFrom, 'dd.MM.yyyy') : t('cases:date_from')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    {dateTo ? format(dateTo, 'dd.MM.yyyy') : t('cases:date_to')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={resetFilters}
            className="w-full"
          >
            {t('cases:reset_filters')}
          </Button>
        </div>
      )}
    </div>
  );

  if (filteredEvents.length === 0) {
    return (
      <div>
        <FilterUI />
        <div className="py-8 text-center text-sm text-muted-foreground">
          {t('cases:no_timeline_events')}
        </div>
      </div>
    );
  }

  return (
    <div>
      <FilterUI />
      
      <ScrollArea className="h-[400px] pr-2 sm:pr-4">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
          
          {/* Timeline events */}
          <div className="space-y-6">
            {filteredEvents.map((event, index) => (
              <div key={event.id} className="relative flex gap-4 pl-10">
                {/* Icon bubble */}
                <div className="absolute left-0 flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                  {event.icon}
                </div>
                
                {/* Content */}
                <div className="flex-1 pt-1 min-w-0 overflow-hidden">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-sm break-words" style={{ overflowWrap: 'anywhere' }}>
                      {event.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(event.timestamp), 'dd.MM.yyyy HH:mm')}
                    </span>
                  </div>
                  {event.description && (
                    <p className="mt-1 text-sm text-muted-foreground break-words" style={{ overflowWrap: 'anywhere' }}>
                      {event.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
