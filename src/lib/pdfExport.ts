import jsPDF from "jspdf";
import { stripMarkdown } from "./strip-markdown";
import { registerArmenianFont, setArmenianFont, setArmenianBoldFont, containsArmenian, containsCyrillic } from "./pdf/fontLoader";
import { loadLogoForPDF, addLogoToPage } from "./pdf/logoLoader";

interface AnalysisExportData {
  caseNumber: string;
  caseTitle: string;
  role: string;
  analysisText: string;
  sources?: Array<{ title: string; category: string; source_name: string }>;
  createdAt: Date;
  language?: "hy" | "en";
}

const DISCLAIMER_HY = "\u0546\u0531\u053D\u0531\u0536\u0533\u0548\u0552\u054D\u0553\u054A\u054F\u0545\u0548\u0552\u0546: \u054D\u0578\u0582\u0575\u0576 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0576\u0561\u056D\u0561\u057F\u0565\u057D\u057E\u0561\u056E \u0567 \u0574\u056B\u0561\u0575\u0576 \u057F\u0565\u0572\u0565\u056F\u0561\u057F\u057E\u0561\u056F\u0561\u0576 \u0576\u057A\u0561\u057F\u0561\u056F\u0576\u0565\u0580\u0578\u057E \u0587 \u0579\u056B \u0570\u0561\u0576\u0564\u056B\u057D\u0561\u0576\u0578\u0582\u0574 \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u056D\u0578\u0580\u0570\u0580\u0564\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576: \u0544\u056B\u0577\u057F \u056D\u0578\u0580\u0570\u0580\u0564\u0561\u056F\u0581\u0565\u0584 \u056C\u056B\u0581\u0565\u0576\u0566\u0561\u057E\u0578\u0580\u057E\u0561\u056E \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u056B \u0570\u0565\u057F: \u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u0568 \u056D\u0578\u0580\u0570\u0580\u0564\u0561\u057F\u057E\u0561\u056F\u0561\u0576 \u0565\u0576 \u0587 \u0578\u0579 \u0574\u0565\u056F \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u0578\u0582\u056A \u0579\u0578\u0582\u0576\u0565\u0576:";

const DISCLAIMER_EN = "DISCLAIMER: This analysis is for informational purposes only and does not constitute legal advice. Always consult with a licensed attorney for legal matters. The results are advisory and have no legal force.";

