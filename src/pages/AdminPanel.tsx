import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BookOpen,
  BarChart3,
  Database as DatabaseIcon,
  Users,
  Users2,
  MessageSquare,
  FileCode2,
  AlertTriangle,
  BookOpenText,
  ArrowRightLeft,
} from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminKnowledgeBaseTab } from "@/components/admin/AdminKnowledgeBaseTab";
import { LegalPracticeKB } from "@/components/admin/LegalPracticeKB";
import { UserManagement } from "@/components/admin/UserManagement";
import { TeamManagement } from "@/components/admin/TeamManagement";
import { UserFeedback } from "@/components/admin/UserFeedback";
import { PromptManager } from "@/components/admin/PromptManager";
import { UsageMonitor } from "@/components/UsageMonitor";
import { EmbeddingManager } from "@/components/admin/EmbeddingManager";
import { PracticeChunkManager } from "@/components/admin/PracticeChunkManager";
import { ErrorLogs } from "@/components/admin/ErrorLogs";
import { DictionaryImport } from "@/components/admin/DictionaryImport";
import { AIProviderSwitch } from "@/components/admin/AIProviderSwitch";
import { AdminAIChatBot } from "@/components/admin/AdminAIChatBot";
import { DataMigration } from "@/components/admin/DataMigration";

const AdminPanel = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(['admin']);
  const { user, signOut, isAdmin, loading: authLoading } = useAuth();

  // Protect admin route
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate("/admin/login");
    }
  }, [user, isAdmin, authLoading, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin/login");
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render if not admin
  if (!user || !isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader email={user.email || ""} onSignOut={handleSignOut} />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="kb" className="space-y-6">
          <TabsList className="h-auto flex-wrap gap-1 p-1">
            <TabsTrigger value="kb" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <DatabaseIcon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t('admin:knowledge_base')}</span>
            </TabsTrigger>
            <TabsTrigger value="practice" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <BookOpen className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t('admin:legal_practice')}</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <Users className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t('admin:users')}</span>
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <Users2 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t('admin:teams')}</span>
            </TabsTrigger>
            <TabsTrigger value="feedback" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t('admin:feedback')}</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <BarChart3 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t('admin:analytics')}</span>
            </TabsTrigger>
            <TabsTrigger value="prompts" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <FileCode2 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t('admin:prompts')}</span>
            </TabsTrigger>
            <TabsTrigger value="errors" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{'\u053c\u0578\u0563\u0565\u0580'}</span>
            </TabsTrigger>
            <TabsTrigger value="dictionary" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <BookOpenText className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{'\u0532\u0561\u057c\u0561\u0580\u0561\u0576'}</span>
            </TabsTrigger>
            <TabsTrigger value="migration" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <ArrowRightLeft className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Миграция</span>
            </TabsTrigger>
          </TabsList>

          {/* Knowledge Base Tab */}
          <TabsContent value="kb" className="space-y-6">
            <AdminKnowledgeBaseTab />
            <EmbeddingManager />
          </TabsContent>

          {/* Legal Practice KB Tab */}
          <TabsContent value="practice" className="space-y-6">
            <LegalPracticeKB />
            <PracticeChunkManager />
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <UserManagement />
          </TabsContent>

          {/* Teams Tab */}
          <TabsContent value="teams">
            <TeamManagement />
          </TabsContent>

          {/* User Feedback Tab */}
          <TabsContent value="feedback">
            <UserFeedback />
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <AIProviderSwitch />
            <UsageMonitor budgetLimit={10.0} compact={false} />
          </TabsContent>

          {/* Prompts Tab */}
          <TabsContent value="prompts">
            <PromptManager />
          </TabsContent>

          {/* Error Logs Tab */}
          <TabsContent value="errors">
            <ErrorLogs />
          </TabsContent>

          {/* Dictionary Import Tab */}
          <TabsContent value="dictionary">
            <DictionaryImport />
          </TabsContent>
        </Tabs>

        <AdminAIChatBot />
      </main>
    </div>
  );
};

export default AdminPanel;
