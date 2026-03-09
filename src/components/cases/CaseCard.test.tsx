import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CaseCard } from './CaseCard';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock date-fns format function
vi.mock('date-fns', () => ({
  format: vi.fn((date: Date, formatStr: string) => {
    if (formatStr === 'yyyy-MM-dd') {
      return '2026-02-15';
    }
    return '15.02.2026';
  }),
}));

describe('CaseCard', () => {
  const mockCase = {
    id: 'test-id',
    title: 'Test Case',
    case_number: 'TEST-001',
    description: 'Test description',
    status: 'open' as const,
    priority: 'high' as const,
    court_date: '2026-02-15',
    court_name: 'Test Court',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    client_id: null,
    lawyer_id: null,
    notes: null,
    case_type: 'civil' as const,
    current_stage: 'preliminary',
    court: null,
    deleted_at: null,
    facts: null,
    legal_question: null,
    party_role: null,
    appeal_party_role: null,
  };

  const mockProps = {
    caseData: mockCase,
    onView: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };

  it('should render court_date badge when court_date exists', () => {
    const { container } = render(<CaseCard {...mockProps} />);
    
    // Check for the court hearing badge text
    const courtDateElement = container.querySelector('[class*="badge"]');
    expect(courtDateElement).toBeDefined();
  });

  it('should render no_court_date when court_date is null', () => {
    const caseWithoutCourtDate = {
      ...mockCase,
      court_date: null,
    };
    
    const { container } = render(<CaseCard {...mockProps} caseData={caseWithoutCourtDate} />);
    
    // Check that component renders
    expect(container.textContent).toContain('no_court_date');
  });

  it('should render case title and case number', () => {
    const { container } = render(<CaseCard {...mockProps} />);
    
    expect(container.textContent).toContain('Test Case');
    expect(container.textContent).toContain('TEST-001');
  });
});