// Labels in native Armenian Unicode and English
const LABELS = {
  hy: {
    legalAnalysisReport: "\u053B\u054A\u0531\u054E\u0531\u0532\u0531\u0546\u0531\u053F\u0531\u0546 \u054E\u0535\u054A\u053C\u0548\u0552\u053E\u0548\u0552\u0539\u0545\u0548\u0552\u0546",
    caseNumber: "\u0533\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580:",
    caseTitle: "\u054E\u0565\u0580\u0576\u0561\u0563\u056B\u0580:",
    analysisRole: "\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0565\u0580:",
    date: "\u0531\u0574\u057D\u0561\u0569\u056B\u057E:",
    analysis: "\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    sourcesUsed: "\u0555\u0563\u057F\u0561\u0563\u0578\u0580\u056E\u057E\u0561\u056E \u0561\u0572\u0562\u0575\u0578\u0582\u0580\u0576\u0565\u0580",
    fullCaseAnalysis: "\u053C\u053B\u0531\u053F\u0531\u054F\u0531\u054A \u0533\u0548\u054A\u053E\u053B \u054E\u0535\u054A\u053C\u0548\u0552\u053E\u0548\u0552\u0539\u0545\u0548\u0552\u0546",
    case: "\u0533\u0578\u0580\u056E:",
    caseDetails: "\u0533\u0548\u054A\u053E\u053B \u0544\u0531\u0546\u054A\u0531\u0544\u0531\u054D\u0546\u0535\u054A",
    title: "\u054E\u0565\u0580\u0576\u0561\u0563\u056B\u0580:",
    status: "\u053F\u0561\u0580\u0563\u0561\u057E\u056B\u0573\u0561\u056F:",
    priority: "\u0531\u057C\u0561\u057B\u0576\u0561\u0570\u0565\u0580\u057F\u0578\u0582\u0569\u0575\u0578\u0582\u0576:",
    court: "\u0534\u0561\u057F\u0561\u0580\u0561\u0576:",
    courtDate: "\u0534\u0561\u057F\u0561\u056F\u0561\u0576 \u0576\u056B\u057D\u057F:",
    created: "\u054D\u057F\u0565\u0572\u056E\u057E\u0565\u056C \u0567:",
    updated: "\u0539\u0561\u0580\u0574\u0561\u0581\u057E\u0565\u056C \u0567:",
    description: "\u0546\u056F\u0561\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    facts: "\u0553\u0561\u057D\u057F\u0561\u056F\u0561\u0576 \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580",
    legalQuestion: "\u053B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u0561\u0580\u0581",
    notes: "\u0546\u0577\u0578\u0582\u0574\u0576\u0565\u0580",
    attachedFiles: "\u053F\u0581\u057E\u0561\u056E \u0586\u0561\u0575\u056C\u0565\u0580",
    timeline: "\u053A\u0561\u0574\u0561\u0576\u0561\u056F\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576"
  },
  en: {
    legalAnalysisReport: "LEGAL ANALYSIS REPORT",
    caseNumber: "Case Number:",
    caseTitle: "Case Title:",
    analysisRole: "Analysis Role:",
    date: "Date:",
    analysis: "Analysis",
    sourcesUsed: "Sources Used",
    fullCaseAnalysis: "COMPLETE CASE ANALYSIS",
    case: "Case:",
    caseDetails: "CASE DETAILS",
    title: "Title:",
    status: "Status:",
    priority: "Priority:",
    court: "Court:",
    courtDate: "Court Date:",
    created: "Created:",
    updated: "Updated:",
    description: "Description",
    facts: "Facts",
    legalQuestion: "Legal Question",
    notes: "Notes",
    attachedFiles: "Attached Files",
    timeline: "Timeline"
  }
};

// Role labels
const ROLE_LABELS: Record<string, Record<string, string>> = {
  advocate: { hy: "\u054A\u0561\u0577\u057F\u057A\u0561\u0576 (\u0553\u0561\u057D\u057F\u0561\u0562\u0561\u0576)", en: "Advocate (Defense)" },
  prosecutor: { hy: "\u0544\u0565\u0572\u0561\u0564\u0580\u0578\u0572", en: "Prosecutor" },
  judge: { hy: "\u0534\u0561\u057F\u0561\u057E\u0578\u0580", en: "Judge" },
  aggregator: { hy: "\u053C\u056B\u0561\u056F\u0561\u057F\u0561\u0580 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576", en: "Complete Analysis" },
  defense_analysis: { hy: "\u054A\u0561\u0577\u057F\u057A\u0561\u0576\u0561\u056F\u0561\u0576 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576", en: "Defense Analysis" },
  prosecution_analysis: { hy: "\u0544\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576", en: "Prosecution Analysis" },
  judge_analysis: { hy: "\u0534\u0561\u057F\u0561\u056F\u0561\u0576 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576", en: "Judicial Analysis" },
  evidence_admissibility: { hy: "\u0531\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056B \u0561\u0576\u0569\u0578\u0582\u0575\u056C\u0561\u057F\u0580\u0565\u056C\u056B\u0578\u0582\u0569\u0575\u0578\u0582\u0576", en: "Evidence Admissibility" },
  charge_qualification: { hy: "\u0544\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B \u0570\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576", en: "Charge Qualification" },
  procedural_violations: { hy: "\u0534\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580", en: "Procedural Violations" },
  substantive_law_violations: { hy: "\u0546\u0575\u0578\u0582\u0569\u0561\u056F\u0561\u0576 \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580", en: "Substantive Violations" },
  fair_trial_and_rights: { hy: "\u0531\u0580\u0564\u0561\u0580 \u0564\u0561\u057F\u0561\u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576", en: "Fair Trial & Rights" }
};

