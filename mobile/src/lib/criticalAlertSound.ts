import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

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

type Player = ReturnType<typeof createAudioPlayer>;
let player: Player | null = null;

/** Plays only when the Profile toggle is on. Never throws to callers. */
export async function playCriticalAlertIfEnabled(): Promise<boolean> {
  try {
    if (!(await getCriticalSoundEnabled())) return false;
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
    });
    if (player) {
      player.remove();
      player = null;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    player = createAudioPlayer(require('../../assets/critical-beep.wav'));
    player.volume = 1;
    player.seekTo(0);
    player.play();
    return true;
  } catch {
    return false;
  }
}
