import crypto from 'crypto';
import logger from '../configs/logger.config';

const ALGORITHM = 'aes-256-gcm';
const KEY_ENV   = 'ENCRYPTION_MASTER_KEY';

// Returns the 32-byte master key, or null if not configured.
function getMasterKey(): Buffer | null {
    const hex = process.env[KEY_ENV];
    if (!hex) return null;
    if (hex.length !== 64) {
        logger.warn(`${KEY_ENV} must be a 64-character hex string (32 bytes). Encryption is disabled.`);
        return null;
    }
    return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns "enc:<iv>:<authTag>:<ciphertext>" (all hex).
 * Falls back to plaintext with a warning if ENCRYPTION_MASTER_KEY is not set.
 */
export function encryptValue(plaintext: string): string {
    const key = getMasterKey();
    if (!key) {
        logger.warn('ENCRYPTION_MASTER_KEY is not set — API key stored as plaintext. Add it to .env for security.');
        return plaintext;
    }
    const iv     = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag    = cipher.getAuthTag();
    return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/**
 * Decrypts a value produced by encryptValue.
 * Returns plaintext unchanged if it does not start with "enc:" (backward-compat).
 * Returns '' and logs an error if decryption fails.
 */
export function decryptValue(value: string): string {
    if (!value || !value.startsWith('enc:')) return value;
    const key = getMasterKey();
    if (!key) {
        logger.error('Cannot decrypt stored value: ENCRYPTION_MASTER_KEY is not set.');
        return '';
    }
    try {
        const parts = value.split(':');
        if (parts.length !== 4) return value;
        const [, ivHex, tagHex, encHex] = parts;
        const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        return Buffer.concat([
            decipher.update(Buffer.from(encHex, 'hex')),
            decipher.final(),
        ]).toString('utf8');
    } catch (err) {
        logger.error('Failed to decrypt value:', err);
        return '';
    }
}
