import React, { useState, useEffect, memo, useCallback } from 'react';
import Joyride, { Step, CallBackProps } from 'react-joyride';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Play, RotateCcw } from 'lucide-react';

interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: () => void;
  onComplete: () => void;
}

const tourSteps: Step[] = [
  {
    target: '.sidebar-header',
    content: (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Welcome to Smart CDP Platform!</h3>
        <p>This interactive tour will guide you through the key features of your customer data platform.</p>
        <p className="text-sm text-muted-foreground">You can pause or restart this tour anytime using the controls.</p>
      </div>
    ),
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="dashboard"]',
    content: (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Analytics Dashboard</h3>
        <p>Your central hub for customer insights and key metrics.</p>
        <ul className="text-sm space-y-1">
          <li>• Real-time customer statistics</li>
          <li>• Segment distribution charts</li>
          <li>• Platform performance metrics</li>
        </ul>
      </div>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="customers"]',
    content: (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Customer Profiles</h3>
        <p>Browse and manage your complete customer database.</p>
        <ul className="text-sm space-y-1">
          <li>• Search through 3,880+ customer records</li>
          <li>• View detailed demographics and contact info</li>
          <li>• Filter by segments and locations</li>
        </ul>
      </div>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="vector-search"]',
    content: (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">AI-Powered Vector Search</h3>
        <p>Find similar customers using natural language queries.</p>
        <ul className="text-sm space-y-1">
          <li>• Semantic similarity matching</li>
          <li>• Natural language search queries</li>
          <li>• Advanced customer clustering</li>
        </ul>
      </div>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="segments"]',
    content: (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Customer Segments</h3>
        <p>Analyze and manage customer groups for targeted insights.</p>
        <ul className="text-sm space-y-1">
          <li>• Professionals, Students, Entrepreneurs</li>
          <li>• Custom segment creation</li>
          <li>• Demographic analysis by group</li>
        </ul>
      </div>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="data-import"]',
    content: (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Data Import</h3>
        <p>Easily import customer data from various file formats.</p>
        <ul className="text-sm space-y-1">
          <li>• Excel, CSV, DOCX, TXT support</li>
          <li>• Automatic data validation</li>
          <li>• Batch processing capabilities</li>
        </ul>
      </div>
    ),
    placement: 'right',
  },
  {
    target: '.analytics-chatbot-toggle',
    content: (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">AI Analytics Assistant</h3>
        <p>Get instant insights with your personal data scientist chatbot.</p>
        <ul className="text-sm space-y-1">
          <li>• Ask questions in natural language</li>
          <li>• Real-time database analysis</li>
          <li>• Professional data insights</li>
        </ul>
      </div>
    ),
    placement: 'top',
    offset: 10,
  },
  {
    target: '.dashboard-stats',
    content: (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Key Metrics Overview</h3>
        <p>Monitor your customer database performance at a glance.</p>
        <ul className="text-sm space-y-1">
          <li>• Total customer count and growth</li>
          <li>• Active segments tracking</li>
          <li>• Data quality metrics</li>
        </ul>
      </div>
    ),
    placement: 'bottom',
  },
  {
    target: '.analytics-charts',
    content: (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Visual Analytics</h3>
        <p>Interactive charts and graphs for deeper insights.</p>
        <ul className="text-sm space-y-1">
          <li>• Segment distribution visualization</li>
          <li>• Geographic customer mapping</li>
          <li>• Trend analysis over time</li>
        </ul>
      </div>
    ),
    placement: 'top',
  },
  {
    target: '.sidebar-header',
    content: (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Tour Complete!</h3>
        <p>You're now ready to explore Smart CDP Platform's powerful customer analytics capabilities.</p>
        <p className="text-sm text-muted-foreground">
          Click on any navigation item to start analyzing your customer data. You can restart this tour anytime from the help menu.
        </p>
      </div>
    ),
    placement: 'right',
  },
];

