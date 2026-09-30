import { safeStorage } from 'electron';
import type { SecretCipher } from '../application/ports';

/** OS 보안 저장소(DPAPI · Keychain · libsecret)로 API Key를 암·복호화한다 (BR-AIP-03). */
export class SafeStorageCipher implements SecretCipher {
  isAvailable(): boolean {
    if (!safeStorage.isEncryptionAvailable()) return false;
    // Linux의 basic_text 백엔드는 실제로 보호하지 않으므로 사용 불가로 본다 (ai-provider/cross-cutting.md).
    return !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text');
  }

  encrypt(plain: string): Uint8Array {
    return new Uint8Array(safeStorage.encryptString(plain));
  }

  decrypt(secret: Uint8Array): string {
    return safeStorage.decryptString(Buffer.from(secret));
  }
}
