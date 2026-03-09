import jsPDF from "jspdf";
import { stripMarkdown } from "./strip-markdown";
import { registerArmenianFont, setArmenianFont, setArmenianBoldFont, containsArmenian, containsCyrillic } from "./pdf/fontLoader";
import { loadLogoForPDF, addLogoToPage } from "./pdf/logoLoader";

// ── Types ──

export interface FullCaseReportData {
  caseNumber: string;
  caseTitle: string;
  description?: string;
  facts?: string;
  legalQuestion?: string;
  status: string;
  priority: string;
  caseType?: string;
  courtName?: string;
  courtDate?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  userName?: string;
  language?: "hy" | "en";

  files?: Array<{ original_filename: string; file_size: number; created_at: string }>;
  timeline?: Array<{ type: string; title: string; description?: string; timestamp: string }>;

  aiAnalyses?: Array<{ role: string; response_text: string; created_at: string; sources_used?: unknown }>;

  agentRuns?: Array<{
    agent_type: string;
    status: string;
    summary?: string;
    analysis_result?: string;
    completed_at?: string;
    tokens_used?: number;
  }>;

  findings?: Array<{
    title: string;
    description: string;
    severity?: string;
    finding_type: string;
    legal_basis?: string[];
    recommendation?: string;
  }>;

  evidence?: Array<{
    evidence_number: number;
    title: string;
    evidence_type: string;
    admissibility_status?: string;
    description?: string;
    ai_analysis?: string;
    admissibility_notes?: string;
  }>;

  aggregatedReport?: {
    title: string;
    executive_summary?: string;
    evidence_summary?: string;
    violations_summary?: string;
    defense_strategy?: string;
    prosecution_weaknesses?: string;
    recommendations?: string;
    full_report?: string;
    generated_at: string;
  };
}

// ── Labels ──

