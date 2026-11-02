import {
  apiUrl,
  checkOnlinePayment,
  getGetMyBookingQueryKey,
  isApiError,
  useAnswerEstimate,
  useGetCustomerEstimate,
  useRequestEstimateCode,
  useRequestWarrantyRevisit,
  useStartOnlinePayment,
  useSubmitReview,
  type InvoiceSummary,
  type ReviewResponse,
  type ServiceRequestStatus,
  type TrackingPhoto,
  type WarrantyCardResponse,
} from '@servicepro/api-client';
import { useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { PressableScale, success, tap } from '@/components/motion';
import { AppText, Badge, Button, Card, Chip, CodeInput, Field, IconCircle, Input, Ionicons, Notice } from '@/components/ui';
import { formatDate, formatINR } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';

/*
 * The after-booking parts of a booking, as on the website's tracking page: the estimate to approve,
 * the bill (pay online, invoice), the technician's photos, the completion code, the rating and the
 * warranty. Each refreshes the booking when it changes something.
 */

function useRefreshBooking(id: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: getGetMyBookingQueryKey(id) });
}

/** The estimate the technician sent: approve (with a code when required) or decline. */
export function EstimateCard({ bookingId, token, status }: { bookingId: string; token: string; status: ServiceRequestStatus }) {
  const refresh = useRefreshBooking(bookingId);
  const estimate = useGetCustomerEstimate(token, { query: { retry: false, refetchInterval: status === 'AWAITING_ESTIMATE_APPROVAL' ? 15_000 : false } });
  const requestCode = useRequestEstimateCode({ mutation: { meta: { silent: true } } });
  const answer = useAnswerEstimate({ mutation: { meta: { silent: true } } });
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<{ length: number; developmentCode: string | null | undefined } | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  if (!estimate.data) return null;
  const { estimate: e, codeRequired } = estimate.data;
  const open = e.status === 'SENT';
  const error = isApiError(answer.error) ? answer.error.message : isApiError(requestCode.error) ? requestCode.error.message : null;

  const respond = (approve: boolean) =>
    answer.mutate(
      { token, estimateId: e.id, data: { approve, code: approve && codeRequired ? code : null, reason: approve ? null : reason.trim() || null } },
      {
        onSuccess: () => {
          if (approve) success();
          void estimate.refetch();
          void refresh();
        },
      },
    );

  return (
    <Card style={{ gap: space.md, borderColor: open ? colors.warningBorder : colors.border, borderWidth: open ? 2 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <IconCircle name="document-text" tone={open ? 'warning' : 'primary'} />
        <View style={{ flex: 1 }}>
          <AppText variant="h3">Repair estimate</AppText>
          <AppText variant="caption" tone="muted">
            Sent {formatDate(e.sentAt)}
            {e.version > 1 ? ` · revision ${e.version}` : ''}
          </AppText>
        </View>
        <Badge
          label={open ? 'Waiting for you' : e.status === 'APPROVED' ? 'Approved' : e.status === 'REJECTED' ? 'Declined' : 'Replaced'}
          tone={open ? 'warning' : e.status === 'APPROVED' ? 'success' : 'neutral'}
        />
      </View>
      {e.lines.map((line, i) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
          <AppText variant="small" tone="secondary" style={{ flex: 1 }}>
            {line.description}
            {line.quantity > 1 ? ` × ${line.quantity}` : ''}
          </AppText>
          <AppText variant="small" semibold>
            {formatINR(line.amount)}
          </AppText>
        </View>
      ))}
      {e.taxAmount > 0 ? <Line label={`Tax (${e.taxRatePercent}%)`} value={formatINR(e.taxAmount)} /> : null}
      <View style={styles.divider} />
      <Line label="Total" value={formatINR(e.total)} strong />

      {open ? (
        declining ? (
          <Animated.View entering={FadeIn} style={{ gap: space.md }}>
            <Field label="Why not?" optional hint="You pay only the visiting charge if you decline.">
              <Input value={reason} onChangeText={setReason} multiline maxLength={300} placeholder="Too expensive, want to think about it…" />
            </Field>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button label="Back" variant="outline" onPress={() => setDeclining(false)} style={{ flex: 1 }} />
              <Button label="Decline" variant="danger" onPress={() => respond(false)} loading={answer.isPending} style={{ flex: 1 }} />
            </View>
          </Animated.View>
        ) : codeRequired && sent ? (
          <Animated.View entering={FadeIn} style={{ gap: space.md }}>
            <Field label="Code sent to your phone" hint={sent.developmentCode ? `Test code: ${sent.developmentCode}` : 'Enter it to approve the estimate.'}>
              <CodeInput length={sent.length} value={code} onChange={setCode} />
            </Field>
            <Button label={`Approve ${formatINR(e.total)}`} variant="accent" icon="checkmark" onPress={() => respond(true)} loading={answer.isPending} disabled={code.length !== sent.length} />
          </Animated.View>
        ) : (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label="Decline" variant="outline" onPress={() => setDeclining(true)} style={{ flex: 1 }} />
            <Button
              label="Approve"
              variant="accent"
              icon="checkmark"
              style={{ flex: 1.4 }}
              loading={requestCode.isPending || answer.isPending}
              onPress={() =>
                codeRequired
                  ? requestCode.mutate({ token }, { onSuccess: (r) => setSent({ length: r.codeLength, developmentCode: r.developmentCode }) })
                  : respond(true)
              }
            />
          </View>
        )
      ) : null}
      {error ? <Notice tone="error" title={error} /> : null}
    </Card>
  );
}

/** The bill: what's due, pay online (gateway in the browser), download the invoice. */
export function BillCard({ bookingId, token, invoice, visitCharge, paid }: { bookingId: string; token: string; invoice: InvoiceSummary | null; visitCharge: number; paid: boolean }) {
  const refresh = useRefreshBooking(bookingId);
  const start = useStartOnlinePayment({ mutation: { meta: { silent: true } } });
  const [checking, setChecking] = useState(false);
  const due = invoice ? Math.max(0, invoice.total - invoice.amountPaid) : 0;

  async function pay() {
    start.mutate(
      { token },
      {
        onSuccess: async (link) => {
          await WebBrowser.openBrowserAsync(link.url);
          // Back from the payment page: ask the gateway, in case its confirmation is late.
          setChecking(true);
          try {
            const result = await checkOnlinePayment(token);
            if (result.paid) success();
          } finally {
            setChecking(false);
            void refresh();
          }
        },
      },
    );
  }

  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <IconCircle name="receipt" tone={paid || (invoice && due === 0) ? 'success' : 'primary'} />
        <View style={{ flex: 1 }}>
          <AppText variant="h3">{invoice ? `Invoice ${invoice.invoiceNumber}` : 'Charges'}</AppText>
          <AppText variant="caption" tone="muted">
            {paid || (invoice && due === 0) ? 'Paid. Thank you!' : 'Pay after the work is done.'}
          </AppText>
        </View>
      </View>
      {invoice ? (
        <>
          {invoice.lines.map((line, i) => (
            <Line key={i} label={`${line.description}${line.quantity > 1 ? ` × ${line.quantity}` : ''}`} value={formatINR(line.amount)} />
          ))}
          <View style={styles.divider} />
          <Line label="Total" value={formatINR(invoice.total)} strong />
          {invoice.amountPaid > 0 ? <Line label="Paid" value={formatINR(invoice.amountPaid)} /> : null}
          {due > 0 && invoice.canPayOnline ? (
            <Button label={`Pay ${formatINR(due)} online`} variant="accent" icon="card" onPress={() => void pay()} loading={start.isPending || checking} />
          ) : null}
          <Button
            label="Download invoice"
            variant="outline"
            icon="download"
            onPress={() => void Linking.openURL(apiUrl(`/api/v1/public/track/${encodeURIComponent(token)}/invoice.pdf`))}
          />
        </>
      ) : (
        <Line label="Visiting charge" value={formatINR(visitCharge)} />
      )}
      {isApiError(start.error) ? <Notice tone="error" title={start.error.message} /> : null}
    </Card>
  );
}

