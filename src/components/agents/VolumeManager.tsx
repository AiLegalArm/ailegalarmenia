import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Plus, FileText, Trash2, Edit2, CheckCircle, Clock, Link2, FileArchive, ScanText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CaseVolume } from "./types";

interface CaseFile {
  id: string;
  filename: string;
  original_filename: string;
  file_type: string | null;
  file_size: number | null;
  storage_path: string;
}

interface VolumeManagerProps {
  caseId: string;
  volumes: CaseVolume[];
  onCreateVolume: (data: Partial<CaseVolume>) => Promise<CaseVolume | null>;
  onUpdateVolume: (volumeId: string, data: Partial<CaseVolume>) => Promise<void>;
  onDeleteVolume: (volumeId: string) => Promise<void>;
}

export function VolumeManager({
  caseId,
  volumes,
  onCreateVolume,
  onUpdateVolume,
  onDeleteVolume
}: VolumeManagerProps) {
  const { t, i18n } = useTranslation(["ai", "cases", "ocr", "common"]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingVolume, setEditingVolume] = useState<CaseVolume | null>(null);
  const [caseFiles, setCaseFiles] = useState<CaseFile[]>([]);
  const [ocrProcessing, setOcrProcessing] = useState<Record<string, boolean>>({});
  const [ocrProgress, setOcrProgress] = useState<Record<string, number>>({});
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    page_count: "",
    file_id: ""
  });

  // Load case files
  useEffect(() => {
    const loadCaseFiles = async () => {
      const { data, error } = await supabase
        .from("case_files")
        .select("id, filename, original_filename, file_type, file_size, storage_path")
        .eq("case_id", caseId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      
      if (!error && data) {
        setCaseFiles(data);
      }
    };
    
    loadCaseFiles();
  }, [caseId]);

  // Get files not yet linked to any volume
  const getAvailableFiles = () => {
    const linkedFileIds = volumes.map(v => v.file_id).filter(Boolean);
    return caseFiles.filter(f => !linkedFileIds.includes(f.id));
  };

  // Get file name by ID
  const getFileName = (fileId: string | null) => {
    if (!fileId) return null;
    const file = caseFiles.find(f => f.id === fileId);
    return file?.original_filename || null;
  };

  const handleCreateVolume = async () => {
    const result = await onCreateVolume({
      title: formData.title,
      description: formData.description,
      page_count: formData.page_count ? parseInt(formData.page_count) : undefined,
      file_id: formData.file_id || undefined
    });
    
    if (result) {
      setFormData({ title: "", description: "", page_count: "", file_id: "" });
      setIsAddDialogOpen(false);
    }
  };

  const handleUpdateVolume = async () => {
    if (!editingVolume) return;
    
    await onUpdateVolume(editingVolume.id, {
      title: formData.title,
      description: formData.description,
      page_count: formData.page_count ? parseInt(formData.page_count) : undefined,
      file_id: formData.file_id || undefined
    });
    
    setEditingVolume(null);
    setFormData({ title: "", description: "", page_count: "", file_id: "" });
  };

  const openEditDialog = (volume: CaseVolume) => {
    setEditingVolume(volume);
    setFormData({
      title: volume.title,
      description: volume.description || "",
      page_count: volume.page_count?.toString() || "",
      file_id: volume.file_id || ""
    });
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const handleVolumeOcr = async (volume: CaseVolume) => {
    if (!volume.file_id) return;
    
    const file = caseFiles.find(f => f.id === volume.file_id);
    if (!file) return;

    setOcrProcessing(prev => ({ ...prev, [volume.id]: true }));
    setOcrProgress(prev => ({ ...prev, [volume.id]: 10 }));

    try {
      // Get signed URL
      const { data: signedData, error: signError } = await supabase.storage
        .from('case-files')
        .createSignedUrl(file.storage_path, 300);

      if (signError || !signedData?.signedUrl) throw signError || new Error('Failed to get signed URL');
      setOcrProgress(prev => ({ ...prev, [volume.id]: 30 }));

      const lang = i18n.language === 'hy' ? 'hye' : i18n.language === 'ru' ? 'rus' : 'eng';

      const { data, error } = await supabase.functions.invoke('ocr-process', {
        body: {
          fileUrl: signedData.signedUrl,
          fileName: file.original_filename,
          language: lang,
          fileId: file.id,
        }
      });

      if (error) throw error;
      setOcrProgress(prev => ({ ...prev, [volume.id]: 80 }));

      const extractedText = data.extracted_text || data.text;
      if ((data.success || data.ok) && extractedText) {
        // Update volume with OCR text
        await onUpdateVolume(volume.id, {
          ocr_text: extractedText,
          ocr_completed: true
        });
        setOcrProgress(prev => ({ ...prev, [volume.id]: 100 }));
        toast.success(t('ocr:processing_complete'));
      } else {
        throw new Error(data.error || 'OCR failed');
      }
    } catch (err) {
      console.error('Volume OCR error:', err);
      toast.error(t('ocr:processing_failed'));
    } finally {
      setOcrProcessing(prev => ({ ...prev, [volume.id]: false }));
      setOcrProgress(prev => ({ ...prev, [volume.id]: 0 }));
    }
  };

  const availableFiles = getAvailableFiles();

  return (
    <div className="space-y-4">
      {/* Available Case Files */}
      {availableFiles.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileArchive className="h-4 w-4" />
              {t("ai:available_case_files")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {availableFiles.map((file) => (
                <Badge 
                  key={file.id} 
                  variant="outline" 
                  className="cursor-pointer hover:bg-primary/10 py-2 px-3 max-w-full whitespace-normal break-words rounded-xl"
                  onClick={() => {
                    setFormData({
                      title: file.original_filename.replace(/\.[^.]+$/, ""),
                      description: "",
                      page_count: "",
                      file_id: file.id
                    });
                    setIsAddDialogOpen(true);
                  }}
                >
                  <div className="flex items-start gap-2 w-full min-w-0">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm leading-tight" style={{ overflowWrap: 'anywhere' }}>
                        {file.original_filename}
                      </div>
                      {file.file_size && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatFileSize(file.file_size)}
                        </div>
                      )}
                    </div>
                    <Plus className="mt-0.5 h-4 w-4 shrink-0" />
                  </div>
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t("ai:click_to_create_volume")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Header with Add button */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm sm:text-base font-semibold">{t("ai:case_volumes")}</h3>
          <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1">
            {t("ai:volumes_description")}
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8 sm:h-9 px-3 text-[11px] sm:text-xs shrink-0">
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t("ai:add_volume")}
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] sm:w-full max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="break-words">{t("ai:add_volume")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 overflow-y-auto">
              {/* File Selection */}
              <div className="space-y-2">
                <Label htmlFor="file">{t("ai:link_file")}</Label>
              <Select 
                  value={formData.file_id || "__none__"} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, file_id: value === "__none__" ? "" : value }))}
                >
                  <SelectTrigger className="min-w-0">
                    <SelectValue placeholder={t("ai:select_file_optional")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("ai:no_file")}</SelectItem>
                    {caseFiles.map((file) => (
                      <SelectItem key={file.id} value={file.id}>
                        {file.original_filename}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="title">{t("ai:volume_title")}</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder={t("ai:volume_title_placeholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t("ai:volume_description")}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t("ai:volume_description_placeholder")}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="page_count">{t("ai:page_count")}</Label>
                <Input
                  id="page_count"
                  type="number"
                  value={formData.page_count}
                  onChange={(e) => setFormData(prev => ({ ...prev, page_count: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="w-full sm:w-auto">
                {t("common:cancel")}
              </Button>
              <Button onClick={handleCreateVolume} disabled={!formData.title} className="w-full sm:w-auto">
                {t("common:create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Volumes Grid */}
      {volumes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              {t("ai:no_volumes")}
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => setIsAddDialogOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("ai:add_first_volume")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {volumes.map((volume) => (
            <Card key={volume.id} className="group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base">
                      {t("ai:volume")} {volume.volume_number}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(volume)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("ai:delete_volume")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("ai:delete_volume_confirm")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => onDeleteVolume(volume.id)}
                            className="bg-destructive text-destructive-foreground"
                          >
                            {t("common:delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="font-medium mb-2">{volume.title}</p>
                {volume.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {volume.description}
                  </p>
                )}
                
                {/* Linked file */}
                {volume.file_id && (
                  <div className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 mb-2">
                    <Link2 className="h-3 w-3" />
                    <span className="truncate">{getFileName(volume.file_id)}</span>
                  </div>
                )}
                
                <div className="flex items-center gap-2 flex-wrap">
                  {volume.page_count && (
                    <Badge variant="secondary">
                      {volume.page_count} {t("ai:pages")}
                    </Badge>
                  )}
                  <Badge variant={volume.ocr_completed ? "default" : "outline"}>
                    {volume.ocr_completed ? (
                      <>
                        <CheckCircle className="mr-1 h-3 w-3" />
                        OCR
                      </>
                    ) : (
                      <>
                        <Clock className="mr-1 h-3 w-3" />
                        {t("ai:pending_ocr")}
                      </>
                    )}
                  </Badge>
                </div>
                
                {/* OCR Button */}
                {volume.file_id && !volume.ocr_completed && (
                  <div className="mt-3 space-y-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-8 text-xs"
                      disabled={ocrProcessing[volume.id]}
                      onClick={() => handleVolumeOcr(volume)}
                    >
                      {ocrProcessing[volume.id] ? (
                        <>
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                          {t("ocr:processing")}...
                        </>
                      ) : (
                        <>
                          <ScanText className="mr-1.5 h-3 w-3" />
                          {t("cases:process_ocr_extract")}
                        </>
                      )}
                    </Button>
                    {ocrProcessing[volume.id] && ocrProgress[volume.id] > 0 && (
                      <Progress value={ocrProgress[volume.id]} className="h-1.5" />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingVolume} onOpenChange={(open) => !open && setEditingVolume(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ai:edit_volume")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* File Selection */}
            <div className="space-y-2">
              <Label htmlFor="edit-file">{t("ai:link_file")}</Label>
              <Select 
                value={formData.file_id || "__none__"} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, file_id: value === "__none__" ? "" : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("ai:select_file_optional")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("ai:no_file")}</SelectItem>
                  {caseFiles.map((file) => (
                    <SelectItem key={file.id} value={file.id}>
                      {file.original_filename}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-title">{t("ai:volume_title")}</Label>
              <Input
                id="edit-title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">{t("ai:volume_description")}</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-page_count">{t("ai:page_count")}</Label>
              <Input
                id="edit-page_count"
                type="number"
                value={formData.page_count}
                onChange={(e) => setFormData(prev => ({ ...prev, page_count: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingVolume(null)}>
              {t("common:cancel")}
            </Button>
            <Button onClick={handleUpdateVolume}>
              {t("common:save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
