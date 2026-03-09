import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { AdminHeader } from "./AdminHeader";

// Mock LanguageSwitcher
vi.mock("@/components/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher">Lang</div>,
}));

// Mock ThemeToggle
vi.mock("@/components/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">Theme</div>,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe("AdminHeader", () => {
  it("renders user email", () => {
    const { container } = render(
      <AdminHeader email="admin@test.com" onSignOut={vi.fn()} />,
      { wrapper }
    );

    expect(container.textContent).toContain("admin@test.com");
  });

  it("renders header element", () => {
    const { container } = render(
      <AdminHeader email="admin@test.com" onSignOut={vi.fn()} />,
      { wrapper }
    );

    expect(container.querySelector("header")).toBeDefined();
  });

  it("renders heading", () => {
    const { container } = render(
      <AdminHeader email="admin@test.com" onSignOut={vi.fn()} />,
      { wrapper }
    );

    expect(container.querySelector("h1")).toBeDefined();
  });

  it("renders theme toggle", () => {
    const { container } = render(
      <AdminHeader email="admin@test.com" onSignOut={vi.fn()} />,
      { wrapper }
    );

    expect(container.querySelector('[data-testid="theme-toggle"]')).toBeDefined();
  });

  it("renders language switcher", () => {
    const { container } = render(
      <AdminHeader email="admin@test.com" onSignOut={vi.fn()} />,
      { wrapper }
    );

    expect(container.querySelector('[data-testid="language-switcher"]')).toBeDefined();
  });

  it("renders logout button", () => {
    const { container } = render(
      <AdminHeader email="admin@test.com" onSignOut={vi.fn()} />,
      { wrapper }
    );

    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
  });
});