// Determine the best font to use based on text content and set text color to black
function selectFont(doc: jsPDF, text: string, hasArmenianFont: boolean): void {
  if (hasArmenianFont && (containsArmenian(text) || containsCyrillic(text))) {
    setArmenianBoldFont(doc);
  } else {
    doc.setFont("helvetica", "normal");
  }
  // Always ensure text is black after font change
  doc.setTextColor(0, 0, 0);
}

function selectBoldFont(doc: jsPDF, text: string, hasArmenianFont: boolean): void {
  if (hasArmenianFont && (containsArmenian(text) || containsCyrillic(text))) {
    setArmenianBoldFont(doc);
  } else {
    doc.setFont("helvetica", "bold");
  }
  // Always ensure text is black after font change
  doc.setTextColor(0, 0, 0);
}


// Helper function to add header with case number and export date
function addHeader(doc: jsPDF, caseNumber: string, exportDate: Date, language: "hy" | "en" = "hy", hasArmenianFont: boolean = false, logoData?: string | null) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  
  // Add centered logo
  if (logoData) {
    addLogoToPage(doc, logoData);
  }
  
  doc.saveGraphicsState();
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  
  // Brand name
  doc.setFont("helvetica", "normal");
  doc.text("AI Legal Armenia", margin, 28);
  
  const locale = language === 'hy' ? 'hy-AM' : 'en-US';
  const dateStr = exportDate.toLocaleDateString(locale);
  const caseLabel = language === 'hy' ? '\u0533\u0578\u0580\u056E \u2116' : 'Case #';
  const caseHeaderText = `${caseLabel} ${caseNumber}`;
  
  if (hasArmenianFont && (containsArmenian(caseHeaderText) || containsCyrillic(caseHeaderText) || containsArmenian(caseNumber))) {
    setArmenianFont(doc);
  } else {
    doc.setFont("helvetica", "normal");
  }
  doc.text(caseHeaderText, pageWidth / 2, 28, { align: "center" });
  
  doc.setFont("helvetica", "normal");
  doc.text(dateStr, pageWidth - margin, 28, { align: "right" });
  doc.restoreGraphicsState();
}