const LABELS = {
  hy: {
    fullReport: "\u053C\u053B\u0531\u053F\u0531\u054F\u0531\u054A \u0536\u0535\u053F\u0548\u0552\u0545\u0551",
    fullCaseReport: "\u053C\u053B\u0531\u053F\u0531\u054F\u0531\u054A \u0533\u0548\u054A\u053E\u053B \u0536\u0535\u053F\u0548\u0552\u0545\u0551",
    caseDetails: "\u0533\u0548\u054A\u053E\u053B \u0544\u0531\u0546\u054A\u0531\u0544\u0531\u054D\u0546\u0535\u054A",
    caseNumber: "\u0533\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580:",
    title: "\u054E\u0565\u0580\u0576\u0561\u0563\u056B\u0580:",
    status: "\u053F\u0561\u0580\u0563\u0561\u057E\u056B\u0573\u0561\u056F:",
    priority: "\u0531\u057C\u0561\u057B\u0576\u0561\u0570\u0565\u0580\u057F\u0578\u0582\u0569\u0575\u0578\u0582\u0576:",
    caseType: "\u0533\u0578\u0580\u056E\u056B \u057F\u0565\u057D\u0561\u056F:",
    court: "\u0534\u0561\u057F\u0561\u0580\u0561\u0576:",
    courtDate: "\u0534\u0561\u057F\u0561\u056F\u0561\u0576 \u0576\u056B\u057D\u057F:",
    created: "\u054D\u057F\u0565\u0572\u056E\u057E\u0565\u056C \u0567:",
    updated: "\u0539\u0561\u0580\u0574\u0561\u0581\u057E\u0565\u056C \u0567:",
    description: "\u0546\u056F\u0561\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    facts: "\u0553\u0561\u057D\u057F\u0561\u056F\u0561\u0576 \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580",
    legalQuestion: "\u053B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u0561\u0580\u0581",
    notes: "\u0546\u0577\u0578\u0582\u0574\u0576\u0565\u0580",
    attachedFiles: "\u053F\u0581\u057E\u0561\u056E \u0586\u0561\u0575\u056C\u0565\u0580",
    timeline: "\u053A\u0561\u0574\u0561\u0576\u0561\u056F\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    aiAnalyses: "AI \u054E\u0535\u054A\u053C\u0548\u0552\u053E\u0548\u0552\u0539\u0545\u0548\u0552\u0546\u0546\u0535\u054A",
    agentRuns: "\u0544\u0548\u0552\u053C\u054F\u053B-\u0531\u0533\u0535\u0546\u054F \u054E\u0535\u054A\u053C\u0548\u0552\u053E\u0548\u0552\u0539\u0545\u0548\u0552\u0546\u0546\u0535\u054A",
    agentFindings: "\u0531\u0533\u0535\u0546\u054F\u0546\u0535\u054A\u053B \u0533\u054F\u0531\u053E\u0548\u0552\u0544\u0546\u0535\u054A",
    evidenceRegistry: "\u0531\u054A\u0531\u053E\u0548\u0552\u0545\u053E\u0546\u0535\u054A\u053B \u0533\u054A\u0531\u0546\u0551\u0535",
    aggregatedReport: "\u0540\u0531\u0544\u0531\u0534\u054A\u054E\u0531\u053E \u0536\u0535\u053F\u0548\u0552\u0545\u0551",
    executiveSummary: "\u0540\u0561\u0574\u0561\u057C\u0578\u057F \u0561\u0574\u0586\u0578\u0583\u0578\u0582\u0574",
    evidenceSummary: "\u0531\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056B \u0561\u0574\u0586\u0578\u0583\u0578\u0582\u0574",
    violationsSummary: "\u053D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580\u056B \u0561\u0574\u0586\u0578\u0583\u0578\u0582\u0574",
    defenseStrategy: "\u054A\u0561\u0577\u057F\u057A\u0561\u0576\u0561\u056F\u0561\u0576 \u057C\u0561\u0566\u0574\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    prosecutionWeaknesses: "\u0544\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B \u0569\u0578\u0582\u0575\u056C \u056F\u0578\u0572\u0574\u0565\u0580",
    recommendations: "\u0540\u0561\u0576\u0571\u0576\u0561\u0580\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580",
  },
  en: {
    fullReport: "FULL REPORT",
    fullCaseReport: "COMPREHENSIVE CASE REPORT",
    caseDetails: "CASE DETAILS",
    caseNumber: "Case Number:",
    title: "Title:",
    status: "Status:",
    priority: "Priority:",
    caseType: "Case Type:",
    court: "Court:",
    courtDate: "Court Date:",
    created: "Created:",
    updated: "Updated:",
    description: "Description",
    facts: "Case Facts",
    legalQuestion: "Legal Question",
    notes: "Notes",
    attachedFiles: "Attached Files",
    timeline: "Timeline",
    aiAnalyses: "AI ANALYSES",
    agentRuns: "MULTI-AGENT ANALYSIS RUNS",
    agentFindings: "AGENT FINDINGS",
    evidenceRegistry: "EVIDENCE REGISTRY",
    aggregatedReport: "AGGREGATED REPORT",
    executiveSummary: "Executive Summary",
    evidenceSummary: "Evidence Summary",
    violationsSummary: "Violations Summary",
    defenseStrategy: "Defense Strategy",
    prosecutionWeaknesses: "Prosecution Weaknesses",
    recommendations: "Recommendations",
  },
};

