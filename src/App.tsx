import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { BackgroundQueueProvider } from "@/hooks/useBackgroundQueue";
import { GlobalQueueBar } from "@/components/GlobalQueueBar";

import "@/i18n/config";

// Eager load critical pages
import Index from "./pages/Index";
import { Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";

// Lazy load heavy pages for better performance
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const CaseDetail = lazy(() => import("./pages/CaseDetail"));
const CaseTranscriptions = lazy(() => import("./pages/CaseTranscriptions"));
const AudioTranscriptions = lazy(() => import("./pages/AudioTranscriptions"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const KBDocumentDetail = lazy(() => import("./pages/KBDocumentDetail"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const MyDocuments = lazy(() => import("./pages/MyDocuments"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Loading fallback with accessibility
const PageLoader = () => (
  <div 
    className="flex min-h-screen items-center justify-center" 
    role="status" 
    aria-label="Loading page"
  >
    <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
    <span className="sr-only">Loading...</span>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BackgroundQueueProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <GlobalQueueBar />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <a 
            href="#main-content" 
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded"
          >
            Skip to main content
          </a>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/landing" element={<Index />} />
            <Route path="/login" element={<Navigate to="/admin/login" replace />} />
            {/* ... keep existing code (all routes) */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <Dashboard />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/calendar"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <CalendarPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/cases/:id"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <CaseDetail />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/cases/:id/transcriptions"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <CaseTranscriptions />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/transcriptions"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <AudioTranscriptions />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/kb"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <KnowledgeBase />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/kb/:id"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <KBDocumentDetail />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/login"
              element={
                <Suspense fallback={<PageLoader />}>
                  <AdminLogin />
                </Suspense>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Suspense fallback={<PageLoader />}>
                    <AdminPanel />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-documents"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <MyDocuments />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </BackgroundQueueProvider>
  </QueryClientProvider>
);

export default App;
