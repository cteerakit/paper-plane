import { useEffect, useState } from 'react';
import { AlertCircle, HardDrive } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchRecentFiles, formatMimeLabel, type DriveFile } from '@/lib/google/api';

interface DriveSectionProps {
  enabled: boolean;
}

export function DriveSection({ enabled }: DriveSectionProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRecentFiles()
      .then((data) => {
        if (!cancelled) setFiles(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load Drive');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4 pb-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="size-4" />
          Recent files
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Drive unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!loading && !error && files.length === 0 && (
          <p className="text-muted-foreground text-sm">No recent files.</p>
        )}
        {!loading && !error && files.length > 0 && (
          <ul className="space-y-2">
            {files.map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  className="hover:bg-surface-2 flex w-full cursor-pointer items-center gap-2 rounded-md border p-2 text-left text-sm dark:border-transparent"
                  onClick={() => {
                    if (file.webViewLink) browser.tabs.create({ url: file.webViewLink });
                  }}
                >
                  {file.iconLink && (
                    <img src={file.iconLink} alt="" className="size-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {formatMimeLabel(file.mimeType)}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