const ROLE_LABELS: Record<string, Record<string, string>> = {
  advocate: { hy: "\u054A\u0561\u0577\u057F\u057A\u0561\u0576 (\u0553\u0561\u057D\u057F\u0561\u0562\u0561\u0576)", en: "Advocate (Defense)" },
  prosecutor: { hy: "\u0544\u0565\u0572\u0561\u0564\u0580\u0578\u0572", en: "Prosecutor" },
  judge: { hy: "\u0534\u0561\u057F\u0561\u057E\u0578\u0580", en: "Judge" },
  aggregator: { hy: "\u053C\u056B\u0561\u056F\u0561\u057F\u0561\u0580 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576", en: "Complete Analysis" },
  evidence_collector: { hy: "\u0531\u057A\u0561\u0581\u0578\u0582\u0575\u0581 \u0570\u0561\u057E\u0561\u0584\u056B\u0579", en: "Evidence Collector" },
  evidence_admissibility: { hy: "\u0531\u0576\u0569\u0578\u0582\u0575\u056C\u0561\u057F\u0580\u0565\u056C\u056B\u0578\u0582\u0569\u0575\u0578\u0582\u0576", en: "Evidence Admissibility" },
  charge_qualification: { hy: "\u0540\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576", en: "Charge Qualification" },
  procedural_violations: { hy: "\u0534\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580", en: "Procedural Violations" },
  substantive_violations: { hy: "\u0546\u0575\u0578\u0582\u0569\u0561\u056F\u0561\u0576 \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580", en: "Substantive Violations" },
  defense_strategy: { hy: "\u054A\u0561\u0577\u057F\u057A\u0561\u0576\u0561\u056F\u0561\u0576 \u057C\u0561\u0566\u0574\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576", en: "Defense Strategy" },
  prosecution_weaknesses: { hy: "\u0544\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B \u0569\u0578\u0582\u0575\u056C \u056F\u0578\u0572\u0574\u0565\u0580", en: "Prosecution Weaknesses" },
  rights_violations: { hy: "\u053B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580", en: "Rights Violations" },
};

const DISCLAIMER_EN = "DISCLAIMER: This report is for informational purposes only and does not constitute legal advice. Always consult with a licensed attorney.";

const SEVERITY_LABELS: Record<string, string> = {
  critical: "\u{1F534} Critical",
  high: "\u{1F7E0} High",
  medium: "\u{1F7E1} Medium",
  low: "\u{1F7E2} Low",
};

// ── PDF Helpers ──

function selectFont(doc: jsPDF, text: string, hasArmenianFont: boolean): void {
  if (hasArmenianFont && (containsArmenian(text) || containsCyrillic(text))) {
    setArmenianBoldFont(doc);
  } else {
    doc.setFont("helvetica", "normal");
  }
  doc.setTextColor(0, 0, 0);
}

function selectBoldFont(doc: jsPDF, text: string, hasArmenianFont: boolean): void {
  if (hasArmenianFont && (containsArmenian(text) || containsCyrillic(text))) {
    setArmenianBoldFont(doc);
  } else {
    doc.setFont("helvetica", "bold");
  }
  doc.setTextColor(0, 0, 0);
}

function addReportHeader(doc: jsPDF, caseNumber: string, exportDate: Date, lang: "hy" | "en", hasArmenianFont: boolean, logoData?: string | null) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  if (logoData) addLogoToPage(doc, logoData);
  doc.saveGraphicsState();
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.text("AI Legal Armenia", margin, 28);
  const locale = lang === "hy" ? "hy-AM" : "en-US";
  const dateStr = exportDate.toLocaleDateString(locale);
  const caseLabel = lang === "hy" ? "\u0533\u0578\u0580\u056E \u2116" : "Case #";
  const caseHeaderText = `${caseLabel} ${caseNumber}`;
  if (hasArmenianFont && (containsArmenian(caseHeaderText) || containsCyrillic(caseHeaderText))) {
    setArmenianFont(doc);
  }
  doc.text(caseHeaderText, pageWidth / 2, 28, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.text(dateStr, pageWidth - margin, 28, { align: "right" });
  doc.restoreGraphicsState();
}

