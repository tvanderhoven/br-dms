/**
 * BR-DMS – AES-256-GCM Verschlüsselung
 *
 * Jede Datei wird mit einem einzigartigen 12-Byte-IV verschlüsselt.
 * Das Dateiformat auf Disk ist:
 *
 *   [IV: 12 Bytes][AuthTag: 16 Bytes][Ciphertext: N Bytes]
 *
 * AES-256-GCM bietet:
 *  - Vertraulichkeit (kein Lesen ohne Schlüssel)
 *  - Integrität (AuthTag erkennt Manipulation)
 *  - Performance (Hardware-Beschleunigung auf allen modernen CPUs)
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  scryptSync,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import fs from "node:fs/promises";
import path from "node:path";

// ----------------------------------------------------------------
//  Konstanten
// ----------------------------------------------------------------
const ALGORITHM  = "aes-256-gcm" as const;
const IV_LENGTH  = 12;   // GCM empfiehlt 96-Bit IV
const TAG_LENGTH = 16;   // Auth-Tag Länge in Bytes
const KEY_LENGTH = 32;   // 256-Bit Schlüssel

// ----------------------------------------------------------------
//  Schlüssel-Management
// ----------------------------------------------------------------

/**
 * Leitet einen deterministischen 256-Bit-Schlüssel aus dem Master-Key
 * und einem kontextuellen Salt (Dokument-ID) ab.
 * So hat jedes Dokument einen eigenen abgeleiteten Schlüssel,
 * ohne den Master-Key direkt zu verwenden.
 */
function deriveKey(masterKeyHex: string, documentId: string): Buffer {
  const masterKey = Buffer.from(masterKeyHex, "hex");
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY muss 32 Bytes (64 Hex-Zeichen) lang sein. Aktuell: ${masterKey.length} Bytes`
    );
  }
  // scrypt: memory-hard, widerstandsfähig gegen Brute-Force
  return scryptSync(masterKey, documentId, KEY_LENGTH, { N: 2048, r: 8, p: 1 });
}

// ----------------------------------------------------------------
//  Datei-Verschlüsselung
// ----------------------------------------------------------------

/**
 * Verschlüsselt eine Datei mit AES-256-GCM und schreibt sie nach destPath.
 * Gibt den Base64-kodierten AuthTag zurück (muss in der DB gespeichert werden).
 *
 * @returns { authTag: string }  – für Integritätsprüfung beim Entschlüsseln
 */
export async function encryptFile(opts: {
  sourcePath: string;
  destPath:   string;
  masterKey:  string;
  documentId: string;
}): Promise<{ authTag: string; checksum: string }> {
  const { sourcePath, destPath, masterKey, documentId } = opts;

  const key = deriveKey(masterKey, documentId);
  const iv  = randomBytes(IV_LENGTH);

  // Prüfsumme der Originaldatei berechnen
  const plaintext = await fs.readFile(sourcePath);
  const checksum  = createHash("sha256").update(plaintext).digest("hex");

  // Verschlüsseln
  const cipher     = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag    = cipher.getAuthTag();

  // Auf Disk schreiben: [IV][AuthTag][Ciphertext]
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, Buffer.concat([iv, authTag, ciphertext]));

  return { authTag: authTag.toString("base64"), checksum };
}

/**
 * Entschlüsselt eine Datei und gibt den Klartext-Buffer zurück.
 * Wirft einen Fehler, wenn der AuthTag nicht stimmt (Manipulationserkennung).
 */
export async function decryptFile(opts: {
  sourcePath: string;
  masterKey:  string;
  documentId: string;
}): Promise<Buffer> {
  const { sourcePath, masterKey, documentId } = opts;

  const key      = deriveKey(masterKey, documentId);
  const raw      = await fs.readFile(sourcePath);

  if (raw.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Verschlüsselte Datei ist zu kurz – möglicherweise beschädigt.");
  }

  const iv         = raw.subarray(0, IV_LENGTH);
  const authTag    = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error(
      "Entschlüsselung fehlgeschlagen: Datei manipuliert oder falscher Schlüssel."
    );
  }
}

/**
 * Prüft die Integrität einer verschlüsselten Datei anhand der gespeicherten Prüfsumme.
 */
export async function verifyChecksum(opts: {
  sourcePath: string;
  masterKey:  string;
  documentId: string;
  expectedChecksum: string;
}): Promise<boolean> {
  const plaintext = await decryptFile(opts);
  const actual    = createHash("sha256").update(plaintext).digest("hex");
  return actual === opts.expectedChecksum;
}

// ----------------------------------------------------------------
//  Sicheres Löschen
// ----------------------------------------------------------------

/**
 * Überschreibt eine Datei vor dem Löschen mit Nullbytes (1-Pass).
 * Verhindert Datenwiederherstellung auf HDDs; auf SSDs/NAS-Flash
 * ist Overwrite kein vollständiger Schutz, aber eliminiert einfache
 * Wiederherstellung. Ergänzend sollte FDE (Full-Disk-Encryption)
 * auf NAS-Ebene aktiviert sein.
 */
export async function secureDelete(filePath: string): Promise<void> {
  try {
    // Erst öffnen, dann die Größe vom geöffneten Handle lesen – so wird genau die
    // Datei überschrieben, deren Größe gemessen wurde (kein Austausch dazwischen)
    const fd      = await fs.open(filePath, "r+");
    const stat    = await fd.stat();

    // Datei mit Nullbytes überschreiben
    const chunk   = Buffer.alloc(65536); // 64 KB Chunks
    let remaining = stat.size;
    let offset    = 0;

    try {
      while (remaining > 0) {
        const write = Math.min(chunk.length, remaining);
        await fd.write(chunk, 0, write, offset);
        offset    += write;
        remaining -= write;
      }
      await fd.sync();
    } finally {
      await fd.close();
    }

    await fs.unlink(filePath);
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return; // Bereits gelöscht – kein Fehler
    throw err;
  }
}