// Helper function to add footer with disclaimer
function addFooter(doc: jsPDF, pageNumber: number, totalPages: number, hasArmenianFont: boolean = false) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const footerY = pageHeight - 25;
  
  doc.saveGraphicsState();
  
  // Separator line
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);
  
  // Disclaimer text
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  selectFont(doc, DISCLAIMER_EN, hasArmenianFont);
  const disclaimerLines = doc.splitTextToSize(DISCLAIMER_EN, maxWidth);
  doc.text(disclaimerLines, margin, footerY);
  
  // Page number
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`${pageNumber} / ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: "center" });
  
  doc.restoreGraphicsState();
}

interface CaseDetailExportData {
  caseNumber: string;
  caseTitle: string;
  description?: string;
  facts?: string;
  legalQuestion?: string;
  status: string;
  priority: string;
  courtName?: string;
  courtDate?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  files?: Array<{ original_filename: string; file_size: number; created_at: string }>;
  timeline?: Array<{ type: string; title: string; description?: string; timestamp: string }>;
  userName?: string;
  language?: "hy" | "en";
}

export async function exportAnalysisToPDF(data: AnalysisExportData): Promise<void> {
  const doc = new jsPDF();
  const exportDate = new Date();
  const lang = data.language || "hy";
  const labels = LABELS[lang];
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const contentTopMargin = 35;
  const contentBottomMargin = 35;
  
  // Try to load Armenian font
  let hasArmenianFont = false;
  try {
    await registerArmenianFont(doc);
    hasArmenianFont = true;
    console.log("Armenian font loaded successfully");
  } catch (error) {
    console.warn("Could not load Armenian font, using fallback:", error);
  }
  
  // Load logo
  const logoData = await loadLogoForPDF();
  
  // Add header to first page
  addHeader(doc, data.caseNumber, exportDate, lang, hasArmenianFont, logoData);
  
  // Title - "Վերdelays" centered under logo
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  selectBoldFont(doc, labels.analysis, hasArmenianFont);
  doc.text(labels.analysis, pageWidth / 2, 35, { align: "center" });
  
  // Role - centered under title
  const roleText = ROLE_LABELS[data.role]?.[lang] || data.role;
  doc.setFontSize(12);
  selectBoldFont(doc, roleText, hasArmenianFont);
  doc.text(roleText, pageWidth / 2, 43, { align: "center" });
  
  let yPosition = 50;
  
  // Separator line
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 8;
  
  // Analysis content — bold, size 13 for readability
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  const cleanAnalysis = stripMarkdown(data.analysisText);
  selectBoldFont(doc, cleanAnalysis, hasArmenianFont);
  
  // Split analysis text into lines
  const analysisLines = doc.splitTextToSize(cleanAnalysis, maxWidth);
  
  for (const line of analysisLines) {
    if (yPosition > pageHeight - contentBottomMargin) {
      doc.addPage();
      addHeader(doc, data.caseNumber, exportDate, lang, hasArmenianFont, logoData);
      yPosition = contentTopMargin;
      doc.setFontSize(13);
      doc.setTextColor(0, 0, 0);
      // Re-apply bold font after page break
      selectBoldFont(doc, line, hasArmenianFont);
    }
    doc.setTextColor(0, 0, 0);
    doc.text(line, margin, yPosition);
    yPosition += 7;
  }
  
  // Sources
  if (data.sources && data.sources.length > 0) {
    yPosition += 10;
    
    if (yPosition > pageHeight - contentBottomMargin - 20) {
      doc.addPage();
      addHeader(doc, data.caseNumber, exportDate, lang, hasArmenianFont, logoData);
      yPosition = contentTopMargin;
    }
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    selectBoldFont(doc, labels.sourcesUsed, hasArmenianFont);
    doc.text(labels.sourcesUsed, margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    
    data.sources.forEach((source, index) => {
      if (yPosition > pageHeight - contentBottomMargin) {
        doc.addPage();
        addHeader(doc, data.caseNumber, exportDate, lang, hasArmenianFont, logoData);
        yPosition = contentTopMargin;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        selectBoldFont(doc, "", hasArmenianFont);
      }
      const sourceText = `${index + 1}. ${source.title} (${source.category}) - ${source.source_name}`;
      selectBoldFont(doc, sourceText, hasArmenianFont);
      doc.text(sourceText, margin, yPosition);
      yPosition += 6;
    });
  }
  
  // Add footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages, hasArmenianFont);
  }
  
  // Save
  const filename = `AI_Legal_${data.caseNumber}_${data.role}_${exportDate.toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}