/** Before and after photos from the technician; tap one to see it full screen. */
export function PhotosCard({ photos }: { photos: TrackingPhoto[] }) {
  const [open, setOpen] = useState<TrackingPhoto | null>(null);
  if (photos.length === 0) return null;
  return (
    <Card style={{ gap: space.md }}>
      <AppText variant="h3">Photos from the technician</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {photos.map((photo) => (
          <PressableScale key={photo.id} onPress={() => setOpen(photo)} accessibilityRole="imagebutton" accessibilityLabel={photo.kind === 'PHOTO_AFTER' ? 'After photo' : 'Before photo'}>
            <Image source={{ uri: apiUrl(photo.url) }} style={styles.thumb} />
            <View style={styles.thumbLabel}>
              <AppText variant="caption" tone="inverse" bold>
                {photo.kind === 'PHOTO_AFTER' ? 'After' : photo.kind === 'PHOTO_BEFORE' ? 'Before' : 'Photo'}
              </AppText>
            </View>
          </PressableScale>
        ))}
      </ScrollView>
      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.viewer} onPress={() => setOpen(null)} accessibilityLabel="Close photo">
          {open ? <Animated.Image entering={ZoomIn.duration(220)} source={{ uri: apiUrl(open.url) }} style={{ width: '100%', height: '75%' }} resizeMode="contain" /> : null}
          <AppText tone="inverse" center style={{ marginTop: space.lg }}>
            Tap anywhere to close
          </AppText>
        </Pressable>
      </Modal>
    </Card>
  );
}