function addReportFooter(doc: jsPDF, pageNumber: number, totalPages: number, hasArmenianFont: boolean) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const footerY = pageHeight - 25;
  doc.saveGraphicsState();
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  selectFont(doc, DISCLAIMER_EN, hasArmenianFont);
  const disclaimerLines = doc.splitTextToSize(DISCLAIMER_EN, maxWidth);
  doc.text(disclaimerLines, margin, footerY);
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`${pageNumber} / ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: "center" });
  doc.restoreGraphicsState();
}

// ── Main Export Function ──

export async function exportFullCaseReportToPDF(data: FullCaseReportData): Promise<void> {
  const doc = new jsPDF();
  const exportDate = new Date();
  const lang = data.language || "hy";
  const labels = LABELS[lang];
  const locale = lang === "hy" ? "hy-AM" : "en-US";

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const contentTopMargin = 35;
  const contentBottomMargin = 35;

  let hasArmenianFont = false;
  try {
    await registerArmenianFont(doc);
    hasArmenianFont = true;
  } catch (e) {
    console.warn("Armenian font not loaded:", e);
  }

  const logoData = await loadLogoForPDF();

  let yPosition = 35;

  const checkPageOverflow = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - contentBottomMargin) {
      doc.addPage();
      addReportHeader(doc, data.caseNumber, exportDate, lang, hasArmenianFont, logoData);
      yPosition = contentTopMargin;
      return true;
    }
    return false;
  };

  const writeSection = (title: string, content: string) => {
    checkPageOverflow(20);
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    selectBoldFont(doc, title, hasArmenianFont);
    doc.text(title, margin, yPosition);
    yPosition += 8;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    const clean = stripMarkdown(content);
    selectFont(doc, clean, hasArmenianFont);
    const lines = doc.splitTextToSize(clean, maxWidth);
    for (const line of lines) {
      checkPageOverflow(5);
      doc.text(line, margin, yPosition);
      yPosition += 5;
    }
    yPosition += 8;
  };

  const writeSectionHeader = (title: string) => {
    checkPageOverflow(20);
    doc.setDrawColor(100, 100, 200);
    doc.setLineWidth(0.8);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 8;
    doc.setFontSize(16);
    doc.setTextColor(30, 30, 120);
    selectBoldFont(doc, title, hasArmenianFont);
    doc.text(title, margin, yPosition);
    yPosition += 12;
    doc.setTextColor(0, 0, 0);
  };

  // ═══════════════════════════════════════════════
  // TITLE PAGE
  // ═══════════════════════════════════════════════
  addReportHeader(doc, data.caseNumber, exportDate, lang, hasArmenianFont, logoData);

  doc.setFontSize(24);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text("Ai Legal Armenia", pageWidth / 2, 55, { align: "center" });

  doc.setFontSize(18);
  doc.setTextColor(30, 30, 120);
  selectBoldFont(doc, labels.fullCaseReport, hasArmenianFont);
  doc.text(labels.fullCaseReport, pageWidth / 2, 75, { align: "center" });

  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  const caseNumText = `${labels.caseNumber} ${data.caseNumber}`;
  selectFont(doc, caseNumText, hasArmenianFont);
  doc.text(caseNumText, pageWidth / 2, 95, { align: "center" });

  selectFont(doc, data.caseTitle, hasArmenianFont);
  const titleLines = doc.splitTextToSize(data.caseTitle, maxWidth);
  doc.text(titleLines, pageWidth / 2, 108, { align: "center" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(exportDate.toLocaleDateString(locale), pageWidth / 2, 130, { align: "center" });

  if (data.userName) {
    doc.setFontSize(10);
    doc.text(data.userName, pageWidth / 2, 140, { align: "center" });
  }

  // Stats summary
  yPosition = 160;
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.setFont("helvetica", "normal");
  const stats = [
    `Files: ${data.files?.length || 0}`,
    `AI Analyses: ${data.aiAnalyses?.length || 0}`,
    `Agent Runs: ${data.agentRuns?.filter(r => r.status === "completed").length || 0}/${data.agentRuns?.length || 0}`,
    `Findings: ${data.findings?.length || 0}`,
    `Evidence Items: ${data.evidence?.length || 0}`,
    `Aggregated Report: ${data.aggregatedReport ? "Yes" : "No"}`,
  ];
  stats.forEach(s => {
    doc.text(s, pageWidth / 2, yPosition, { align: "center" });
    yPosition += 6;
  });

  // ═══════════════════════════════════════════════
  // SECTION 1: CASE DETAILS
  // ═══════════════════════════════════════════════
  doc.addPage();
  addReportHeader(doc, data.caseNumber, exportDate, lang, hasArmenianFont, logoData);
  yPosition = contentTopMargin;

  writeSectionHeader(labels.caseDetails);

  const metaFields: [string, string | undefined][] = [
    [labels.status, data.status],
    [labels.priority, data.priority],
    [labels.caseType, data.caseType],
    [labels.court, data.courtName],
    [labels.courtDate, data.courtDate],
    [labels.created, data.createdAt.toLocaleString(locale)],
    [labels.updated, data.updatedAt.toLocaleString(locale)],
  ];

  doc.setFontSize(10);
  for (const [label, value] of metaFields) {
    if (!value) continue;
    checkPageOverflow(7);
    selectBoldFont(doc, label, hasArmenianFont);
    doc.text(label, margin, yPosition);
    selectFont(doc, value, hasArmenianFont);
    doc.text(value, margin + 50, yPosition);
    yPosition += 7;
  }
  yPosition += 5;

  if (data.description) writeSection(labels.description, data.description);
  if (data.facts) writeSection(labels.facts, data.facts);
  if (data.legalQuestion) writeSection(labels.legalQuestion, data.legalQuestion);
  if (data.notes) writeSection(labels.notes, data.notes);

  // ═══════════════════════════════════════════════
  // SECTION 2: FILES
  // ═══════════════════════════════════════════════
  if (data.files && data.files.length > 0) {
    writeSectionHeader(labels.attachedFiles);
    doc.setFontSize(9);
    data.files.forEach((file, idx) => {
      checkPageOverflow(6);
      const sizeKB = (file.file_size / 1024).toFixed(1);
      const text = `${idx + 1}. ${file.original_filename} (${sizeKB} KB) \u2014 ${new Date(file.created_at).toLocaleDateString(locale)}`;
      selectFont(doc, text, hasArmenianFont);
      doc.text(text, margin, yPosition);
      yPosition += 5;
    });
    yPosition += 5;
  }

  // ═══════════════════════════════════════════════
  // SECTION 3: AI ANALYSES
  // ═══════════════════════════════════════════════
  if (data.aiAnalyses && data.aiAnalyses.length > 0) {
    doc.addPage();
    addReportHeader(doc, data.caseNumber, exportDate, lang, hasArmenianFont, logoData);
    yPosition = contentTopMargin;

    writeSectionHeader(labels.aiAnalyses);

    for (const analysis of data.aiAnalyses) {
      checkPageOverflow(20);
      const roleLabel = ROLE_LABELS[analysis.role]?.[lang] || analysis.role;
      doc.setFontSize(12);
      selectBoldFont(doc, roleLabel, hasArmenianFont);
      doc.text(roleLabel, margin, yPosition);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text(new Date(analysis.created_at).toLocaleString(locale), pageWidth - margin, yPosition, { align: "right" });
      doc.setTextColor(0, 0, 0);
      yPosition += 8;

      doc.setFontSize(10);
      const clean = stripMarkdown(analysis.response_text);
      selectFont(doc, clean, hasArmenianFont);
      const lines = doc.splitTextToSize(clean, maxWidth);
      for (const line of lines) {
        checkPageOverflow(5);
        doc.text(line, margin, yPosition);
        yPosition += 5;
      }
      yPosition += 10;

      checkPageOverflow(5);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(margin + 20, yPosition, pageWidth - margin - 20, yPosition);
      yPosition += 8;
    }
  }

  // ═══════════════════════════════════════════════
  // SECTION 4: MULTI-AGENT RUNS
  // ═══════════════════════════════════════════════
  if (data.agentRuns && data.agentRuns.length > 0) {
    doc.addPage();
    addReportHeader(doc, data.caseNumber, exportDate, lang, hasArmenianFont, logoData);
    yPosition = contentTopMargin;

    writeSectionHeader(labels.agentRuns);

    for (const run of data.agentRuns) {
      checkPageOverflow(15);
      const roleLabel = ROLE_LABELS[run.agent_type]?.[lang] || run.agent_type;
      const statusIcon = run.status === "completed" ? "\u2705" : run.status === "failed" ? "\u274C" : "\u23F3";

      doc.setFontSize(11);
      selectBoldFont(doc, roleLabel, hasArmenianFont);
      doc.text(`${statusIcon} ${roleLabel}`, margin, yPosition);
      yPosition += 6;

      if (run.summary) {
        doc.setFontSize(9);
        const clean = stripMarkdown(run.summary);
        selectFont(doc, clean, hasArmenianFont);
        const lines = doc.splitTextToSize(clean, maxWidth);
        for (const line of lines.slice(0, 20)) {
          checkPageOverflow(4);
          doc.text(line, margin + 5, yPosition);
          yPosition += 4;
        }
      }

      if (run.analysis_result) {
        doc.setFontSize(9);
        const clean = stripMarkdown(run.analysis_result);
        selectFont(doc, clean, hasArmenianFont);
        const lines = doc.splitTextToSize(clean, maxWidth - 5);
        for (const line of lines) {
          checkPageOverflow(4);
          doc.text(line, margin + 5, yPosition);
          yPosition += 4;
        }
      }

      yPosition += 6;
    }
  }

  // ═══════════════════════════════════════════════
  // SECTION 5: FINDINGS
  // ═══════════════════════════════════════════════
  if (data.findings && data.findings.length > 0) {
    doc.addPage();
    addReportHeader(doc, data.caseNumber, exportDate, lang, hasArmenianFont, logoData);
    yPosition = contentTopMargin;

    writeSectionHeader(labels.agentFindings);

    data.findings.forEach((finding, idx) => {
      checkPageOverflow(20);
      const sevLabel = SEVERITY_LABELS[finding.severity || "medium"] || finding.severity || "";
      doc.setFontSize(10);
      selectBoldFont(doc, finding.title, hasArmenianFont);
      doc.text(`${idx + 1}. ${sevLabel} ${finding.title}`, margin, yPosition);
      yPosition += 6;

      doc.setFontSize(9);
      const descClean = stripMarkdown(finding.description);
      selectFont(doc, descClean, hasArmenianFont);
      const lines = doc.splitTextToSize(descClean, maxWidth - 10);
      for (const line of lines) {
        checkPageOverflow(4);
        doc.text(line, margin + 5, yPosition);
        yPosition += 4;
      }

      if (finding.legal_basis && finding.legal_basis.length > 0) {
        checkPageOverflow(5);
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 150);
        doc.text(`Legal basis: ${finding.legal_basis.join(", ")}`, margin + 5, yPosition);
        doc.setTextColor(0, 0, 0);
        yPosition += 5;
      }

      if (finding.recommendation) {
        checkPageOverflow(5);
        doc.setFontSize(8);
        doc.setTextColor(0, 100, 0);
        const recLines = doc.splitTextToSize(`\u2192 ${finding.recommendation}`, maxWidth - 10);
        for (const line of recLines) {
          checkPageOverflow(4);
          doc.text(line, margin + 5, yPosition);
          yPosition += 4;
        }
        doc.setTextColor(0, 0, 0);
      }

      yPosition += 5;
    });
  }

  // ═══════════════════════════════════════════════
  // SECTION 6: EVIDENCE REGISTRY
  // ═══════════════════════════════════════════════
  if (data.evidence && data.evidence.length > 0) {
    doc.addPage();
    addReportHeader(doc, data.caseNumber, exportDate, lang, hasArmenianFont, logoData);
    yPosition = contentTopMargin;

    writeSectionHeader(labels.evidenceRegistry);

    data.evidence.forEach((ev) => {
      checkPageOverflow(20);
      doc.setFontSize(10);
      selectBoldFont(doc, ev.title, hasArmenianFont);
      doc.text(`#${ev.evidence_number}. ${ev.title}`, margin, yPosition);
      yPosition += 6;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Type: ${ev.evidence_type} | Status: ${ev.admissibility_status || "pending"}`, margin + 5, yPosition);
      yPosition += 5;

      if (ev.description) {
        const descClean = stripMarkdown(ev.description);
        selectFont(doc, descClean, hasArmenianFont);
        const lines = doc.splitTextToSize(descClean, maxWidth - 10);
        for (const line of lines.slice(0, 10)) {
          checkPageOverflow(4);
          doc.text(line, margin + 5, yPosition);
          yPosition += 4;
        }
      }

      if (ev.ai_analysis) {
        checkPageOverflow(5);
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 150);
        const aiLines = doc.splitTextToSize(`AI: ${stripMarkdown(ev.ai_analysis)}`, maxWidth - 10);
        for (const line of aiLines.slice(0, 5)) {
          checkPageOverflow(4);
          doc.text(line, margin + 5, yPosition);
          yPosition += 4;
        }
        doc.setTextColor(0, 0, 0);
      }

      yPosition += 5;
    });
  }

  // ═══════════════════════════════════════════════
  // SECTION 7: AGGREGATED REPORT
  // ═══════════════════════════════════════════════
  if (data.aggregatedReport) {
    doc.addPage();
    addReportHeader(doc, data.caseNumber, exportDate, lang, hasArmenianFont, logoData);
    yPosition = contentTopMargin;

    writeSectionHeader(labels.aggregatedReport);

    const sections: [string, string | undefined][] = [
      [labels.executiveSummary, data.aggregatedReport.executive_summary],
      [labels.evidenceSummary, data.aggregatedReport.evidence_summary],
      [labels.violationsSummary, data.aggregatedReport.violations_summary],
      [labels.defenseStrategy, data.aggregatedReport.defense_strategy],
      [labels.prosecutionWeaknesses, data.aggregatedReport.prosecution_weaknesses],
      [labels.recommendations, data.aggregatedReport.recommendations],
    ];

    for (const [label, content] of sections) {
      if (!content) continue;
      writeSection(label, content);
    }

    if (data.aggregatedReport.full_report) {
      writeSection(labels.fullReport, data.aggregatedReport.full_report);
    }
  }

  // ═══════════════════════════════════════════════
  // SECTION 8: TIMELINE
  // ═══════════════════════════════════════════════
  if (data.timeline && data.timeline.length > 0) {
    doc.addPage();
    addReportHeader(doc, data.caseNumber, exportDate, lang, hasArmenianFont, logoData);
    yPosition = contentTopMargin;

    writeSectionHeader(labels.timeline);

    doc.setFontSize(9);
    data.timeline.forEach((event) => {
      checkPageOverflow(10);
      const eventTitle = `${new Date(event.timestamp).toLocaleString(locale)} \u2014 ${event.title}`;
      selectBoldFont(doc, eventTitle, hasArmenianFont);
      doc.text(eventTitle, margin, yPosition);
      yPosition += 5;
      if (event.description) {
        selectFont(doc, event.description, hasArmenianFont);
        const descLines = doc.splitTextToSize(`  ${event.description}`, maxWidth);
        for (const line of descLines) {
          checkPageOverflow(4);
          doc.text(line, margin, yPosition);
          yPosition += 4;
        }
      }
      yPosition += 2;
    });
  }

  // ── Add footer to all pages ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addReportFooter(doc, i, totalPages, hasArmenianFont);
  }

  const filename = `AI_Legal_${data.caseNumber}_Full_Report_${exportDate.toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}
