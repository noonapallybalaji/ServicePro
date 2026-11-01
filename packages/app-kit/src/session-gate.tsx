import { session, useSession, type SessionRole } from '@servicepro/api-client';
import { Button, EmptyState, LoadingState } from '@servicepro/ui';
import { ShieldAlert, WifiOff } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

interface RequireSessionProps {
  /** Roles allowed into this app; anyone else sees a friendly "wrong app" page. */
  roles: readonly SessionRole[];
  loginPath: string;
  children: ReactNode;
}

/**
 * Restores the session from the refresh cookie on first load, then guards the routes:
 * signed out → login (remembering where you were), wrong role → explanation.
 */
export function RequireSession({ roles, loginPath, children }: RequireSessionProps) {
  const { status, session: current } = useSession();
  const location = useLocation();

  useEffect(() => {
    if (status === 'unknown') {
      void session.restore();
    }
  }, [status]);

  if (status === 'unknown') {
    return <LoadingState label="Signing you in…" className="min-h-dvh" />;
  }

  // Phone app without a connection: still signed in on this device, so offer a retry, not the login page.
  if (status === 'offline') {
    return (
      <EmptyState
        className="min-h-dvh"
        icon={WifiOff}
        title="No connection"
        description="Check your mobile data or Wi-Fi, then try again."
        action={
          <Button variant="primary" onClick={() => void session.restore()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (status === 'signed-out' || !current) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname + location.search }} />;
  }

  if (!roles.includes(current.user.role)) {
    return (
      <EmptyState
        className="min-h-dvh"
        icon={ShieldAlert}
        title="This app isn't for your account"
        description={`You're signed in as ${current.user.fullName}. Use the app for your role, or sign out and use another account.`}
        action={
          <Button variant="outline" onClick={() => void session.signOut()}>
            Sign out
          </Button>
        }
      />
    );
  }

  return children;
}

/** For login pages: already signed in → go where you were heading. */
export function useRedirectWhenSignedIn(): string | null {
  const { status } = useSession();
  const location = useLocation();

  useEffect(() => {
    if (status === 'unknown') {
      void session.restore();
    }
  }, [status]);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  return status === 'signed-in' ? from : null;
}
