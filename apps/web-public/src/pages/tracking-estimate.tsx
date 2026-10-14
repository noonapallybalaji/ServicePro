import {
  getGetCustomerEstimateQueryKey,
  getGetTrackingQueryKey,
  isApiError,
  useAnswerEstimate,
  useGetCustomerEstimate,
  useRequestEstimateCode,
  type EstimateResponse,
} from '@servicepro/api-client';
import { Alert, Button, Card, Field, OtpInput, Text, Textarea, formatINR } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useState } from 'react';

/**
 * The technician's estimate, waiting for the customer (PLAN.md §4.4). Approving needs a code
 * sent to the phone on the booking, so a forwarded tracking link alone can't approve spending.
 */
export function EstimateCard({ token }: { token: string }) {
  const estimate = useGetCustomerEstimate(token, { query: { retry: false } });
  if (!estimate.data) return null;
  const { estimate: current, codeRequired } = estimate.data;

  return (
    <Card className="flex flex-col gap-4 border-l-4 border-l-primary">
      <div className="flex flex-col gap-1">
        <Text variant="overline" tone="muted">
          Repair estimate{current.version > 1 ? ` (revised)` : ''}
        </Text>
        {current.status === 'SENT' ? (
          <Text weight="semibold">Please review: nothing extra is done until you approve.</Text>
        ) : null}
      </div>
      <EstimateLines estimate={current} />
      {current.status === 'SENT' ? (
        <Answer token={token} estimate={current} codeRequired={codeRequired} />
      ) : current.status === 'APPROVED' ? (
        <Text variant="sm" tone="success">
          You approved this estimate. The repair is under way.
        </Text>
      ) : current.status === 'REJECTED' ? (
        <Text variant="sm" tone="secondary">
          You declined this estimate. Only the visiting charge applies.
        </Text>
      ) : null}
    </Card>
  );
}

function EstimateLines({ estimate }: { estimate: EstimateResponse }) {
  return (
    <>
      <ul className="flex flex-col gap-1">
        {estimate.lines.map((line, index) => (
          <li key={`${line.description}-${index}`} className="flex justify-between gap-3 text-sm">
            <span className="text-foreground-secondary">
              {line.description}
              {line.quantity !== 1 ? ` × ${line.quantity}` : ''}
            </span>
            <span className="tabular-nums">{formatINR(line.amount)}</span>
          </li>
        ))}
        {estimate.taxAmount > 0 ? (
          <li className="flex justify-between gap-3 text-sm">
            <span className="text-foreground-secondary">GST ({estimate.taxRatePercent}%)</span>
            <span className="tabular-nums">{formatINR(estimate.taxAmount)}</span>
          </li>
        ) : null}
      </ul>
      <div className="flex items-baseline justify-between border-t border-border pt-3">
        <Text weight="semibold">Total</Text>
        <Text variant="stat-sm">{formatINR(estimate.total)}</Text>
      </div>
    </>
  );
}

function Answer({ token, estimate, codeRequired }: { token: string; estimate: EstimateResponse; codeRequired: boolean }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'choose' | 'code' | 'decline'>('choose');
  const [sent, setSent] = useState<{ length: number; developmentCode?: string | null } | null>(null);
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const requestCode = useRequestEstimateCode({ mutation: { meta: { silent: true } } });
  const answer = useAnswerEstimate({
    mutation: {
      meta: { silent: true },
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetTrackingQueryKey(token) }),
          queryClient.invalidateQueries({ queryKey: getGetCustomerEstimateQueryKey(token) }),
        ]),
    },
  });
  const error = isApiError(answer.error) ? answer.error.message : isApiError(requestCode.error) ? requestCode.error.message : undefined;

  function approve() {
    if (!codeRequired) {
      answer.mutate({ token, estimateId: estimate.id, data: { approve: true, code: null, reason: null } });
      return;
    }

    requestCode.mutate(
      { token },
      {
        onSuccess: (issued) => {
          setSent({ length: issued.codeLength, developmentCode: issued.developmentCode });
          setCode('');
          setStep('code');
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert role="alert" tone="error" title={error} /> : null}
      {step === 'choose' ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" loading={requestCode.isPending || answer.isPending} onClick={approve}>
            <Check aria-hidden /> Approve {formatINR(estimate.total)}
          </Button>
          <Button size="lg" variant="ghost" onClick={() => setStep('decline')}>
            <X aria-hidden /> Decline
          </Button>
        </div>
      ) : step === 'code' && sent ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            answer.mutate({ token, estimateId: estimate.id, data: { approve: true, code, reason: null } });
          }}
        >
          <Field label="Enter the code we sent to your phone" hint={sent.developmentCode ? `Development code: ${sent.developmentCode}` : 'It confirms that you agree to this cost.'}>
            <OtpInput length={sent.length} value={code} onValueChange={setCode} />
          </Field>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" size="lg" loading={answer.isPending} disabled={code.length !== sent.length}>
              Confirm approval
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep('choose')}>
              Back
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Why are you declining?" optional hint="Only the visiting charge applies. The technician won't do the repair.">
            <Textarea value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="destructive"
              loading={answer.isPending}
              onClick={() => answer.mutate({ token, estimateId: estimate.id, data: { approve: false, code: null, reason: reason.trim() || null } })}
            >
              Decline estimate
            </Button>
            <Button variant="ghost" onClick={() => setStep('choose')}>
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
