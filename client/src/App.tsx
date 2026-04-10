/**
 * ⚠️ CRITICAL COMPONENT - MAIN APPLICATION COMPONENT - DO NOT DELETE ⚠️
 *
 * Root React component that defines the application structure, routing,
 * authentication context, and core layout for the Smart CDP Platform.
 *
 * Features:
 * - Authentication-based routing with protected routes
 * - Onboarding tour integration for new users
 * - Analytics chatbot integration
 * - Error boundary implementation
 * - Performance optimization with React.memo and useCallback
 *
 * Last Updated: August 11, 2025 - Added critical component annotation
 */
import { Switch, Route } from "wouter";
import { useState, memo, useCallback } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnalyticsChatbot } from "@/components/chatbot/analytics-chatbot";
import Dashboard from "@/pages/dashboard";
import Customers from "@/pages/customers";
import VectorSearch from "@/pages/vector-search";
import Segments from "@/pages/segments";
import DataImport from "@/pages/data-import";
import AdminUsers from "@/pages/admin-users";
import ImportErrors from "@/pages/import-errors";
import ImportErrorsList from "@/pages/import-errors-list";
import ImportHistory from "@/pages/import-history";
import ImportDetails from "@/pages/import-details";
import ArchiveManagement from "@/pages/archive-management";
import ApplicationLogs from "@/pages/admin/logs";
import RealTimeLogView from "@/pages/admin/real-time-log-view";
import QuickTipsDemoPage from "@/pages/quick-tips-demo";
import Campaigns from "@/pages/campaigns";
import Loyalty from "@/pages/loyalty";
import ConsentPage from "@/pages/consent";
import Scoring from "@/pages/scoring";
import Waba from "@/pages/waba";
import HelpPage from "@/pages/help";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import { ActivatePage } from "@/pages/activate-page";
import NotFound from "@/pages/not-found";
import Streams from "@/pages/streams";
import StreamSetup from "@/pages/stream-setup";
import StreamDetail from "@/pages/stream-detail";
import IdentityClusters from "@/pages/identity-clusters";
import ClusterDetail from "@/pages/cluster-detail";
import Sidebar from "@/components/layout/sidebar";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { OnboardingProvider, useOnboarding } from "@/contexts/onboarding-context";
import { QuickTipsProvider } from "@/components/common/quick-tips-provider";
import OnboardingTour from "@/components/onboarding/onboarding-tour";
import { ErrorBoundary, ImportErrorBoundary } from "@/components/error-boundary";
import { Loader2 } from "lucide-react";

const ProtectedApp = memo(function ProtectedApp() {
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const { showTour, startTour, closeTour, completeTour } = useOnboarding();

  // Optimize chatbot toggle handler
  const handleChatbotToggle = useCallback(() => {
    setIsChatbotOpen(prev => !prev);
  }, []);

  return (
    <ProtectedRoute>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/customers" component={Customers} />
            <Route path="/vector-search" component={VectorSearch} />
            <Route path="/segments" component={Segments} />
            <Route path="/data-import">
              <ImportErrorBoundary>
                <DataImport />
              </ImportErrorBoundary>
            </Route>
            <Route path="/admin/users">
              <ProtectedRoute requiredRole={['admin']}>
                <AdminUsers />
              </ProtectedRoute>
            </Route>
            <Route path="/admin/archives">
              <ProtectedRoute requiredRole={['admin']}>
                <ArchiveManagement />
              </ProtectedRoute>
            </Route>
            <Route path="/admin/logs">
              <ProtectedRoute requiredRole={['admin']}>
                <ApplicationLogs />
              </ProtectedRoute>
            </Route>
            <Route path="/admin/log">
              <ProtectedRoute requiredRole={['admin']}>
                <RealTimeLogView />
              </ProtectedRoute>
            </Route>
            <Route path="/campaigns">
              <ProtectedRoute requiredRole={['admin', 'marketing']}>
                <Campaigns />
              </ProtectedRoute>
            </Route>
            <Route path="/loyalty">
              <ProtectedRoute requiredRole={['admin', 'marketing']}>
                <Loyalty />
              </ProtectedRoute>
            </Route>
            <Route path="/consent">
              <ProtectedRoute requiredRole={['admin']}>
                <ConsentPage />
              </ProtectedRoute>
            </Route>
            <Route path="/scoring">
              <ProtectedRoute requiredRole={['admin', 'analyst']}>
                <Scoring />
              </ProtectedRoute>
            </Route>
            <Route path="/waba">
              <ProtectedRoute requiredRole={['admin', 'marketing']}>
                <Waba />
              </ProtectedRoute>
            </Route>
            <Route path="/streams" component={Streams} />
            <Route path="/streams/:id/setup" component={StreamSetup} />
            <Route path="/streams/:id" component={StreamDetail} />
            <Route path="/clusters" component={IdentityClusters} />
            <Route path="/clusters/:id" component={ClusterDetail} />
            <Route path="/help" component={HelpPage} />
            <Route path="/quick-tips-demo" component={QuickTipsDemoPage} />
            <Route path="/import-history" component={ImportHistory} />
            <Route path="/import-details/:importId" component={ImportDetails} />
            <Route path="/import-errors/:importId" component={ImportErrors} />
            <Route path="/import-errors" component={ImportErrorsList} />
            <Route component={NotFound} />
          </Switch>
          <AnalyticsChatbot
            isOpen={isChatbotOpen}
            onToggle={handleChatbotToggle}
          />

          {/* Onboarding Tour */}
          <OnboardingTour
            isOpen={showTour}
            onClose={closeTour}
            onStart={startTour}
            onComplete={completeTour}
          />
        </div>
      </div>
    </ProtectedRoute>
  );
});

const Router = memo(function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/signup" component={SignupPage} />
        <Route path="/activate" component={ActivatePage} />
        <Route component={LoginPage} />
      </Switch>
    );
  }

  return (
    <OnboardingProvider>
      <ProtectedApp />
    </OnboardingProvider>
  );
});

const App = memo(function App() {
  return (
    <ErrorBoundary showDetails={process.env.NODE_ENV === 'development'}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <QuickTipsProvider defaultEnabled={true}>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </QuickTipsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
});

export default App;
