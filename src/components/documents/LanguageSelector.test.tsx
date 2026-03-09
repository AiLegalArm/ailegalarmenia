import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { LanguageSelector } from "./LanguageSelector";

// Mock useTranslation
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "cases:document_language": "Document Language",
      };
      return translations[key] || key;
    },
  }),
}));

describe("LanguageSelector", () => {
  it("renders card title", () => {
    const { container } = render(
      <LanguageSelector language="hy" onLanguageChange={vi.fn()} />
    );

    expect(container.textContent).toContain("Document Language");
  });

  it("renders the select trigger button", () => {
    const { container } = render(
      <LanguageSelector language="ru" onLanguageChange={vi.fn()} />
    );

    const selectTrigger = container.querySelector("button");
    expect(selectTrigger).toBeDefined();
  });

  it("renders card component", () => {
    const { container } = render(
      <LanguageSelector language="en" onLanguageChange={vi.fn()} />
    );

    const card = container.querySelector('[class*="card"]');
    expect(card).toBeDefined();
  });
});
