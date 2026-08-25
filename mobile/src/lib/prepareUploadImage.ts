import * as ImageManipulator from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { LocalFile } from '../api/client';

const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.8;

/**
 * Convert a camera/library pick to a browser-safe JPEG and cap the long edge
 * so iPhone HEIC originals (~2MB) are not stored as broken web images.
 */
export async function prepareUploadImage(
  asset: ImagePickerAsset,
): Promise<LocalFile> {
  const w = asset.width ?? 0;
  const h = asset.height ?? 0;
  const actions: ImageManipulator.Action[] = [];
  if (w > MAX_EDGE || h > MAX_EDGE) {
    if (w >= h) {
      actions.push({ resize: { width: MAX_EDGE } });
    } else {
      actions.push({ resize: { height: MAX_EDGE } });
    }
  }

  const result = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return {
    uri: result.uri,
    name: toJpegName(asset.fileName),
    type: 'image/jpeg',
  };
}

function toJpegName(name?: string | null): string {
  const raw = (name && name.trim()) || `photo-${Date.now()}`;
  const base = raw.replace(/\.[^.]+$/, '');
  return `${base || 'photo'}.jpg`;
}
