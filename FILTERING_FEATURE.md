# CaseTimeline Filtering Feature

## Overview
Added comprehensive filtering capabilities to the CaseTimeline component to help users find specific timeline events more easily.

## Features Implemented

### 1. Event Type Filters
Users can filter timeline events by type using checkboxes:
- **AI Analysis** (AI վերլուծություն) - Shows AI analysis events
- **OCR** (OCR) - Shows OCR processing events  
- **Audio** (Աուդիո) - Shows audio transcription events
- **Files** (Ֆայլեր) - Shows file upload events
- **Notes** (Նշումներ) - Shows note creation events

### 2. Date Range Filters
Users can filter events by date range:
- **From Date** (Սկսած) - Show events after this date
- **To Date** (Մինչև) - Show events before this date

### 3. Filter UI
- Collapsible filter panel triggered by "Filter Timeline" button
- All filters work in combination (AND logic)
- Reset filters button to clear all filters at once
- Clean, intuitive UI following the existing design system

## Technical Details

### Files Modified
1. `src/components/cases/CaseTimeline.tsx`
   - Added filter state management (filterTypes, dateFrom, dateTo, showFilters)
   - Added queries for OCR results and audio transcriptions
   - Implemented filter logic for event types and date ranges
   - Added collapsible filter UI with checkboxes and date pickers

2. `src/i18n/locales/hy/cases.json`
   - Added Armenian translations for all filter-related text
   - Translation keys: filter_timeline, filter_by_type, filter_by_date, etc.

### Dependencies Used
- Existing UI components: Checkbox, Calendar, Popover, Button, Label
- Icons from lucide-react: Filter, FileSearch, Mic
- State management with React useState
- Existing query infrastructure with @tanstack/react-query

### Filter Logic
```typescript
// Filter by type
if (!filterTypes.has(event.type)) return false;

// Filter by date range (inclusive)
const eventDate = new Date(event.timestamp);
if (dateFrom && eventDate < dateFrom) return false;
if (dateTo) {
  const endOfDay = new Date(dateTo);
  endOfDay.setHours(23, 59, 59, 999);
  if (eventDate > endOfDay) return false;
}
```

## Usage
1. Navigate to a case detail page
2. Scroll to the CaseTimeline section
3. Click "Զտել ժամանակագրությունը" (Filter Timeline) button
4. Select/deselect event types or choose date range
5. Events are filtered in real-time
6. Click "Վերականգնել ֆիլտրերը" (Reset Filters) to clear all filters

## Localization
All UI text is fully localized in Armenian:
- Զտել ժամանակագրությունը - Filter Timeline
- Զտել ըստ տեսակի - Filter by Type
- Զտել ըստ ամսաթվի - Filter by Date
- AI վերլուծություն - AI Analysis
- OCR - OCR
- Աուդիո - Audio
- Ֆայլեր - Files
- Նշումներ - Notes
- Սկսած - From
- Մինչև - To
- Վերականգնել ֆիլտրերը - Reset Filters

## Future Enhancements
Potential improvements:
- Save filter preferences per user
- Add search/text filter for event descriptions
- Export filtered timeline to PDF
- Add filter presets (e.g., "Last 7 days", "AI events only")
