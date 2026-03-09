import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CaseDetailInfo } from "./CaseDetailInfo";

// Mock useTranslation
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

// Mock CaseTimeline
vi.mock("./CaseTimeline", () => ({
  CaseTimeline: () => <div data-testid="case-timeline">Timeline</div>,
}));

// Mock CaseComments
vi.mock("./CaseComments", () => ({
  CaseComments: () => <div data-testid="case-comments">Comments</div>,
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>{children}</BrowserRouter>
  </QueryClientProvider>
);

describe("CaseDetailInfo", () => {
  const defaultProps = {
    caseId: "test-id",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    isAdmin: false,
  };

  it("renders court name when provided", () => {
    const { container } = render(
      <CaseDetailInfo {...defaultProps} courtName="Test Court" />,
      { wrapper }
    );
    expect(container.textContent).toContain("Test Court");
  });

  it("renders timeline component", () => {
    const { container } = render(
      <CaseDetailInfo {...defaultProps} />,
      { wrapper }
    );
    expect(container.querySelector('[data-testid="case-timeline"]')).toBeDefined();
  });

  it("renders comments component", () => {
    const { container } = render(
      <CaseDetailInfo {...defaultProps} />,
      { wrapper }
    );
    expect(container.querySelector('[data-testid="case-comments"]')).toBeDefined();
  });

  it("renders information title", () => {
    const { container } = render(
      <CaseDetailInfo {...defaultProps} />,
      { wrapper }
    );
    expect(container.textContent).toContain("common:information");
  });
});
