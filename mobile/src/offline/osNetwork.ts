import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';
import { noteOsNetwork } from './connectivityStore';

// isConnected only: the API is on the local network, so a phone on Wi-Fi
// without internet (isInternetReachable=false) can still reach it.
function apply(state: NetworkState): void {
  if (state.isConnected === undefined) return;
  noteOsNetwork(state.isConnected);
}

/** Feeds OS network changes into the connectivity flag. Returns the unsubscribe. */
export function watchOsNetwork(): () => void {
  const sub = addNetworkStateListener(apply);
  getNetworkStateAsync().then(apply, () => undefined);
  return () => sub.remove();
}