/** The code that lets the technician close the job: shown once they've arrived. */
export function CompletionCodeCard({ code }: { code: string }) {
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.accentSubtle, borderColor: colors.accentBorder }}>
      <IconCircle name="key" tone="accent" />
      <View style={{ flex: 1 }}>
        <AppText variant="caption" tone="accent" bold>
          YOUR COMPLETION CODE
        </AppText>
        <AppText variant="title" style={{ letterSpacing: 6 }}>
          {code}
        </AppText>
        <AppText variant="caption" tone="secondary">
          Share it with the technician only when the work is done.
        </AppText>
      </View>
    </Card>
  );
}

/** Rate the finished job (once), or what they said. */
export function ReviewCard({ bookingId, token, canReview, review, technicianName }: { bookingId: string; token: string; canReview: boolean; review: ReviewResponse | null; technicianName?: string }) {
  const refresh = useRefreshBooking(bookingId);
  const submit = useSubmitReview({ mutation: { meta: { silent: true } } });
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  if (review) {
    return (
      <Card style={{ gap: space.sm }}>
        <AppText variant="h3">Your rating</AppText>
        <Stars value={review.rating} size={24} />
        {review.comment ? <AppText tone="secondary">“{review.comment}”</AppText> : null}
        <AppText variant="caption" tone="muted">
          Thanks for your feedback!
        </AppText>
      </Card>
    );
  }
  if (!canReview) return null;

  return (
    <Card style={{ gap: space.md }}>
      <AppText variant="h3">How was {technicianName ? technicianName.split(' ')[0] : 'the repair'}?</AppText>
      <Stars value={rating} size={36} onChange={setRating} />
      {rating > 0 ? (
        <Animated.View entering={FadeIn} style={{ gap: space.md }}>
          <Input value={comment} onChangeText={setComment} multiline maxLength={500} placeholder={rating >= 4 ? 'What went well?' : 'What could be better?'} />
          <Button
            label="Submit rating"
            onPress={() =>
              submit.mutate(
                { token, data: { rating, comment: comment.trim() || null } },
                {
                  onSuccess: () => {
                    success();
                    void refresh();
                  },
                },
              )
            }
            loading={submit.isPending}
          />
        </Animated.View>
      ) : null}
      {isApiError(submit.error) ? <Notice tone="error" title={submit.error.message} /> : null}
    </Card>
  );
}

