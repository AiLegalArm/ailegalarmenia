# PDF Export Visual Example

This document shows how the improved PDF exports look with all the new features.

## Page Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER (on every page)                                          │
│ ─────────────────────────────────────────────────────────────── │
│ Ai Legal Armenia    Գործ: CASE-001         26.01.2026          │ ← 9pt gray
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                    ԻՐԱՎԱԲԱՆԱԿԱՆ ՎԵՐԼՈՒԾՈՒԹՅՈՒՆ                 │ ← Title
│                                                                 │
│ Գործի համար: CASE-001                                          │
│ Գործի վերնագիր: Նմուշային գործի վերնագիր...                   │
│ Վերլուծության դեր: Փաստաբան (Պաշտպան)                         │
│ Ամսաթիվ: 26.01.2026                                            │
│                                                                 │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ Վերլուծություն                                                  │ ← Section header
│                                                                 │
│ Lorem ipsum dolor sit amet, consectetur adipiscing elit...     │
│ Sed do eiusmod tempor incididunt ut labore et dolore...        │
│ Ut enim ad minim veniam, quis nostrud exercitation...          │
│                                                                 │
│                    Ai Legal Armenia ↗                           │ ← WATERMARK
│                                                                 │ ← 50pt, diagonal
│ Duis aute irure dolor in reprehenderit in voluptate...         │ ← Light gray
│ Excepteur sint occaecat cupidatat non proident...              │ ← Semi-transparent
│                                                                 │
│ Օգտագործված աղբյուրներ                                        │
│ 1. ՀՀ Սահմանադրություն (Սահմանադրական իրավունք)...            │
│ 2. ՀՀ Քրեական օրենսգիրք (Քրեական իրավունք)...                │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ FOOTER (on every page)                                          │
│ ─────────────────────────────────────────────────────────────── │ ← Separator line
│ ⚠️ ՆԱԽԱԶԳՈՒՇՈՒՄ: Սույն վերլուծությունը նախատեսված է միայն      │ ← 7pt gray
│ տեղեկատվական նպատակներով և չի հանդիսանում իրավաբանական...   │
│                         1 / 3                                   │ ← 8pt page number
└─────────────────────────────────────────────────────────────────┘
```

## Features Highlighted

### 1. Watermark (Center of Page)
```
        45° diagonal
           ↓
    Ai Legal Armenia
    ↑
RGB(200, 200, 200)
Semi-transparent
50pt Helvetica Bold
```

### 2. Header (Top of Every Page)
```
┌──────────────────┬──────────────────┬──────────────────┐
│ Ai Legal Armenia │  Գործ: CASE-001  │    26.01.2026    │
│      (Left)      │     (Center)     │     (Right)      │
└──────────────────┴──────────────────┴──────────────────┘
9pt gray text
```

### 3. Footer (Bottom of Every Page)
```
┌─────────────────────────────────────────────────────────┐
│ ────────────────────────────────────────────────────── │ ← Separator
│ ⚠️ ՆԱԽԱԶԳՈՒՇՈՒՄ: Սույն վերլուծությունը նախատեսված է...│ ← Disclaimer
│                       1 / 3                            │ ← Page number
└─────────────────────────────────────────────────────────┘
7pt-8pt gray text
```

## Export Types

### Type 1: Single Analysis Export (`exportAnalysisToPDF`)
- Single role analysis (Advocate, Prosecutor, or Judge)
- Case information header
- Analysis content
- Sources (if available)
- Watermark, header, footer on all pages

### Type 2: Aggregator Export (`exportMultipleAnalysesToPDF`)
```
Page 1: Cover page
  - "Ai Legal Armenia" title
  - "ԼԻԱԿԱՏԱՐ ԳՈՐԾԻ ՎԵՐԼՈՒԾՈՒԹՅՈՒՆ"
  - Case number and title
  - Export date

Page 2: Advocate Analysis
  - "Փաստաբան (Պաշտպան)" header
  - Analysis content
  - Sources

Page 3: Prosecutor Analysis
  - "Մեղադրող" header
  - Analysis content
  - Sources

Page 4: Judge Analysis
  - "Դատավոր" header
  - Analysis content
  - Sources

All pages include:
  - Watermark
  - Header with case number and date
  - Footer with disclaimer and page numbers
```

### Type 3: Case Details Export (`exportCaseDetailToPDF`)
- Case metadata (number, title, status, priority)
- Court information
- Dates (created, updated)
- Description, facts, legal questions, notes
- Attached files list
- Timeline of events
- Watermark, header, footer on all pages

## Color Scheme

```
Watermark:    RGB(200, 200, 200) - Light gray
Header Text:  RGB(100, 100, 100) - Medium gray
Body Text:    RGB(0, 0, 0)       - Black
Footer Text:  RGB(80, 80, 80)    - Dark gray
Lines:        RGB(180, 180, 180) - Light gray
```

## Typography

```
Watermark:         50pt Helvetica Bold
Headers:           9pt gray
Section Titles:    14-18pt Helvetica Bold
Body Text:         10pt Helvetica Normal
Footer Disclaimer: 7pt gray
Page Numbers:      8pt gray
```

## Spacing

```
Top Margin:        18-20pt (with header)
Bottom Margin:     35pt (with footer)
Side Margins:      20pt
Line Height:       5pt (body text)
Section Spacing:   10-15pt
```

## Language Support

Both Armenian (hy) and English (en) are supported:

**Armenian:**
- Header: "Գործ: CASE-001"
- Disclaimer: "⚠️ ՆԱԽԱԶԳՈՒՇՈՒՄ: Սույն վերլուծությունը..."

**English:**
- Header: "Case: CASE-001"
- Disclaimer: "⚠️ DISCLAIMER: This analysis is for..."
