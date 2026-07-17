// App-side binding of the storage core to AsyncStorage. Kept separate from
// storage.ts so the pure core stays importable in node tests.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createStore } from './storage';

/** Per-key migrations from older schema versions land here as they appear. */
export const store = createStore(AsyncStorage, {});
