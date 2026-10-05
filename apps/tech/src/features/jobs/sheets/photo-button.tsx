import { useUploadServiceRequestAttachment } from '@servicepro/api-client';
import { Button, toast } from '@servicepro/ui';
import { Camera } from 'lucide-react';
import { useRef } from 'react';

import { useRefreshJob } from '../use-job-mutations';

type PhotoKind = 'PHOTO_BEFORE' | 'PHOTO_AFTER';

/** Opens the rear camera on phones (file picker on desktop) and uploads straight away. */
export function PhotoButton({ jobId, kind, label, onUploaded }: { jobId: string; kind: PhotoKind; label: string; onUploaded?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const refresh = useRefreshJob(jobId);
  const upload = useUploadServiceRequestAttachment({
    mutation: {
      onSuccess: async () => {
        await refresh();
        toast.success('Photo added');
        onUploaded?.();
      },
    },
  });

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            upload.mutate({ serviceRequestId: jobId, data: { kind, file } });
          }

          event.target.value = '';
        }}
      />
      <Button variant="secondary" loading={upload.isPending} onClick={() => input.current?.click()}>
        <Camera aria-hidden /> {label}
      </Button>
    </>
  );
}
