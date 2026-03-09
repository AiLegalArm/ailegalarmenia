import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { SenderForm } from "./SenderForm";

// Mock useTranslation
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "cases:sender": "Sender",
        "cases:sender_name": "Sender Name",
        "cases:sender_address": "Sender Address",
        "cases:sender_contact": "Sender Contact",
        "cases:sender_name_placeholder": "Enter name",
        "cases:sender_address_placeholder": "Enter address",
        "cases:sender_contact_placeholder": "Enter contact",
      };
      return translations[key] || key;
    },
  }),
}));

describe("SenderForm", () => {
  const defaultProps = {
    senderName: "",
    onSenderNameChange: vi.fn(),
    senderAddress: "",
    onSenderAddressChange: vi.fn(),
    senderContact: "",
    onSenderContactChange: vi.fn(),
  };

  it("renders card title", () => {
    const { container } = render(<SenderForm {...defaultProps} />);
    expect(container.textContent).toContain("Sender");
  });

  it("renders all input labels", () => {
    const { container } = render(<SenderForm {...defaultProps} />);
    
    expect(container.textContent).toContain("Sender Name");
    expect(container.textContent).toContain("Sender Address");
    expect(container.textContent).toContain("Sender Contact");
  });

  it("displays provided values in inputs", () => {
    const { container } = render(
      <SenderForm
        {...defaultProps}
        senderName="John Doe"
        senderAddress="123 Main St"
        senderContact="+1234567890"
      />
    );

    const inputs = container.querySelectorAll("input") as NodeListOf<HTMLInputElement>;
    const values = Array.from(inputs).map(input => input.value);
    
    expect(values).toContain("John Doe");
    expect(values).toContain("123 Main St");
    expect(values).toContain("+1234567890");
  });

  it("renders three input fields", () => {
    const { container } = render(<SenderForm {...defaultProps} />);
    
    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBe(3);
  });
});
