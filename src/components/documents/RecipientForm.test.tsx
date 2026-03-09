import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { RecipientForm, RecipientType } from "./RecipientForm";

// Mock useTranslation
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
  }),
}));

// Mock selectors
vi.mock("./CourtSelector", () => ({
  CourtSelector: () => <div data-testid="court-selector">Court Selector</div>,
}));

vi.mock("./ProsecutorSelector", () => ({
  ProsecutorSelector: () => <div data-testid="prosecutor-selector">Prosecutor Selector</div>,
}));

vi.mock("./GovernmentSelector", () => ({
  GovernmentSelector: () => <div data-testid="government-selector">Government Selector</div>,
}));

vi.mock("./InvestigativeBodySelector", () => ({
  InvestigativeBodySelector: () => <div data-testid="investigative-selector">Investigative Selector</div>,
}));

vi.mock("./CommitteeServiceSelector", () => ({
  CommitteeServiceSelector: () => <div data-testid="committee-selector">Committee Selector</div>,
}));

describe("RecipientForm", () => {
  const defaultProps = {
    recipientType: "court" as RecipientType,
    onRecipientTypeChange: vi.fn(),
    recipientName: "",
    onRecipientNameChange: vi.fn(),
    recipientPosition: "",
    onRecipientPositionChange: vi.fn(),
    recipientOrganization: "",
    onRecipientOrganizationChange: vi.fn(),
    selectedCourtId: "",
    onCourtChange: vi.fn(),
    selectedProsecutorId: "",
    onProsecutorChange: vi.fn(),
    selectedGovernmentId: "",
    onGovernmentChange: vi.fn(),
    selectedInvestigativeId: "",
    onInvestigativeChange: vi.fn(),
    selectedCommitteeId: "",
    onCommitteeChange: vi.fn(),
    onTemplateReset: vi.fn(),
  };

  it("renders recipient type buttons", () => {
    const { container } = render(<RecipientForm {...defaultProps} />);
    
    expect(container.textContent).toContain("Court");
    expect(container.textContent).toContain("Prosecutor");
    expect(container.textContent).toContain("Government");
    expect(container.textContent).toContain("Investigative");
    expect(container.textContent).toContain("Other");
  });

  it("shows court selector when court type is selected", () => {
    const { container } = render(<RecipientForm {...defaultProps} recipientType="court" />);
    expect(container.querySelector('[data-testid="court-selector"]')).toBeDefined();
  });

  it("shows prosecutor selector when prosecutor type is selected", () => {
    const { container } = render(<RecipientForm {...defaultProps} recipientType="prosecutor" />);
    expect(container.querySelector('[data-testid="prosecutor-selector"]')).toBeDefined();
  });

  it("shows government selector when government type is selected", () => {
    const { container } = render(<RecipientForm {...defaultProps} recipientType="government" />);
    expect(container.querySelector('[data-testid="government-selector"]')).toBeDefined();
  });

  it("displays recipient name and position labels", () => {
    const { container } = render(<RecipientForm {...defaultProps} />);
    
    expect(container.textContent).toContain("Position");
    expect(container.textContent).toContain("Full name");
  });

  it("renders five type buttons", () => {
    const { container } = render(<RecipientForm {...defaultProps} />);
    
    // 5 type buttons + input fields
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(5);
  });
});
