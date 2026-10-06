/**
 * End-to-End Encryption (E2EE) using Web Crypto API (AES-GCM 256-bit + PBKDF2)
 * Ensures that sensitive customer data, pricing, and project notes remain strictly confidential.
 */

const DEFAULT_SECRET_SALT = 'ENYAP_ISI_SALT_2026';
const ITERATIONS = 100000;

// Helper to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper to convert base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Derive AES-GCM key from user passphrase
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plain text string into a portable JSON string
 */
export async function encryptText(plainText: string, passphrase: string): Promise<string> {
  try {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource
      },
      key,
      enc.encode(plainText)
    );

    const bundle = {
      v: 1,
      salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
      iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
      data: arrayBufferToBase64(ciphertext)
    };

    return 'E2EE:' + JSON.stringify(bundle);
  } catch (err) {
    console.error('Encryption failed:', err);
    throw new Error('Şifreleme işlemi başarısız oldu.');
  }
}

/**
 * Decrypts an encrypted bundle string
 */
export async function decryptText(encryptedString: string, passphrase: string): Promise<string> {
  try {
    if (!encryptedString.startsWith('E2EE:')) {
      return encryptedString; // Not encrypted
    }

    const jsonStr = encryptedString.substring(5);
    const bundle = JSON.parse(jsonStr);

    const salt = base64ToUint8Array(bundle.salt);
    const iv = base64ToUint8Array(bundle.iv);
    const data = base64ToUint8Array(bundle.data);

    const key = await deriveKey(passphrase, salt);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource
      },
      key,
      data as unknown as BufferSource
    );

    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (err) {
    console.error('Decryption failed:', err);
    throw new Error('Şifre çözülemedi. Şifreleme anahtarı hatalı olabilir.');
  }
}

/**
 * Returns whether a text is encrypted with E2EE prefix
 */
export function isEncrypted(text: string): boolean {
  return typeof text === 'string' && text.startsWith('E2EE:');
}
