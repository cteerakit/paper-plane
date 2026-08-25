import { LogIn } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface SignInCardProps {
  onSignIn: () => void;
  loading?: boolean;
  error?: string | null;
}

export function SignInCard({ onSignIn, loading, error }: SignInCardProps) {
  return (
    <Card className="border-dashed dark:border-border">
      <CardHeader>
        <CardTitle>Connect Google</CardTitle>
        <CardDescription>
          Connect Google to load mail, calendar, and tasks in the side panel.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button onClick={onSignIn} disabled={loading} className="w-full">
          <LogIn className="size-4" />
          Continue with Google
        </Button>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <p className="text-muted-foreground text-xs">
          Note still uses your existing Chrome session in an embed and does not need this sign-in.
        </p>
      </CardContent>
    </Card>
  );
}
