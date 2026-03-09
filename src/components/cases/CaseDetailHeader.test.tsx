import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CaseDetailHeader } from "./CaseDetailHeader";

// Mock useTranslation
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

// Mock NotificationBell
vi.mock("@/components/reminders", () => ({
  NotificationBell: () => <div data-testid="notification-bell">Bell</div>,
}));

// Mock LanguageSwitcher
vi.mock("@/components/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher">Lang</div>,
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>{children}</BrowserRouter>
  </QueryClientProvider>
);

describe("CaseDetailHeader", () => {
  it("renders user email", () => {
    const { container } = render(
      <CaseDetailHeader
        userEmail="test@example.com"
        onSignOut={() => {}}
      />,
      { wrapper }
    );

    expect(container.textContent).toContain("test@example.com");
  });

  it("renders app name translation key", () => {
    const { container } = render(
      <CaseDetailHeader
        userEmail="test@example.com"
        onSignOut={() => {}}
      />,
      { wrapper }
    );

    expect(container.textContent).toContain("common:app_name");
  });

  it("renders notification bell", () => {
    const { container } = render(
      <CaseDetailHeader
        userEmail="test@example.com"
        onSignOut={() => {}}
      />,
      { wrapper }
    );

    expect(container.querySelector('[data-testid="notification-bell"]')).toBeDefined();
  });

  it("renders language switcher", () => {
    const { container } = render(
      <CaseDetailHeader
        userEmail="test@example.com"
        onSignOut={() => {}}
      />,
      { wrapper }
    );

    expect(container.querySelector('[data-testid="language-switcher"]')).toBeDefined();
  });

  it("renders back button", () => {
    const { container } = render(
      <CaseDetailHeader
        userEmail="test@example.com"
        onSignOut={() => {}}
      />,
      { wrapper }
    );

    expect(container.textContent).toContain("common:back");
  });
});
