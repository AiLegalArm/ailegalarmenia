import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Filter, Edit2, FileText, AlertTriangle, CheckCircle, HelpCircle, Clock } from "lucide-react";
import type { EvidenceItem, CaseVolume, EvidenceStatus, EvidenceType } from "./types";
import { EVIDENCE_TYPE_LABELS, EVIDENCE_STATUS_LABELS } from "./types";

interface EvidenceRegistryProps {
  caseId: string;
  items: EvidenceItem[];
  volumes: CaseVolume[];
  onUpdateItem: (itemId: string, data: Partial<EvidenceItem>) => Promise<void>;
}

export function EvidenceRegistry({
  caseId,
  items,
  volumes,
  onUpdateItem
}: EvidenceRegistryProps) {
  const { t, i18n } = useTranslation(["ai", "cases"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EvidenceStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<EvidenceType | "all">("all");
  const [editingItem, setEditingItem] = useState<EvidenceItem | null>(null);

  const lang = i18n.language === "hy" ? "hy" : i18n.language === "ru" ? "ru" : "en";

  // Filter items
  const filteredItems = items.filter(item => {
    const matchesSearch = 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.page_reference?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || item.admissibility_status === statusFilter;
    const matchesType = typeFilter === "all" || item.evidence_type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  // Stats
  const stats = {
    total: items.length,
    admissible: items.filter(i => i.admissibility_status === "admissible").length,
    inadmissible: items.filter(i => i.admissibility_status === "inadmissible").length,
    questionable: items.filter(i => i.admissibility_status === "questionable").length,
    pending: items.filter(i => i.admissibility_status === "pending_review").length
  };

  const getStatusIcon = (status: EvidenceStatus) => {
    switch (status) {
      case "admissible":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "inadmissible":
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "questionable":
        return <HelpCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const handleUpdateStatus = async (status: EvidenceStatus) => {
    if (!editingItem) return;
    await onUpdateItem(editingItem.id, { admissibility_status: status });
    setEditingItem(null);
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">{t("ai:total_evidence")}</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 dark:bg-green-950/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.admissible}</div>
            <div className="text-xs text-muted-foreground">{EVIDENCE_STATUS_LABELS.admissible[lang]}</div>
          </CardContent>
        </Card>
        <Card className="bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.inadmissible}</div>
            <div className="text-xs text-muted-foreground">{EVIDENCE_STATUS_LABELS.inadmissible[lang]}</div>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.questionable}</div>
            <div className="text-xs text-muted-foreground">{EVIDENCE_STATUS_LABELS.questionable[lang]}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-600">{stats.pending}</div>
            <div className="text-xs text-muted-foreground">{EVIDENCE_STATUS_LABELS.pending_review[lang]}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("ai:search_evidence")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as EvidenceStatus | "all")}>
              <SelectTrigger className="w-full md:w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder={t("ai:filter_status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("ai:all_statuses")}</SelectItem>
                {Object.entries(EVIDENCE_STATUS_LABELS).map(([key, labels]) => (
                  <SelectItem key={key} value={key}>{labels[lang]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as EvidenceType | "all")}>
              <SelectTrigger className="w-full md:w-[180px]">
                <FileText className="mr-2 h-4 w-4" />
                <SelectValue placeholder={t("ai:filter_type")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("ai:all_types")}</SelectItem>
                {Object.entries(EVIDENCE_TYPE_LABELS).map(([key, labels]) => (
                  <SelectItem key={key} value={key}>{labels[lang]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Evidence Table */}
      <Card>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">#</TableHead>
                <TableHead>{t("ai:evidence_title")}</TableHead>
                <TableHead className="w-[120px]">{t("ai:evidence_type")}</TableHead>
                <TableHead className="w-[120px]">{t("ai:page_ref")}</TableHead>
                <TableHead className="w-[140px]">{t("ai:status")}</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {items.length === 0 
                      ? t("ai:no_evidence_yet")
                      : t("ai:no_matching_evidence")
                    }
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">
                      {item.evidence_number}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{item.title}</div>
                        {item.description && (
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {item.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {EVIDENCE_TYPE_LABELS[item.evidence_type]?.[lang] || item.evidence_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.page_reference || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={EVIDENCE_STATUS_LABELS[item.admissibility_status]?.color}>
                        {getStatusIcon(item.admissibility_status)}
                        <span className="ml-1">
                          {EVIDENCE_STATUS_LABELS[item.admissibility_status]?.[lang]}
                        </span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingItem(item)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("ai:evidence")} #{editingItem?.evidence_number}: {editingItem?.title}
            </DialogTitle>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("ai:evidence_type")}</Label>
                  <div className="mt-1">
                    <Badge variant="outline">
                      {EVIDENCE_TYPE_LABELS[editingItem.evidence_type]?.[lang]}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label>{t("ai:page_ref")}</Label>
                  <div className="mt-1 text-sm">
                    {editingItem.page_reference || "-"}
                  </div>
                </div>
              </div>
              
              {editingItem.description && (
                <div>
                  <Label>{t("ai:description")}</Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {editingItem.description}
                  </p>
                </div>
              )}
              
              {editingItem.ai_analysis && (
                <div>
                  <Label>{t("ai:ai_analysis")}</Label>
                  <div className="mt-1 p-3 bg-muted rounded-lg text-sm">
                    {editingItem.ai_analysis}
                  </div>
                </div>
              )}
              
              <div>
                <Label>{t("ai:admissibility_notes")}</Label>
                <Textarea
                  value={editingItem.admissibility_notes || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, admissibility_notes: e.target.value })}
                  placeholder={t("ai:admissibility_notes_placeholder")}
                  rows={3}
                />
              </div>
              
              <div>
                <Label>{t("ai:set_status")}</Label>
                <div className="flex gap-2 mt-2">
                  {Object.entries(EVIDENCE_STATUS_LABELS).map(([key, labels]) => (
                    <Button
                      key={key}
                      variant={editingItem.admissibility_status === key ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleUpdateStatus(key as EvidenceStatus)}
                      className={editingItem.admissibility_status === key ? "" : labels.color}
                    >
                      {labels[lang]}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              {t("common:close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
