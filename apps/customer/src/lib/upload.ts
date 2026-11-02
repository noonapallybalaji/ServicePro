import { apiFetch } from '@servicepro/api-client';
import * as ImagePicker from 'expo-image-picker';

/** A photo chosen on the phone, ready to upload (React Native sends files as { uri, name, type }). */
export interface PickedPhoto {
  uri: string;
  name: string;
  type: string;
}

/** Opens the gallery (or the camera) and returns the photos chosen, shrunk to a sensible size. */
export async function pickPhotos(source: 'library' | 'camera', limit = 3): Promise<PickedPhoto[]> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: source === 'library', selectionLimit: limit };
  const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return [];
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map((asset, i) => ({
    uri: asset.uri,
    name: asset.fileName ?? `photo-${Date.now()}-${i}.jpg`,
    type: asset.mimeType ?? 'image/jpeg',
  }));
}

/** Adds a photo to a help request. */
export function uploadTicketPhoto(number: string, photo: PickedPhoto) {
  const form = new FormData();
  form.append('file', photo as unknown as Blob);
  return apiFetch<number>(`/api/v1/account/support/${encodeURIComponent(number)}/photos`, { method: 'POST', body: form });
}
