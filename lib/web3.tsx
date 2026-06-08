import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

interface Web3ContextType {
  address: string | null;
  isConnected: boolean;
}

const Web3Context = createContext<Web3ContextType>({
  address: null,
  isConnected: false,
});

export const useWeb3 = () => useContext(Web3Context);

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleDeepLinkConnect = (e: any) => {
        if (e.detail && e.detail.address) {
          setAddress(e.detail.address);
        }
      };

      window.addEventListener('tcgoracle-connect', handleDeepLinkConnect);
      return () => window.removeEventListener('tcgoracle-connect', handleDeepLinkConnect);
    }
  }, []);

  return (
    <Web3Context.Provider value={{ address, isConnected: !!address }}>
      {children}
    </Web3Context.Provider>
  );
}
