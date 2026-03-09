import jsPDF from "jspdf";
import { stripMarkdown } from "./strip-markdown";
import { registerArmenianFont, setArmenianFont, setArmenianBoldFont, containsArmenian, containsCyrillic } from "./pdf/fontLoader";
import { loadLogoForPDF, addLogoToPage } from "./pdf/logoLoader";

interface DocumentExportData {
  title: string;
  content: string;
  recipientName?: string;
  recipientOrganization?: string;
  senderName?: string;
  createdAt: Date;
  language?: "hy" | "ru" | "en";
}

const DISCLAIMER = {
  hy: "\u0546\u0531\u053D\u0531\u0536\u0533\u0548\u0552\u054D\u0553\u054A\u054F\u0545\u0548\u0552\u0546: \u054D\u0578\u0582\u0575\u0576 \u0583\u0561\u057D\u057f\u0561\u0569\u0578\u0582\u0572\u0569\u0568 \u0576\u0561\u056D\u0561\u057f\u0565\u057d\u057e\u0561\u056e \u0567 AI-\u056b \u0585\u0563\u0576\u0578\u0582\u0569\u0575\u0561\u0574\u0562 \u0587 \u056f\u0561\u0580\u0578\u0572 \u0567 \u057a\u0561\u0570\u0561\u0576\u057b\u0565\u056c \u056b\u0580\u0561\u057e\u0561\u0562\u0561\u0576\u0561\u056f\u0561\u0576 \u057d\u057f\u0578\u0582\u0563\u0578\u0582\u0574\u0589",
  ru: "\u041E\u0422\u041A\u0410\u0417 \u041E\u0422 \u041E\u0422\u0412\u0415\u0422\u0421\u0422\u0412\u0415\u041D\u041D\u041E\u0421\u0422\u0418: \u042D\u0442\u043E\u0442 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u0441\u043E\u0437\u0434\u0430\u043D \u0441 \u043F\u043E\u043C\u043E\u0449\u044C\u044E AI \u0438 \u043C\u043E\u0436\u0435\u0442 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u0442\u044C \u044E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438.",
  en: "DISCLAIMER: This document was generated with AI assistance and may require legal review.",
};

const LABELS = {
  hy: {
    document: "\u0553\u0531\u054D\u054F\u0531\u0539\u0548\u0552\u0542\u0539",
    to: "\u054D\u057f\u0561\u0581\u0578\u0572:",
    from: "\u0548\u0582\u0572\u0561\u0580\u056f\u0578\u0572:",
    date: "\u0531\u0574\u057d\u0561\u0569\u056b\u057e:",
  },
  ru: {
    document: "\u0414\u041E\u041A\u0423\u041C\u0415\u041D\u0422",
    to: "\u041A\u043E\u043C\u0443:",
    from: "\u041E\u0442:",
    date: "\u0414\u0430\u0442\u0430:",
  },
  en: {
    document: "DOCUMENT",
    to: "To:",
    from: "From:",
    date: "Date:",
  },
};

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

function addWatermark(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  doc.saveGraphicsState();
  doc.setFontSize(50);
  doc.setTextColor(200, 200, 200);
  doc.setFont("helvetica", "normal");
  
  const watermarkText = "Ai Legal Armenia";
  doc.text(watermarkText, pageWidth / 2, pageHeight / 2, {
    align: "center",
    angle: 45,
  });
  
  doc.restoreGraphicsState();
}

function addHeader(doc: jsPDF, title: string, exportDate: Date, language: "hy" | "ru" | "en", hasArmenianFont: boolean, logoData?: string | null) {
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
  
  const locale = language === 'hy' ? 'hy-AM' : language === 'ru' ? 'ru-RU' : 'en-US';
  const dateStr = exportDate.toLocaleDateString(locale);
  doc.text(dateStr, pageWidth - margin, 28, { align: "right" });
  
  doc.restoreGraphicsState();
}

function addFooter(doc: jsPDF, pageNumber: number, totalPages: number, language: "hy" | "ru" | "en", hasArmenianFont: boolean) {
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
  selectFont(doc, DISCLAIMER[language], hasArmenianFont);
  const disclaimerLines = doc.splitTextToSize(DISCLAIMER[language], maxWidth);
  doc.text(disclaimerLines, margin, footerY);
  
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`${pageNumber} / ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: "center" });
  
  doc.restoreGraphicsState();
}

export async function exportDocumentToPDF(data: DocumentExportData): Promise<void> {
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
  
  let hasArmenianFont = false;
  try {
    await registerArmenianFont(doc);
    hasArmenianFont = true;
  } catch (error) {
    console.warn("Could not load Armenian font, using fallback:", error);
  }
  
  // Load logo
  const logoData = await loadLogoForPDF();
  
  // Add watermark
  addWatermark(doc);
  
  // Add header with logo
  addHeader(doc, data.title, exportDate, lang, hasArmenianFont, logoData);
  
  let yPosition = 35;
  
  // Title
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  selectBoldFont(doc, data.title, hasArmenianFont);
  const titleLines = doc.splitTextToSize(data.title, maxWidth);
  doc.text(titleLines, pageWidth / 2, yPosition, { align: "center" });
  yPosition += titleLines.length * 8 + 10;
  
  // Meta info
  doc.setFontSize(10);
  
  if (data.recipientOrganization || data.recipientName) {
    selectBoldFont(doc, labels.to, hasArmenianFont);
    doc.text(labels.to, margin, yPosition);
    selectFont(doc, data.recipientOrganization || data.recipientName || "", hasArmenianFont);
    doc.text(data.recipientOrganization || data.recipientName || "", margin + 20, yPosition);
    yPosition += 6;
  }
  
  if (data.senderName) {
    selectBoldFont(doc, labels.from, hasArmenianFont);
    doc.text(labels.from, margin, yPosition);
    selectFont(doc, data.senderName, hasArmenianFont);
    doc.text(data.senderName, margin + 15, yPosition);
    yPosition += 6;
  }
  
  selectBoldFont(doc, labels.date, hasArmenianFont);
  doc.text(labels.date, margin, yPosition);
  const locale = lang === 'hy' ? 'hy-AM' : lang === 'ru' ? 'ru-RU' : 'en-US';
  const dateStr = data.createdAt.toLocaleDateString(locale);
  doc.setFont("helvetica", "normal");
  doc.text(dateStr, margin + 25, yPosition);
  yPosition += 15;
  
  // Separator
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 10;
  
  // Content
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  const cleanContent = stripMarkdown(data.content);
  selectBoldFont(doc, cleanContent, hasArmenianFont);
  
  const contentLines = doc.splitTextToSize(cleanContent, maxWidth);
  
  for (const line of contentLines) {
    if (yPosition > pageHeight - contentBottomMargin) {
      doc.addPage();
      addWatermark(doc);
      addHeader(doc, data.title, exportDate, lang, hasArmenianFont, logoData);
      yPosition = 35;
      doc.setFontSize(13);
      doc.setTextColor(0, 0, 0);
      selectBoldFont(doc, line, hasArmenianFont);
    }
    doc.setTextColor(0, 0, 0);
    doc.text(line, margin, yPosition);
    yPosition += 7;
  }
  
  // Add footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages, lang, hasArmenianFont);
  }
  
  // Save
  const safeTitle = data.title.replace(/[^a-zA-Z0-9\u0400-\u04FF\u0530-\u058F]/g, '_').substring(0, 50);
  const filename = `AI_Legal_${safeTitle}_${exportDate.toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}
