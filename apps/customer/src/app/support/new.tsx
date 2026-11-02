import { getListMyTicketsQueryKey, isApiError, useListMyBookings, useOpenMyTicket, type TicketCategory } from '@servicepro/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { PressableScale, success } from '@/components/motion';
import { AppText, BottomBar, Button, Chip, Field, Input, Ionicons, Notice } from '@/components/ui';
import { pickPhotos, uploadTicketPhoto, type PickedPhoto } from '@/lib/upload';
import { TOPICS } from '@/lib/support';
import { colors, radius, space } from '@/lib/theme';

/** A new help request: the topic, which booking (optional), what happened, and up to three photos. */
export default function NewHelpRequestScreen() {
  const params = useLocalSearchParams<{ booking?: string; sr?: string }>();
  const queryClient = useQueryClient();
  const bookings = useListMyBookings();
  const open = useOpenMyTicket({ mutation: { meta: { silent: true } } });
  const [category, setCategory] = useState<TicketCategory | null>(params.booking ? 'BOOKING' : null);
  const [bookingId, setBookingId] = useState<string | null>(params.booking ?? null);
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const recent = [...(bookings.data ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5);
  const ready = category !== null && message.trim().length >= 5;

  function send() {
    if (!category) return;
    open.mutate(
      { data: { category, serviceRequestId: bookingId, message: message.trim() } },
      {
        onSuccess: async (ticket) => {
          if (photos.length > 0) {
            setUploading(true);
            const results = await Promise.allSettled(photos.map((photo) => uploadTicketPhoto(ticket.number, photo)));
            setUploading(false);
            setUploadFailed(results.some((r) => r.status === 'rejected'));
          }
          success();
          void queryClient.invalidateQueries({ queryKey: getListMyTicketsQueryKey() });
          router.replace(`/support/${ticket.number}`);
        },
      },
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: space.sm }}>
          <AppText variant="h3">What's it about?</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {TOPICS.map((topic) => (
              <Chip key={topic.value} label={topic.label} icon={topic.icon} selected={category === topic.value} onPress={() => setCategory(topic.value)} />
            ))}
          </View>
        </View>

        {recent.length > 0 ? (
          <View style={{ gap: space.sm }}>
            <AppText variant="h3">Which booking?</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              <Chip label="Not about a booking" selected={bookingId === null} onPress={() => setBookingId(null)} />
              {recent.map((b) => (
                <Chip key={b.id} label={`${b.categoryName} · ${b.srNumber}`} selected={bookingId === b.id} onPress={() => setBookingId(b.id)} />
              ))}
            </View>
          </View>
        ) : null}

        <Field label="Tell us what happened">
          <Input value={message} onChangeText={setMessage} multiline maxLength={2000} placeholder="The more detail, the quicker we can help." />
        </Field>

        <View style={{ gap: space.sm }}>
          <AppText variant="h3">Photos</AppText>
          <AppText variant="small" tone="muted">
            Optional: the appliance, an error code, damage or the bill (up to 3).
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {photos.map((photo, i) => (
              <View key={photo.uri}>
                <Image source={{ uri: photo.uri }} style={{ width: 84, height: 84, borderRadius: radius.control }} />
                <PressableScale
                  onPress={() => setPhotos(photos.filter((_, j) => j !== i))}
                  accessibilityLabel="Remove photo"
                  style={{ position: 'absolute', top: -6, right: -6, backgroundColor: colors.surface, borderRadius: 12 }}
                >
                  <Ionicons name="close-circle" size={24} color={colors.error} />
                </PressableScale>
              </View>
            ))}
            {photos.length < 3 ? (
              <>
                <PhotoButton icon="camera" label="Camera" onPress={async () => setPhotos([...photos, ...(await pickPhotos('camera', 3 - photos.length))])} />
                <PhotoButton icon="images" label="Gallery" onPress={async () => setPhotos([...photos, ...(await pickPhotos('library', 3 - photos.length))])} />
              </>
            ) : null}
          </View>
        </View>

        {isApiError(open.error) ? <Notice tone="error" title={open.error.message} /> : null}
        {uploadFailed ? <Notice tone="warning" title="Some photos didn't upload" description="Your message was sent. You can add photos in the conversation." /> : null}
      </ScrollView>
      <BottomBar>
        <Button label="Send to our team" icon="send" onPress={send} disabled={!ready} loading={open.isPending || uploading} />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

function PhotoButton({ icon, label, onPress }: { icon: 'camera' | 'images'; label: string; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Add a photo from the ${label.toLowerCase()}`}
      style={{ width: 84, height: 84, borderRadius: radius.control, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', gap: 4 }}
    >
      <Ionicons name={icon} size={22} color={colors.primary} />
      <AppText variant="caption" tone="primary" bold>
        {label}
      </AppText>
    </PressableScale>
  );
}
