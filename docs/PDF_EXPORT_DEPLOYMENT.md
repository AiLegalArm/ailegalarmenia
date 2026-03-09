# PDF Export - Deployment Guide

## Overview

This document describes the improved PDF export functionality for the "Ai Legal Armenia" application and how to deploy it.

## New Features

### 1. **Watermark on Every Page**
- Semi-transparent "Ai Legal Armenia" text displayed diagonally (45°) across the center of every page
- Color: Light gray (RGB: 200, 200, 200)
- Font size: 50pt, bold
- Applied to all export types

### 2. **Header on Every Page**
- Left: "Ai Legal Armenia" branding
- Center: Case number (e.g., "Գdelays: CASE-001" in Armenian or "Case: CASE-001" in English)
- Right: Export date in localized format
- Font size: 9pt, gray color
- Positioned at top of every page (y: 12)

### 3. **Footer on Every Page**
- Disclaimer text in Armenian or English (depending on language setting)
- Page numbers in format "X / Y" centered at bottom
- Separator line above footer
- Font size: 7pt for disclaimer, 8pt for page numbers
- Positioned at bottom of every page

### 4. **Enhanced Aggregator Export Support**
- `exportMultipleAnalysesToPDF()` function supports exporting all role analyses:
  - Advocate (Defense) - Փdelays: (Պdelays:պdelays:delays:)
  - Prosecutor - Մdelays:delays:delays:delays:
  - Judge - Դdelay:delays:delays:delays:
  - Aggregator - Լdelay:delays:delays:delays: delays:delays:delays:delays:delays:delays:delays:
- Each role's analysis starts on a new page with its own section
- All pages include consistent branding, headers, and footers

### 5. **Improved Code Structure**
- Reusable helper functions:
  - `addWatermark(doc: jsPDF)` - Adds watermark to current page
  - `addHeader(doc, caseNumber, exportDate, language)` - Adds header with case info
  - `addFooter(doc, disclaimer, pageNumber, totalPages)` - Adds footer with disclaimer and page numbers
- Consistent spacing and margins across all export types
- Better page overflow handling with proper content margins

## Export Functions

### 1. `exportAnalysisToPDF(data: AnalysisExportData)`
Exports a single AI analysis (for one role) to PDF.

**Features:**
- Title page with case information
- Analysis content with proper pagination
- Source references (if available)
- Watermark, header, and footer on all pages

**Usage:**
```typescript
exportAnalysisToPDF({
  caseNumber: "CASE-001",
  caseTitle: "Sample Case Title",
  role: "advocate",
  analysisText: "Analysis content...",
  sources: [...],
  createdAt: new Date(),
  language: "hy" // or "en"
});
```

### 2. `exportMultipleAnalysesToPDF(caseNumber, caseTitle, analyses, language)`
Exports multiple role analyses (aggregator export) to a single PDF document.

**Features:**
- Cover page with case overview
- Separate sections for each role analysis
- Consistent formatting across all sections
- Watermark, header, and footer on all pages

**Usage:**
```typescript
exportMultipleAnalysesToPDF(
  "CASE-001",
  "Sample Case Title",
  [
    { role: "advocate", text: "...", sources: [...] },
    { role: "prosecutor", text: "...", sources: [...] },
    { role: "judge", text: "...", sources: [...] }
  ],
  "hy"
);
```

### 3. `exportCaseDetailToPDF(data: CaseDetailExportData)`
Exports complete case details including metadata, timeline, and attached files.

**Features:**
- Case metadata (number, title, status, priority, etc.)
- Court information
- Dates (created, updated)
- Description, facts, legal questions, notes
- Attached files list
- Timeline of events
- Watermark, header, and footer on all pages

## Deployment Instructions

### For AiLegalArmenia Platform (Recommended)

This application is deployed using the AiLegalArmenia platform. To deploy the PDF export improvements:

