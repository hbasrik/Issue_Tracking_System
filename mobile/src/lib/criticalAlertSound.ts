import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';

export const CRITICAL_SOUND_PREF_KEY = 'karea-critical-sound-alerts';

/** Device-local preference; default OFF so phones stay quiet. */
export async function getCriticalSoundEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CRITICAL_SOUND_PREF_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setCriticalSoundEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(CRITICAL_SOUND_PREF_KEY, enabled ? '1' : '0');
}

let sound: Audio.Sound | null = null;

/** Plays only when the Profile toggle is on. Never throws to callers. */
export async function playCriticalAlertIfEnabled(): Promise<boolean> {
  try {
    if (!(await getCriticalSoundEnabled())) return false;
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    if (sound) {
      await sound.unloadAsync().catch(() => undefined);
      sound = null;
    }
    const created = await Audio.Sound.createAsync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../assets/critical-beep.wav'),
      { shouldPlay: true, volume: 1 },
    );
    sound = created.sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        void sound?.unloadAsync().catch(() => undefined);
        sound = null;
      }
    });
    return true;
  } catch {
    return false;
  }
}
