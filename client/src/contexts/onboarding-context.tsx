import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

interface OnboardingContextType {
  showTour: boolean;
  hasCompletedTour: boolean;
  startTour: () => void;
  closeTour: () => void;
  completeTour: () => void;
  resetTour: () => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

const TOUR_COMPLETED_KEY = 'smart-cdp-tour-completed';

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [showTour, setShowTour] = useState(false);
  const [hasCompletedTour, setHasCompletedTour] = useState(false);

  useEffect(() => {
    // Check if user has completed the tour before
    const tourCompleted = localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
    setHasCompletedTour(tourCompleted);

    // Show tour for new users after a short delay
    if (!tourCompleted) {
      const timer = setTimeout(() => {
        setShowTour(true);
      }, 2000); // Show tour after 2 seconds for new users

      return () => clearTimeout(timer);
    }
  }, []);

  const startTour = useCallback(() => {
    setShowTour(true);
  }, []);

  const closeTour = useCallback(() => {
    setShowTour(false);
  }, []);

  const completeTour = useCallback(() => {
    setShowTour(false);
    setHasCompletedTour(true);
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
  }, []);

  const resetTour = useCallback(() => {
    setHasCompletedTour(false);
    localStorage.removeItem(TOUR_COMPLETED_KEY);
    setShowTour(true);
  }, []);

  // Optimize context value with useMemo to prevent unnecessary re-renders
  const value = useMemo(() => ({
    showTour,
    hasCompletedTour,
    startTour,
    closeTour,
    completeTour,
    resetTour,
  }), [showTour, hasCompletedTour, startTour, closeTour, completeTour, resetTour]);

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}