1. **Automatic Deployment (via AiLegalArmenia)**
   - Changes pushed to the repository are automatically detected by the platform
   - Navigate to https://lovable.dev/projects/[YOUR_PROJECT_ID]
   - Click **Share** → **Publish** to deploy the latest changes
   - The deployment process typically takes 2-5 minutes

2. **Custom Domain (Optional)**
   - Go to Project → Settings → Domains
   - Click "Connect Domain"
   - Follow the instructions to configure DNS settings
   - Documentation: https://docs.lovable.dev/features/custom-domain

### For Manual Deployment (Alternative)

If you prefer to deploy manually to another hosting provider:

1. **Build the Application**
   ```bash
   npm install
   npm run build
   ```

2. **Deploy the `dist` folder**
   
   The build creates a `dist` folder containing:
   - Optimized JavaScript bundles
   - CSS files
   - HTML entry point
   - Service worker for PWA support
   - Assets

3. **Hosting Options**
   
   a) **Netlify**
   ```bash
   npm install -g netlify-cli
   netlify deploy --prod --dir=dist
   ```

   b) **Vercel**
   ```bash
   npm install -g vercel
   vercel --prod
   ```

   c) **GitHub Pages**
   - Enable GitHub Pages in repository settings
   - Set source to `gh-pages` branch
   - Use GitHub Actions to build and deploy

   d) **Custom Server (Node.js/Nginx)**
   - Copy `dist` folder to server
   - Configure web server to serve static files
   - Example Nginx config:
     ```nginx
     server {
       listen 80;
       server_name yourdomain.com;
       root /path/to/dist;
       index index.html;
       
       location / {
         try_files $uri $uri/ /index.html;
       }
     }
     ```

## Environment Configuration

The PDF export functionality uses the following dependencies:
- `jspdf` ^4.0.0 - PDF generation library

No additional environment variables are required for PDF export functionality.

## Testing

To verify the PDF export improvements:

1. **Local Testing**
   ```bash
   npm install
   npm run dev
   ```
   
2. **Test Cases to Verify**
   - Export a single analysis (advocate, prosecutor, or judge role)
   - Export multiple analyses (aggregator/full analysis)
   - Export case details
   - Verify watermark appears on all pages
   - Verify headers show correct case number and date
   - Verify footers show disclaimer and page numbers
   - Test both Armenian (hy) and English (en) language options

3. **Visual Verification**
   - Open exported PDFs and check:
     - Watermark visibility and positioning (diagonal, centered, semi-transparent)
     - Header content (branding, case number, date)
     - Footer content (disclaimer, page numbers)
     - Content doesn't overlap with headers/footers
     - Proper pagination

## Rollback Procedure

If issues are discovered after deployment:

1. **Via AiLegalArmenia**
   - Navigate to your AiLegalArmenia project
   - Go to version history
   - Select the previous stable version
   - Click "Publish" to rollback

2. **Via Git**
   ```bash
   git revert HEAD
   git push origin main
   ```

## Support and Troubleshooting

### Common Issues

1. **Watermark not visible**
   - Check browser PDF viewer settings
   - Try opening in different PDF viewer (Adobe Reader, Chrome, Firefox)
   - Verify jsPDF version is 4.0.0 or higher

2. **Armenian text not displaying correctly**
   - This is a known limitation of jsPDF with Unicode characters
   - Text is stored correctly even if rendered as boxes in some viewers
   - Consider using custom fonts if this is critical

3. **Page numbers incorrect**
   - Ensure `getNumberOfPages()` is called after all content is added
   - Footer is added in a separate loop after document is complete

### Contact

For issues or questions:
- Repository: https://github.com/AiLegalArm/armenia-ai-justice
- Issues: https://github.com/AiLegalArm/armenia-ai-justice/issues

## Version History

- **2026-01-26**: Initial PDF export improvements
  - Added semi-transparent diagonal watermark on all pages
  - Added header with case number and export date on all pages
  - Added footer with disclaimer and page numbers on all pages
  - Enhanced aggregator export support
  - Refactored code with reusable helper functions