const OnboardingTour = memo<OnboardingTourProps>(function OnboardingTour({ isOpen, onClose, onStart, onComplete }) {
  const [runTour, setRunTour] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setRunTour(true);
      setStepIndex(0);
    }
  }, [isOpen]);

  const handleJoyrideCallback = useCallback((data: CallBackProps) => {
    const { action, index, status, type } = data;



    // Handle tour completion
    if (status === 'finished') {
      setRunTour(false);
      onComplete(); // Mark as completed when user finishes all steps
      return;
    }

    // Handle tour skip
    if (status === 'skipped') {
      setRunTour(false);
      onClose(); // Just close, don't mark as completed
      return;
    }

    // Handle step navigation
    if (type === 'step:after') {
      if (action === 'next') {
        // Move to next step
        const nextIndex = index + 1;
        if (nextIndex < tourSteps.length) {
          setStepIndex(nextIndex);
        } else {
          // Tour completed
          setRunTour(false);
          onComplete(); // Mark as completed when user finishes all steps
        }
      } else if (action === 'prev') {
        // Move to previous step
        const prevIndex = index - 1;
        if (prevIndex >= 0) {
          setStepIndex(prevIndex);
        }
      }
    }

    // Handle errors by continuing the tour
    if (status === 'error' || type === 'error:target_not_found') {

      return; // Let Joyride handle the error naturally
    }
  }, [onComplete, onClose]);

  const handleStartTour = useCallback(() => {
    setRunTour(true);
    setStepIndex(0);
    onStart();
  }, [onStart]);

  const handleRestartTour = useCallback(() => {
    setRunTour(true);
    setStepIndex(0);
  }, []);

  const handleCloseTour = useCallback(() => {
    setRunTour(false);
    onClose();
  }, [onClose]);

  if (isOpen && !runTour) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Card className="w-80">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              Take a Tour
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
            <CardDescription className="text-sm">
              New to Smart CDP Platform? Take an interactive tour to learn about our customer analytics features.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex gap-2">
              <Button onClick={handleStartTour} className="flex-1" size="sm">
                <Play className="h-4 w-4 mr-2" />
                Start Tour
              </Button>
              <Button variant="outline" onClick={onClose} size="sm">
                Maybe Later
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <Joyride
        steps={tourSteps}
        run={runTour}
        stepIndex={stepIndex}
        callback={handleJoyrideCallback}
        continuous
        showProgress
        showSkipButton
        scrollToFirstStep
        styles={{
          options: {
            primaryColor: 'hsl(var(--primary))',
            textColor: '#ffffff',
            backgroundColor: '#1e293b',
            overlayColor: 'rgba(0, 0, 0, 0.6)',
            spotlightShadow: '0 0 15px rgba(0, 0, 0, 0.8)',
            zIndex: 10000,
          },
          tooltip: {
            borderRadius: 12,
            fontSize: 14,
            backgroundColor: '#1e293b',
            color: '#ffffff',
            padding: '20px',
            border: '1px solid #334155',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
            opacity: 1,
          },
          tooltipContainer: {
            textAlign: 'left',
            backgroundColor: '#1e293b',
            color: '#ffffff',
          },
          tooltipTitle: {
            fontSize: 18,
            fontWeight: 700,
            color: '#ffffff',
            marginBottom: '8px',
          },
          tooltipContent: {
            color: '#e2e8f0',
            lineHeight: 1.6,
          },
          buttonNext: {
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 600,
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            display: 'inline-block',
            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
            transition: 'all 0.2s ease',
          },
          buttonBack: {
            backgroundColor: 'transparent',
            color: '#94a3b8',
            fontSize: 14,
            fontWeight: 500,
            marginRight: 12,
            border: '1px solid #475569',
            padding: '8px 16px',
            borderRadius: 6,
            cursor: 'pointer',
            display: 'inline-block',
            transition: 'all 0.2s ease',
          },
          buttonSkip: {
            backgroundColor: 'transparent',
            color: '#94a3b8',
            fontSize: 14,
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            display: 'inline-block',
            textDecoration: 'underline',
            padding: '8px 0',
          },
          tooltipFooter: {
            backgroundColor: '#1e293b',
            borderTop: '1px solid #334155',
            padding: '16px 20px',
            marginTop: '16px',
            marginLeft: '-20px',
            marginRight: '-20px',
            marginBottom: '-20px',
            borderBottomLeftRadius: '12px',
            borderBottomRightRadius: '12px',
          },
          spotlight: {
            borderRadius: 8,
          },
        }}
        locale={{
          back: 'Previous',
          close: 'Close',
          last: 'Finish Tour',
          next: 'Next',
          skip: 'Skip Tour',
        }}
        disableOverlayClose={false}
        disableScrollParentFix={false}
        spotlightClicks={true}
        hideBackButton={false}
        hideCloseButton={false}
        floaterProps={{
          disableAnimation: false,
          options: {
            preventOverflow: {
              boundariesElement: 'viewport',
            },
          },
        }}
      />

      {runTour && (
        <div className="fixed top-4 right-4 z-[10001] flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRestartTour}
            className="bg-background/90 backdrop-blur-sm"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Restart
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCloseTour}
            className="bg-background/90 backdrop-blur-sm"
          >
            <X className="h-4 w-4 mr-2" />
            Exit Tour
          </Button>
        </div>
      )}
    </>
  );
});

export default OnboardingTour;
