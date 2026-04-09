import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Database, Loader2 } from 'lucide-react';
import { useLogin } from '@/hooks/use-login';
import { Link } from 'wouter';

const LoginPage = memo(function LoginPage() {
  const {
    formData,
    errors,
    isLoading,
    updateField,
    handleSubmit,
    fillDemoCredentials,
    handleResendActivation,
    isFormValid
  } = useLogin();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary rounded-lg flex items-center justify-center mb-4">
            <Database className="w-6 h-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Smart CDP Platform</CardTitle>
          <CardDescription>
            Sign in to access the Customer Data Platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {errors.general && (
              <Alert variant="destructive">
                <AlertDescription>
                  {errors.general}
                  {errors.activationRequired && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={handleResendActivation}
                      className="p-0 h-auto ml-2 underline"
                    >
                      Resend activation email
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="Enter your email"
                disabled={isLoading}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
              />
              {errors.email && (
                <p id="email-error" className="text-sm text-destructive">
                  {errors.email}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => updateField('password', e.target.value)}
                placeholder="Enter your password"
                disabled={isLoading}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : undefined}
              />
              {errors.password && (
                <p id="password-error" className="text-sm text-destructive">
                  {errors.password}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !isFormValid}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Don't have an account?{' '}
              <Link href="/signup">
                <Button variant="link" className="p-0 h-auto font-medium">
                  Sign up here
                </Button>
              </Link>
            </p>

            <p className="text-xs text-muted-foreground mb-4">
              Need to activate your account?{' '}
              <Link href="/activate">
                <Button variant="link" className="p-0 h-auto text-xs">
                  Activate account
                </Button>
              </Link>
            </p>

            {/* Only show demo accounts if demo mode is enabled */}
            {(import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true' || import.meta.env.MODE === 'development') && (
              <div className="text-sm text-muted-foreground">
                <p className="mb-2">Demo accounts:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fillDemoCredentials('admin')}
                    disabled={isLoading}
                    className="h-auto p-2 text-xs"
                  >
                    <strong>Admin</strong>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fillDemoCredentials('analyst')}
                    disabled={isLoading}
                    className="h-auto p-2 text-xs"
                  >
                    <strong>Analyst</strong>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fillDemoCredentials('viewer')}
                    disabled={isLoading}
                    className="h-auto p-2 text-xs"
                  >
                    <strong>Viewer</strong>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fillDemoCredentials('marketing')}
                    disabled={isLoading}
                    className="h-auto p-2 text-xs"
                  >
                    <strong>Marketing</strong>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export default LoginPage;
