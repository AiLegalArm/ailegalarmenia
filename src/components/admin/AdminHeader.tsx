import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Shield, LogOut } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";

interface AdminHeaderProps {
  email: string;
  onSignOut: () => void;
}

export function AdminHeader({ email, onSignOut }: AdminHeaderProps) {
  const { t } = useTranslation(['admin']);

  return (
    <header className="sticky top-0 z-10 border-b bg-card">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">{t('admin:admin_panel')}</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden text-sm text-muted-foreground sm:block">
            {email}
          </span>
          <LanguageSwitcher />
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={onSignOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
