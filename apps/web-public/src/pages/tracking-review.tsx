import { getGetTrackingQueryKey, isApiError, useSubmitReview, type ReviewResponse } from '@servicepro/api-client';
import { Alert, Button, Card, Field, Text, Textarea, cn } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useState } from 'react';

const LABELS = ['', 'Poor', 'Not great', 'OK', 'Good', 'Excellent'] as const;

/** "How was the visit?" once the job is finished: 1–5 stars and an optional comment, once. */
export function ReviewCard({ token, technicianName, canReview, review }: { token: string; technicianName?: string; canReview: boolean; review?: ReviewResponse | null }) {
  if (review) {
    return (
      <Card className="flex flex-col gap-2">
        <Text variant="overline" tone="muted">
          Your rating
        </Text>
        <Stars value={review.rating} />
        {review.comment ? <Text variant="sm" tone="secondary">“{review.comment}”</Text> : null}
        <Text variant="sm" tone="success">
          Thank you for your feedback.
        </Text>
      </Card>
    );
  }

  return canReview ? <ReviewForm token={token} technicianName={technicianName} /> : null;
}

function ReviewForm({ token, technicianName }: { token: string; technicianName?: string }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const queryClient = useQueryClient();
  const submit = useSubmitReview({
    mutation: { meta: { silent: true }, onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTrackingQueryKey(token) }) },
  });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Text variant="overline" tone="muted">
          Rate your visit
        </Text>
        <Text weight="semibold">How was {technicianName ? `${technicianName.split(' ')[0]}'s` : 'the'} visit?</Text>
      </div>
      <div role="radiogroup" aria-label="Rating" className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} star${value > 1 ? 's' : ''}: ${LABELS[value]}`}
            onClick={() => setRating(value)}
            className="pressable transition-interactive flex size-11 items-center justify-center rounded-pill hover:bg-surface-sunken"
          >
            <Star aria-hidden className={cn('size-8', value <= rating ? 'fill-rating text-rating' : 'text-border-strong')} />
          </button>
        ))}
        {rating > 0 ? (
          <Text variant="sm" tone="secondary" className="ml-2">
            {LABELS[rating]}
          </Text>
        ) : null}
      </div>
      {rating > 0 ? (
        <>
          <Field label={rating <= 2 ? 'What went wrong?' : 'Anything to add?'} optional hint={rating <= 2 ? "We'll look into it and may call you." : undefined}>
            <Textarea value={comment} maxLength={1000} onChange={(event) => setComment(event.target.value)} />
          </Field>
          {isApiError(submit.error) ? <Alert role="alert" tone="error" title={submit.error.message} /> : null}
          <Button className="self-start" loading={submit.isPending} onClick={() => submit.mutate({ token, data: { rating, comment: comment.trim() || null } })}>
            Send rating
          </Button>
        </>
      ) : null}
    </Card>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-1" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={cn('size-6', n <= value ? 'fill-rating text-rating' : 'text-border-strong')} />
      ))}
    </span>
  );
}