export async function exportMultipleAnalysesToPDF(
  caseNumber: string,
  caseTitle: string,
  analyses: Array<{ role: string; text: string; sources?: Array<{ title: string; category: string; source_name: string }> }>,
  language: "hy" | "en" = "hy"
): Promise<void> {
  const doc = new jsPDF();
  const exportDate = new Date();
  const labels = LABELS[language];
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const contentTopMargin = 35;
  const contentBottomMargin = 35;
  
  // Try to load Armenian font
  let hasArmenianFont = false;
  try {
    await registerArmenianFont(doc);
    hasArmenianFont = true;
  } catch (error) {
    console.warn("Could not load Armenian font, using fallback:", error);
  }
  
  // Load logo
  const logoData = await loadLogoForPDF();
  
  // Title page
  addHeader(doc, caseNumber, exportDate, language, hasArmenianFont, logoData);
  
  // Brand name - use bold helvetica
  doc.setFontSize(24);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text("Ai Legal Armenia", pageWidth / 2, 50, { align: "center" });
  
  // Main title - Armenian text
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  if (hasArmenianFont) {
    setArmenianFont(doc);
  }
  doc.text(labels.fullCaseAnalysis, pageWidth / 2, 75, { align: "center" });
  
  // Case number with Armenian label
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  const caseText = `${labels.case} ${caseNumber}`;
  if (hasArmenianFont) {
    setArmenianFont(doc);
  }
  doc.text(caseText, pageWidth / 2, 100, { align: "center" });
  
  // Case title - likely Armenian
  if (hasArmenianFont) {
    setArmenianFont(doc);
  }
  const titleLines = doc.splitTextToSize(caseTitle, maxWidth);
  doc.text(titleLines, pageWidth / 2, 115, { align: "center" });
  
  // Date - numeric, use helvetica
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  const locale = language === 'hy' ? 'hy-AM' : 'en-US';
  doc.text(exportDate.toLocaleDateString(locale), pageWidth / 2, 140, { align: "center" });
  
  // Each analysis on new page
  for (const analysis of analyses) {
    doc.addPage();
    
    // Header
    addHeader(doc, caseNumber, exportDate, language, hasArmenianFont, logoData);
    
    // Role title centered under logo
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    const roleText = ROLE_LABELS[analysis.role]?.[language] || analysis.role;
    selectBoldFont(doc, roleText, hasArmenianFont);
    doc.text(roleText, pageWidth / 2, 35, { align: "center" });
    
    let yPosition = 45;
    
    // Analysis content — bold, size 12
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    selectBoldFont(doc, analysis.text, hasArmenianFont);
    const analysisLines = doc.splitTextToSize(analysis.text, maxWidth);
    
    for (const line of analysisLines) {
      if (yPosition > pageHeight - contentBottomMargin) {
        doc.addPage();
        addHeader(doc, caseNumber, exportDate, language, hasArmenianFont, logoData);
        yPosition = contentTopMargin;
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        selectBoldFont(doc, line, hasArmenianFont);
      }
      doc.text(line, margin, yPosition);
      yPosition += 6;
    }
    
    // Sources
    if (analysis.sources && analysis.sources.length > 0) {
      yPosition += 10;
      
      if (yPosition > pageHeight - contentBottomMargin - 20) {
        doc.addPage();
        addHeader(doc, caseNumber, exportDate, language, hasArmenianFont, logoData);
        yPosition = contentTopMargin;
      }
      
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      selectBoldFont(doc, labels.sourcesUsed, hasArmenianFont);
      doc.text(labels.sourcesUsed, margin, yPosition);
      yPosition += 8;
      
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      
      analysis.sources.forEach((source, index) => {
        if (yPosition > pageHeight - contentBottomMargin) {
          doc.addPage();
          addHeader(doc, caseNumber, exportDate, language, hasArmenianFont, logoData);
          yPosition = contentTopMargin;
          doc.setFontSize(9);
          doc.setTextColor(0, 0, 0);
          if (hasArmenianFont) {
            setArmenianFont(doc);
          }
        }
        const sourceText = `${index + 1}. ${source.title} (${source.category}) - ${source.source_name}`;
        doc.text(sourceText, margin, yPosition);
        yPosition += 5;
      });
    }
  }
  
  // Add footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages, hasArmenianFont);
  }
  
  const filename = `AI_Legal_${caseNumber}_Full_Analysis_${exportDate.toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}

export async function exportCaseDetailToPDF(data: CaseDetailExportData): Promise<void> {
  const doc = new jsPDF();
  const exportDate = new Date();
  const lang = data.language || "hy";
  const labels = LABELS[lang];
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const contentTopMargin = 35;
  const contentBottomMargin = 35;
  
  // Try to load Armenian font
  let hasArmenianFont = false;
  try {
    await registerArmenianFont(doc);
    hasArmenianFont = true;
  } catch (error) {
    console.warn("Could not load Armenian font, using fallback:", error);
  }
  
  // Load logo
  const logoData = await loadLogoForPDF();
  
  // Add header
  addHeader(doc, data.caseNumber, exportDate, lang, hasArmenianFont, logoData);
  
  let yPosition = 35;
  
  // Check page overflow helper
  const checkPageOverflow = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - contentBottomMargin) {
      doc.addPage();
      addHeader(doc, data.caseNumber, exportDate, lang, hasArmenianFont, logoData);
      yPosition = contentTopMargin;
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      // Re-apply Armenian font after page break
      if (hasArmenianFont) {
        setArmenianFont(doc);
      }
      return true;
    }
    return false;
  };
  
  // Title
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  selectBoldFont(doc, labels.caseDetails, hasArmenianFont);
  doc.text(labels.caseDetails, pageWidth / 2, yPosition, { align: "center" });
  yPosition += 15;
  
  // Case Number and Title
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  selectBoldFont(doc, labels.caseNumber, hasArmenianFont);
  doc.text(labels.caseNumber, margin, yPosition);
  selectFont(doc, data.caseNumber, hasArmenianFont);
  doc.text(data.caseNumber, margin + 40, yPosition);
  yPosition += 8;
  
  selectBoldFont(doc, labels.title, hasArmenianFont);
  doc.text(labels.title, margin, yPosition);
  selectFont(doc, data.caseTitle, hasArmenianFont);
  const titleLines = doc.splitTextToSize(data.caseTitle, maxWidth - 30);
  doc.text(titleLines, margin + 30, yPosition);
  yPosition += titleLines.length * 6 + 8;
  
  // Status and Priority
  checkPageOverflow(16);
  selectBoldFont(doc, labels.status, hasArmenianFont);
  doc.text(labels.status, margin, yPosition);
  selectFont(doc, data.status, hasArmenianFont);
  doc.text(data.status, margin + 35, yPosition);
  yPosition += 8;
  
  selectBoldFont(doc, labels.priority, hasArmenianFont);
  doc.text(labels.priority, margin, yPosition);
  selectFont(doc, data.priority, hasArmenianFont);
  doc.text(data.priority, margin + 55, yPosition);
  yPosition += 8;
  
  // Court information
  if (data.courtName) {
    checkPageOverflow(8);
    selectBoldFont(doc, labels.court, hasArmenianFont);
    doc.text(labels.court, margin, yPosition);
    selectFont(doc, data.courtName, hasArmenianFont);
    const courtLines = doc.splitTextToSize(data.courtName, maxWidth - 30);
    doc.text(courtLines, margin + 30, yPosition);
    yPosition += courtLines.length * 6 + 4;
  }
  
  if (data.courtDate) {
    checkPageOverflow(8);
    selectBoldFont(doc, labels.courtDate, hasArmenianFont);
    doc.text(labels.courtDate, margin, yPosition);
    selectFont(doc, data.courtDate, hasArmenianFont);
    doc.text(data.courtDate, margin + 40, yPosition);
    yPosition += 8;
  }
  
  // Dates
  checkPageOverflow(16);
  const locale = lang === 'hy' ? 'hy-AM' : 'en-US';
  selectBoldFont(doc, labels.created, hasArmenianFont);
  doc.text(labels.created, margin, yPosition);
  selectFont(doc, "", hasArmenianFont);
  doc.text(data.createdAt.toLocaleString(locale), margin + 35, yPosition);
  yPosition += 8;
  
  selectBoldFont(doc, labels.updated, hasArmenianFont);
  doc.text(labels.updated, margin, yPosition);
  selectFont(doc, "", hasArmenianFont);
  doc.text(data.updatedAt.toLocaleString(locale), margin + 35, yPosition);
  yPosition += 15;
  
  // Separator
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 10;
  
  // Description
  if (data.description) {
    checkPageOverflow(20);
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    selectBoldFont(doc, labels.description, hasArmenianFont);
    doc.text(labels.description, margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    selectFont(doc, data.description, hasArmenianFont);
    const descLines = doc.splitTextToSize(data.description, maxWidth);
    
    for (const line of descLines) {
      checkPageOverflow(5);
      doc.text(line, margin, yPosition);
      yPosition += 5;
    }
    yPosition += 10;
  }
  
  // Facts
  if (data.facts) {
    checkPageOverflow(20);
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    selectBoldFont(doc, labels.facts, hasArmenianFont);
    doc.text(labels.facts, margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    selectFont(doc, data.facts, hasArmenianFont);
    const factsLines = doc.splitTextToSize(data.facts, maxWidth);
    
    for (const line of factsLines) {
      checkPageOverflow(5);
      doc.text(line, margin, yPosition);
      yPosition += 5;
    }
    yPosition += 10;
  }
  
  // Legal Question
  if (data.legalQuestion) {
    checkPageOverflow(20);
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    selectBoldFont(doc, labels.legalQuestion, hasArmenianFont);
    doc.text(labels.legalQuestion, margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    selectFont(doc, data.legalQuestion, hasArmenianFont);
    const legalLines = doc.splitTextToSize(data.legalQuestion, maxWidth);
    
    for (const line of legalLines) {
      checkPageOverflow(5);
      doc.text(line, margin, yPosition);
      yPosition += 5;
    }
    yPosition += 10;
  }
  
  // Notes
  if (data.notes) {
    checkPageOverflow(20);
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    selectBoldFont(doc, labels.notes, hasArmenianFont);
    doc.text(labels.notes, margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    selectFont(doc, data.notes, hasArmenianFont);
    const notesLines = doc.splitTextToSize(data.notes, maxWidth);
    
    for (const line of notesLines) {
      checkPageOverflow(5);
      doc.text(line, margin, yPosition);
      yPosition += 5;
    }
    yPosition += 10;
  }
  
  // Attached Files
  if (data.files && data.files.length > 0) {
    checkPageOverflow(20);
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    selectBoldFont(doc, labels.attachedFiles, hasArmenianFont);
    doc.text(labels.attachedFiles, margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    
    data.files.forEach((file, index) => {
      checkPageOverflow(6);
      const sizeKB = (file.file_size / 1024).toFixed(2);
      const fileText = `${index + 1}. ${file.original_filename} (${sizeKB} KB) - ${new Date(file.created_at).toLocaleDateString(locale)}`;
      selectFont(doc, fileText, hasArmenianFont);
      doc.text(fileText, margin, yPosition);
      yPosition += 5;
    });
    yPosition += 10;
  }
  
  // Timeline
  if (data.timeline && data.timeline.length > 0) {
    checkPageOverflow(20);
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    selectBoldFont(doc, labels.timeline, hasArmenianFont);
    doc.text(labels.timeline, margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    
    data.timeline.forEach((event) => {
      checkPageOverflow(10);
      const eventTitle = `${new Date(event.timestamp).toLocaleString(locale)} - ${event.title}`;
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
  
  // Add footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages, hasArmenianFont);
  }
  
// Save
  const filename = `AI_Legal_${data.caseNumber}_Details_${exportDate.toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}

