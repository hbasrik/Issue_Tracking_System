import { useEffect, useState } from 'react';
import {
  isAppOnline,
  subscribeConnectivity,
} from './connectivityStore';

export {
  noteTransportSuccess,
  noteTransportFailure,
  isAppOnline,
  subscribeConnectivity,
  resetConnectivityForTests,
} from './connectivityStore';

export function useAppOnline(): boolean {
  const [flag, setFlag] = useState(() => isAppOnline());
  useEffect(() => subscribeConnectivity(setFlag), []);
  return flag;
}
