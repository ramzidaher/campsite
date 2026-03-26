import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Fragment, type ReactNode, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'CAMPSITE_REACT_QUERY',
});

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 1000 * 60 * 60 * 24 * 7,
        retry: 1,
      },
    },
  });
}

function bindReactQueryNativeListeners() {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected);
    })
  );

  focusManager.setEventListener((handleFocus) => {
    const onChange = (status: AppStateStatus) => {
      handleFocus(status === 'active');
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  });
}

export function CampsiteQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);

  useEffect(() => {
    bindReactQueryNativeListeners();
  }, []);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        dehydrateOptions: {
          shouldDehydrateQuery: (q) =>
            q.state.status === 'success' &&
            typeof q.queryKey[0] === 'string' &&
            ['broadcasts', 'rota-shifts', 'discount-qr'].includes(q.queryKey[0] as string),
        },
      }}
    >
      <Fragment>{children}</Fragment>
    </PersistQueryClientProvider>
  );
}