// =============================================================================
// COMPLAINT / CLAIM PDF EXPORT
// =============================================================================

export interface ComplaintExportData {
  title: string;
  complaintTypeId?: string;
  content: string;
  language?: "hy" | "ru" | "en";
}

export async function exportComplaintToPDF(data: ComplaintExportData): Promise<void> {
  const doc = new jsPDF();
  const exportDate = new Date();
  const lang: "hy" | "en" = data.language === "en" ? "en" : "hy";

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const contentTopMargin = 38;
  const contentBottomMargin = 35;

  // Load Armenian font
  let hasArmenianFont = false;
  try {
    await registerArmenianFont(doc);
    hasArmenianFont = true;
  } catch (e) {
    console.warn("Armenian font not loaded:", e);
  }

  // Load logo
  const logoData = await loadLogoForPDF();

  // ── Page 1 header ──
  addHeader(doc, data.complaintTypeId || "complaint", exportDate, lang, hasArmenianFont, logoData);

  // Title
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  selectBoldFont(doc, data.title, hasArmenianFont);
  const titleLines = doc.splitTextToSize(data.title, maxWidth);
  doc.text(titleLines, pageWidth / 2, 36, { align: "center" });

  let yPosition = 36 + titleLines.length * 7 + 4;

  // Separator
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 8;

  // Content lines
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  const cleanContent = stripMarkdown(data.content);
  selectFont(doc, cleanContent, hasArmenianFont);
  const contentLines = doc.splitTextToSize(cleanContent, maxWidth);

  for (const line of contentLines) {
    if (yPosition > pageHeight - contentBottomMargin) {
      doc.addPage();
      addHeader(doc, data.complaintTypeId || "complaint", exportDate, lang, hasArmenianFont, logoData);
      yPosition = contentTopMargin;
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      if (hasArmenianFont) setArmenianFont(doc);
    }
    doc.text(line, margin, yPosition);
    yPosition += 5;
  }

  // Footers on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages, hasArmenianFont);
  }

  const safeId = (data.complaintTypeId || "complaint").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `AI_Legal_complaint_${safeId}_${exportDate.toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}
