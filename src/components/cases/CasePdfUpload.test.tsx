import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CasePdfUpload } from './CasePdfUpload';

// Mock dependencies
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: vi.fn(),
        createSignedUrl: vi.fn(),
      }),
    },
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getUser: vi.fn(),
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('CasePdfUpload', () => {
  const mockProps = {
    open: true,
    onOpenChange: vi.fn(),
    caseId: 'test-case-id',
    onSuccess: vi.fn(),
  };

  it('should render the dialog when open', () => {
    const { container } = render(<CasePdfUpload {...mockProps} />);
    expect(container.textContent).toContain('cases:attach_pdf_to_case');
  });

  it('should render file input', () => {
    render(<CasePdfUpload {...mockProps} />);
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeDefined();
  });

  it('should accept correct file types', () => {
    render(<CasePdfUpload {...mockProps} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.accept).toBe('.pdf,.jpg,.jpeg,.png,.tiff');
  });

  it('should not render when closed', () => {
    const { container } = render(<CasePdfUpload {...mockProps} open={false} />);
    expect(container.textContent).not.toContain('cases:attach_pdf_to_case');
  });
});