export function Stars({ value, size = 24, onChange }: { value: number; size?: number; onChange?: (value: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <PressableScale
            key={n}
            scaleTo={0.85}
            onPress={() => {
              tap();
              onChange(n);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
          >
            <Ionicons name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? colors.accent : colors.borderStrong} />
          </PressableScale>
        ) : (
          <Ionicons key={n} name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? colors.accent : colors.borderStrong} />
        ),
      )}
    </View>
  );
}

/** Warranty: until when, and a free revisit if the problem comes back. */
export function WarrantyCard({ bookingId, warranty }: { bookingId: string; warranty: WarrantyCardResponse }) {
  const refresh = useRefreshBooking(bookingId);
  const revisit = useRequestWarrantyRevisit({ mutation: { meta: { silent: true } } });
  const [asking, setAsking] = useState(false);
  const [description, setDescription] = useState('');

  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <IconCircle name="shield-checkmark" tone={warranty.active ? 'success' : 'neutral'} />
        <View style={{ flex: 1 }}>
          <AppText variant="h3">{warranty.active ? `Warranty until ${formatDate(warranty.until)}` : 'Warranty ended'}</AppText>
          <AppText variant="caption" tone="muted">
            {warranty.terms}
          </AppText>
        </View>
      </View>
      {warranty.openRevisitSrNumber ? <Notice tone="info" title={`Revisit requested (${warranty.openRevisitSrNumber})`} description="We'll call you to arrange it." /> : null}
      {warranty.canRequestRevisit && !warranty.openRevisitSrNumber ? (
        asking ? (
          <Animated.View entering={FadeIn} style={{ gap: space.md }}>
            <Field label="What's happening again?">
              <Input value={description} onChangeText={setDescription} multiline maxLength={500} placeholder="Same problem is back since yesterday…" />
            </Field>
            <Button
              label="Request a free revisit"
              disabled={description.trim().length < 5}
              loading={revisit.isPending}
              onPress={() =>
                revisit.mutate(
                  { id: bookingId, data: { description: description.trim() } },
                  {
                    onSuccess: () => {
                      success();
                      setAsking(false);
                      void refresh();
                    },
                  },
                )
              }
            />
          </Animated.View>
        ) : (
          <Button label="Problem came back? Request a revisit" variant="outline" icon="refresh" onPress={() => setAsking(true)} />
        )
      ) : null}
      {isApiError(revisit.error) ? <Notice tone="error" title={revisit.error.message} /> : null}
    </Card>
  );
}

export const CANCEL_REASONS = ['Booked by mistake', 'Got it fixed elsewhere', 'Price is too high', 'Need a different time', 'Other'];

/** A bottom sheet to cancel, with a reason. */
export function CancelSheet({ visible, onClose, onConfirm, busy }: { visible: boolean; onClose: () => void; onConfirm: (reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState<string | null>(null);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <AppText variant="h2">Cancel this booking?</AppText>
        <AppText tone="secondary">We won't send a technician. Tell us why, so we can do better.</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {CANCEL_REASONS.map((r) => (
            <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
          ))}
        </View>
        <Button label="Cancel booking" variant="danger" onPress={() => onConfirm(reason ?? 'Other')} disabled={!reason} loading={busy} />
        <Button label="Keep my booking" variant="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
      <AppText variant={strong ? 'body' : 'small'} tone={strong ? 'default' : 'secondary'} bold={strong} style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant={strong ? 'h3' : 'small'} semibold={!strong}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { height: 1, backgroundColor: colors.border },
  thumb: { width: 120, height: 120, borderRadius: radius.control, backgroundColor: colors.sunken },
  thumbLabel: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.overlay },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: space.xl, paddingBottom: space.xxl, gap: space.md },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: space.sm },
});
