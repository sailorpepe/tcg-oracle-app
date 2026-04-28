import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ALGORITHM_IDENTIFIER = 'AES-GCM';
const DERIVATION_ITERATIONS = 250000;
const KEY_LENGTH = 256;
const STORE_KEY = 'TCG_ORACLE_BYOK';

// Safe wrapper to retrieve crypto API
const getCrypto = () => {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        return window.crypto;
    }
    return null;
}

export async function secureEbayCredentials(userPin: string, rawAppId: string, rawSecret: string): Promise<void> {
    const cryptoObj = getCrypto();
    const rawPayload = JSON.stringify({ appId: rawAppId, secret: rawSecret });
    
    // If we are on Web and have Web Crypto API
    if (Platform.OS === 'web' && cryptoObj) {
        const cryptographicSalt = cryptoObj.getRandomValues(new Uint8Array(16));
        const initializationVector = cryptoObj.getRandomValues(new Uint8Array(12));

        const baseKeyMaterial = await cryptoObj.subtle.importKey(
            'raw',
            new TextEncoder().encode(userPin),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        const symmetricEncryptionKey = await cryptoObj.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: cryptographicSalt,
                iterations: DERIVATION_ITERATIONS,
                hash: 'SHA-256',
            },
            baseKeyMaterial,
            { name: ALGORITHM_IDENTIFIER, length: KEY_LENGTH },
            false,
            ['encrypt']
        );

        const encodedSecretData = new TextEncoder().encode(rawPayload);
        const encryptedBuffer = await cryptoObj.subtle.encrypt(
            { name: ALGORITHM_IDENTIFIER, iv: initializationVector },
            symmetricEncryptionKey,
            encodedSecretData
        );

        const storagePayload = JSON.stringify({
            salt: Array.from(cryptographicSalt),
            iv: Array.from(initializationVector),
            ciphertext: Array.from(new Uint8Array(encryptedBuffer)),
            isWebEncrypted: true
        });

        // On Web, use localStorage to store the AES-GCM ciphertext
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(STORE_KEY, storagePayload);
        }
    } else {
        // Native (iOS/Android) relies on hardware Keystore/Keychain
        await SecureStore.setItemAsync(STORE_KEY, JSON.stringify({ rawPayload, isWebEncrypted: false }), {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
        });
    }
}

export async function decryptEbayCredentials(userPin: string): Promise<{appId: string, secret: string} | null> {
    let payloadStr: string | null = null;
    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
            payloadStr = window.localStorage.getItem(STORE_KEY);
        }
    } else {
        payloadStr = await SecureStore.getItemAsync(STORE_KEY);
    }
    
    if (!payloadStr) return null;

    try {
        const payload = JSON.parse(payloadStr);

        if (payload.isWebEncrypted) {
            const cryptoObj = getCrypto();
            if (!cryptoObj) throw new Error("Web Crypto not available");

            const salt = new Uint8Array(payload.salt);
            const iv = new Uint8Array(payload.iv);
            const ciphertext = new Uint8Array(payload.ciphertext);

            const baseKeyMaterial = await cryptoObj.subtle.importKey(
                'raw',
                new TextEncoder().encode(userPin),
                { name: 'PBKDF2' },
                false,
                ['deriveKey']
            );

            const symmetricEncryptionKey = await cryptoObj.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: DERIVATION_ITERATIONS,
                    hash: 'SHA-256',
                },
                baseKeyMaterial,
                { name: ALGORITHM_IDENTIFIER, length: KEY_LENGTH },
                false,
                ['decrypt']
            );

            const decryptedBuffer = await cryptoObj.subtle.decrypt(
                { name: ALGORITHM_IDENTIFIER, iv: iv },
                symmetricEncryptionKey,
                ciphertext
            );

            const decryptedString = new TextDecoder().decode(decryptedBuffer);
            return JSON.parse(decryptedString);
        } else {
            // Native extraction
            return JSON.parse(payload.rawPayload);
        }
    } catch (e) {
        console.error("Decryption failed", e);
        return null;
    }
}

export async function hasSecureCredentials(): Promise<boolean> {
    let payloadStr: string | null = null;
    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
            payloadStr = window.localStorage.getItem(STORE_KEY);
        }
    } else {
        try {
            payloadStr = await SecureStore.getItemAsync(STORE_KEY);
        } catch (e) {
            return false;
        }
    }
    return !!payloadStr;
}
