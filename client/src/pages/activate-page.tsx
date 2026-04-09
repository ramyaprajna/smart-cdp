/**
 * Account Activation Page
 *
 * Handles email activation flow for new user accounts.
 * Displays activation status and provides resend functionality.
 */

import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Mail, RefreshCw, AlertCircle } from 'lucide-react';

export function ActivatePage() {
  const [location, setLocation] = useLocation();
  const [activationStatus, setActivationStatus] = useState<'pending' | 'success' | 'error' | 'expired'>('pending');
  const [message, setMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [isResending, setIsResending] = useState(false);

  // Extract token from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  useEffect(() => {
    if (token) {
      handleActivation(token);
    } else {
      setActivationStatus('error');
      setMessage('Invalid activation link. Please check your email for the correct link.');
    }
  }, [token]);

  const handleActivation = async (activationToken: string) => {
    try {
      const response = await fetch(`/api/auth/activate?token=${activationToken}`);
      const data = await response.json();

      if (response.ok) {
        setActivationStatus('success');
        setMessage(data.message || 'Account activated successfully! You can now log in.');
      } else {
        if (data.error?.includes('expired')) {
          setActivationStatus('expired');
        } else {
          setActivationStatus('error');
        }
        setMessage(data.error || 'Account activation failed. Please try again.');
      }
    } catch (error) {
      setActivationStatus('error');
      setMessage('Network error during activation. Please check your connection and try again.');
    }
  };

  const handleResendActivation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resendEmail.trim()) {
      alert('Please enter your email address');
      return;
    }

    setIsResending(true);

    try {
      const response = await fetch('/api/auth/resend-activation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: resendEmail })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message || 'If your email exists and is not activated, a new activation email has been sent.');
        setActivationStatus('pending');
      } else {
        setMessage(data.error || 'Failed to resend activation email');
      }
    } catch (error) {
      setMessage('Network error. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const getStatusIcon = () => {
    switch (activationStatus) {
      case 'success':
        return <CheckCircle className="h-16 w-16 text-green-500" />;
      case 'error':
        return <XCircle className="h-16 w-16 text-red-500" />;
      case 'expired':
        return <AlertCircle className="h-16 w-16 text-yellow-500" />;
      case 'pending':
      default:
        return <Mail className="h-16 w-16 text-blue-500" />;
    }
  };

  const getStatusColor = () => {
    switch (activationStatus) {
      case 'success':
        return 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950';
      case 'error':
        return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950';
      case 'expired':
        return 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950';
      case 'pending':
      default:
        return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md space-y-6">

        {/* Main Status Card */}
        <Card className={`${getStatusColor()} border-2`}>
          <CardHeader className="text-center pb-6">
            <div className="flex justify-center mb-4">
              {getStatusIcon()}
            </div>
            <CardTitle className="text-2xl font-bold">
              {activationStatus === 'success' && 'Account Activated!'}
              {activationStatus === 'error' && 'Activation Failed'}
              {activationStatus === 'expired' && 'Link Expired'}
              {activationStatus === 'pending' && 'Activating Account...'}
            </CardTitle>
            <CardDescription className="text-lg">
              {message}
            </CardDescription>
          </CardHeader>

          <CardFooter className="flex flex-col space-y-4">
            {activationStatus === 'success' && (
              <Button
                onClick={() => setLocation('/login')}
                className="w-full bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
              >
                Continue to Login
              </Button>
            )}

            {(activationStatus === 'error' || activationStatus === 'expired') && (
              <div className="w-full text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Need a new activation email?
                </p>
              </div>
            )}
          </CardFooter>
        </Card>

        {/* Resend Activation Card */}
        {(activationStatus === 'error' || activationStatus === 'expired') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <RefreshCw className="h-5 w-5" />
                <span>Resend Activation Email</span>
              </CardTitle>
              <CardDescription>
                Enter your email address to receive a new activation link
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleResendActivation}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email address"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    required
                    disabled={isResending}
                  />
                </div>
              </CardContent>

              <CardFooter>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isResending}
                >
                  {isResending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Resend Activation Email
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {/* Help Section */}
        <Card className="bg-gray-50 dark:bg-gray-900">
          <CardContent className="pt-6">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Having trouble?</strong><br />
                • Check your spam/junk folder for the activation email<br />
                • Activation links expire after 24 hours<br />
                • Make sure you're using the latest email link<br />
                • Contact support if problems persist
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Back to Login */}
        <div className="text-center">
          <Button
            variant="link"
            onClick={() => setLocation('/login')}
            className="text-gray-600 dark:text-gray-400"
          >
            ← Back to Login
          </Button>
        </div>

      </div>
    </div>
  );
}
