import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const KEYSTORE_DIR = path.join(os.tmpdir(), 'tiny-apk-signer-keystore');
const KEY_PATH = path.join(KEYSTORE_DIR, 'signing-key.pem');
const CERT_PEM_PATH = path.join(KEYSTORE_DIR, 'signing-cert.pem');
const CERT_DER_PATH = path.join(KEYSTORE_DIR, 'signing-cert.der');

const ONE_MB = 1024 * 1024;
const MAX_ENTRY_UNCOMPRESSED = 64 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED = 128 * 1024 * 1024;

const APK_SIG_BLOCK_MAGIC = Buffer.from('APK Sig Block 42', 'ascii');
const APK_SIG_V2_BLOCK_ID = 0x7109871a;
const APK_SIG_V3_BLOCK_ID = 0xf05368c0;
const VERITY_PADDING_BLOCK_ID = 0x42726577;
const SIG_RSA_PKCS1_V1_5_SHA256 = 0x0103;

export interface SigningCertInfo {
  subject: string;
  sha256Fingerprint: string;
  algorithm: string;
}

export interface SignedApkResult {
  signedBuffer: Buffer;
  originalSize: number;
  signedSize: number;
  entryCount: number;
  hadOldSignature: boolean;
  resourcesAligned: boolean;
  packageName: string | null;
  targetSdk: number | null;
  minSdk: number | null;
  schemesApplied: string[];
  certInfo: SigningCertInfo;
}

interface ZipEntry {
  fileName: string;
  fileNameBuf: Buffer;
  versionMadeBy: number;
  versionNeeded: number;
  flags: number;
  compressionMethod: number;
  modTime: number;
  modDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  internalAttrs: number;
  externalAttrs: number;
  cdExtra: Buffer;
  comment: Buffer;
  compressedData: Buffer;
  uncompressedData: Buffer;
}

let cachedMaterial: {
  keyPem: string;
  certPem: string;
  certDer: Buffer;
  spkiDer: Buffer;
  certInfo: SigningCertInfo;
} | null = null;

function ensureKeyMaterial() {
  if (cachedMaterial) {
    return cachedMaterial;
  }

  fs.mkdirSync(KEYSTORE_DIR, { recursive: true, mode: 0o700 });

  const envKey = process.env.APK_SIGN_KEY_PEM;
  const envCert = process.env.APK_SIGN_CERT_PEM;

  if (envKey && envCert) {
    fs.writeFileSync(KEY_PATH, envKey, { mode: 0o600 });
    fs.writeFileSync(CERT_PEM_PATH, envCert, { mode: 0o600 });
    execFileSync('openssl', ['x509', '-in', CERT_PEM_PATH, '-outform', 'DER', '-out', CERT_DER_PATH]);
  } else if (!fs.existsSync(KEY_PATH) || !fs.existsSync(CERT_PEM_PATH) || !fs.existsSync(CERT_DER_PATH)) {
    execFileSync('openssl', ['genrsa', '-out', KEY_PATH, '2048']);
    fs.chmodSync(KEY_PATH, 0o600);
    execFileSync('openssl', [
      'req',
      '-new',
      '-x509',
      '-key',
      KEY_PATH,
      '-out',
      CERT_PEM_PATH,
      '-days',
      '3650',
      '-subj',
      '/CN=TinyAPK Signer/O=Android Utility/C=ET',
    ]);
    execFileSync('openssl', ['x509', '-in', CERT_PEM_PATH, '-outform', 'DER', '-out', CERT_DER_PATH]);
  }

  const keyPem = fs.readFileSync(KEY_PATH, 'utf8');
  const certPem = fs.readFileSync(CERT_PEM_PATH, 'utf8');
  const certDer = fs.readFileSync(CERT_DER_PATH);
  const spkiDer = crypto.createPublicKey(certPem).export({ type: 'spki', format: 'der' }) as Buffer;
  const rawHash = crypto.createHash('sha256').update(certDer).digest('hex').toUpperCase();
  const sha256Fingerprint = rawHash.match(/.{2}/g)?.join(':') ?? rawHash;

  cachedMaterial = {
    keyPem,
    certPem,
    certDer,
    spkiDer,
    certInfo: {
      subject: 'CN=TinyAPK Signer, O=Android Utility, C=ET',
      sha256Fingerprint,
      algorithm: 'RSA-2048 · SHA-256',
    },
  };

  return cachedMaterial;
}

export function getSigningCertInfo(): SigningCertInfo {
  return ensureKeyMaterial().certInfo;
}

function uint32LE(value: number): Buffer {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32LE(value >>> 0, 0);
  return b;
}

function uint64LE(value: number | bigint): Buffer {
  const b = Buffer.allocUnsafe(8);
  b.writeBigUInt64LE(BigInt(value), 0);
  return b;
}

function lenPrefixed32(data: Buffer): Buffer {
  return Buffer.concat([uint32LE(data.length), data]);
}

function findEocdOffset(buf: Buffer): number {
  const minOffset = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (
      buf[i] === 0x50 &&
      buf[i + 1] === 0x4b &&
      buf[i + 2] === 0x05 &&
      buf[i + 3] === 0x06
    ) {
      const commentLen = buf.readUInt16LE(i + 20);
      if (i + 22 + commentLen === buf.length) {
        return i;
      }
    }
  }
  throw new Error('Invalid APK file: ZIP End of Central Directory not found.');
}

function parseZipEntries(buf: Buffer): { entries: ZipEntry[]; hadOldV2OrV3: boolean } {
  if (buf.length < 22) {
    throw new Error('File is too small to be a valid APK.');
  }

  const eocdOffset = findEocdOffset(buf);
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  if (cdOffset === 0xffffffff || totalEntries === 0xffff || cdOffset + cdSize > eocdOffset) {
    throw new Error('Unsupported ZIP64 or corrupted Central Directory.');
  }

  let hadOldV2OrV3 = false;
  if (cdOffset >= 24) {
    const tailMagic = buf.subarray(cdOffset - 16, cdOffset);
    if (tailMagic.equals(APK_SIG_BLOCK_MAGIC)) {
      hadOldV2OrV3 = true;
    }
  }

  const entries: ZipEntry[] = [];
  let cursor = cdOffset;
  let totalUncompressed = 0;

  for (let i = 0; i < totalEntries; i++) {
    if (cursor + 46 > cdOffset + cdSize) {
      throw new Error('Corrupted Central Directory entry.');
    }
    const sig = buf.readUInt32LE(cursor);
    if (sig !== 0x02014b50) {
      throw new Error('Invalid Central Directory signature.');
    }

    const versionMadeBy = buf.readUInt16LE(cursor + 4);
    const versionNeeded = buf.readUInt16LE(cursor + 6);
    const flags = buf.readUInt16LE(cursor + 8);
    const compressionMethod = buf.readUInt16LE(cursor + 10);
    const modTime = buf.readUInt16LE(cursor + 12);
    const modDate = buf.readUInt16LE(cursor + 14);
    const crc32 = buf.readUInt32LE(cursor + 16);
    const compressedSize = buf.readUInt32LE(cursor + 20);
    const uncompressedSize = buf.readUInt32LE(cursor + 24);
    const fileNameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const internalAttrs = buf.readUInt16LE(cursor + 36);
    const externalAttrs = buf.readUInt32LE(cursor + 38);
    const localHeaderOffset = buf.readUInt32LE(cursor + 42);

    const nameStart = cursor + 46;
    const extraStart = nameStart + fileNameLen;
    const commentStart = extraStart + extraLen;
    const nextCursor = commentStart + commentLen;
    if (nextCursor > cdOffset + cdSize) {
      throw new Error('Corrupted Central Directory bounds.');
    }

    const fileNameBuf = Buffer.from(buf.subarray(nameStart, extraStart));
    const fileName = fileNameBuf.toString('utf8');
    const cdExtra = Buffer.from(buf.subarray(extraStart, commentStart));
    const comment = Buffer.from(buf.subarray(commentStart, nextCursor));

    if (localHeaderOffset + 30 > cdOffset) {
      throw new Error(`Invalid local header offset for ${fileName}`);
    }
    const localSig = buf.readUInt32LE(localHeaderOffset);
    if (localSig !== 0x04034b50) {
      throw new Error(`Invalid local file header signature for ${fileName}`);
    }
    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > cdOffset) {
      throw new Error(`Entry payload out of bounds for ${fileName}`);
    }

    if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED) {
      throw new Error(`Entry ${fileName} exceeds maximum allowed size.`);
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) {
      throw new Error('APK total uncompressed size exceeds 128 MB limit.');
    }

    const compressedData = Buffer.from(buf.subarray(dataStart, dataEnd));
    let uncompressedData: Buffer;
    if (compressionMethod === 0) {
      uncompressedData = compressedData;
    } else if (compressionMethod === 8) {
      uncompressedData = zlib.inflateRawSync(compressedData, {
        maxOutputLength: MAX_ENTRY_UNCOMPRESSED,
      });
    } else {
      throw new Error(`Unsupported compression method (${compressionMethod}) for ${fileName}`);
    }

    entries.push({
      fileName,
      fileNameBuf,
      versionMadeBy,
      versionNeeded,
      flags: flags & ~0x0008, // Clear data descriptor bit since sizes/CRC are in headers
      compressionMethod,
      modTime,
      modDate,
      crc32: zlib.crc32(uncompressedData) >>> 0,
      compressedSize: compressedData.length,
      uncompressedSize: uncompressedData.length,
      internalAttrs,
      externalAttrs,
      cdExtra,
      comment,
      compressedData,
      uncompressedData,
    });

    cursor = nextCursor;
  }

  return { entries, hadOldV2OrV3 };
}

function isOldSignatureEntry(name: string): boolean {
  if (!name.startsWith('META-INF/')) return false;
  const upper = name.toUpperCase();
  if (upper === 'META-INF/MANIFEST.MF') return true;
  if (upper.endsWith('.SF') || upper.endsWith('.RSA') || upper.endsWith('.DSA') || upper.endsWith('.EC')) {
    return true;
  }
  if (upper.startsWith('META-INF/SIG-')) return true;
  return false;
}

function formatManifestLine(line: string): Buffer {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 70) {
    return Buffer.concat([bytes, Buffer.from('\r\n', 'ascii')]);
  }
  const chunks: Buffer[] = [];
  let offset = 0;
  let first = true;
  while (offset < bytes.length) {
    const limit = first ? 70 : 69;
    let end = Math.min(offset + limit, bytes.length);
    // Avoid splitting inside a multi-byte UTF-8 sequence
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80 && end > offset) {
      end--;
    }
    if (end === offset) {
      end = Math.min(offset + limit, bytes.length);
    }
    if (!first) {
      chunks.push(Buffer.from(' ', 'ascii'));
    }
    chunks.push(bytes.subarray(offset, end));
    chunks.push(Buffer.from('\r\n', 'ascii'));
    offset = end;
    first = false;
  }
  return Buffer.concat(chunks);
}

function buildV1SignatureFiles(entries: ZipEntry[], keyPath: string, certPath: string) {
  const manifestHeader = Buffer.from(
    'Manifest-Version: 1.0\r\nCreated-By: TinyAPK Signer\r\n\r\n',
    'ascii'
  );

  const manifestChunks: Buffer[] = [manifestHeader];
  const sfEntries: Buffer[] = [];

  for (const entry of entries) {
    if (entry.fileName.endsWith('/')) continue;
    const digestB64 = crypto.createHash('sha256').update(entry.uncompressedData).digest('base64');
    const section = Buffer.concat([
      formatManifestLine(`Name: ${entry.fileName}`),
      formatManifestLine(`SHA-256-Digest: ${digestB64}`),
      Buffer.from('\r\n', 'ascii'),
    ]);
    manifestChunks.push(section);

    const sectionDigestB64 = crypto.createHash('sha256').update(section).digest('base64');
    sfEntries.push(
      Buffer.concat([
        formatManifestLine(`Name: ${entry.fileName}`),
        formatManifestLine(`SHA-256-Digest: ${sectionDigestB64}`),
        Buffer.from('\r\n', 'ascii'),
      ])
    );
  }

  const manifestMf = Buffer.concat(manifestChunks);
  const manifestDigestB64 = crypto.createHash('sha256').update(manifestMf).digest('base64');
  const sfHeader = Buffer.from(
    `Signature-Version: 1.0\r\n` +
      `Created-By: TinyAPK Signer\r\n` +
      `SHA-256-Digest-Manifest: ${manifestDigestB64}\r\n` +
      `X-Android-APK-Signed: 2, 3\r\n\r\n`,
    'ascii'
  );
  const certSf = Buffer.concat([sfHeader, ...sfEntries]);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apk-cms-'));
  try {
    const sfFile = path.join(tempDir, 'CERT.SF');
    const rsaFile = path.join(tempDir, 'CERT.RSA');
    fs.writeFileSync(sfFile, certSf);
    execFileSync('openssl', [
      'cms',
      '-sign',
      '-in',
      sfFile,
      '-signer',
      certPath,
      '-inkey',
      keyPath,
      '-outform',
      'DER',
      '-out',
      rsaFile,
      '-noattr',
      '-md',
      'sha256',
      '-binary',
    ]);
    const certRsa = fs.readFileSync(rsaFile);
    return { manifestMf, certSf, certRsa };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function makeStoredEntry(fileName: string, data: Buffer): ZipEntry {
  const fileNameBuf = Buffer.from(fileName, 'utf8');
  const compressedData = zlib.deflateRawSync(data, { level: 9 });
  const useDeflate = compressedData.length < data.length;
  const payload = useDeflate ? compressedData : data;
  return {
    fileName,
    fileNameBuf,
    versionMadeBy: 20,
    versionNeeded: 20,
    flags: 0x0800, // UTF-8 filename
    compressionMethod: useDeflate ? 8 : 0,
    modTime: 0,
    modDate: 0x5421,
    crc32: zlib.crc32(data) >>> 0,
    compressedSize: payload.length,
    uncompressedSize: data.length,
    internalAttrs: 0,
    externalAttrs: 0,
    cdExtra: Buffer.alloc(0),
    comment: Buffer.alloc(0),
    compressedData: payload,
    uncompressedData: data,
  };
}

function buildAlignedZip(entries: ZipEntry[]) {
  const localParts: Buffer[] = [];
  const cdParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    // Enforce uncompressed + aligned storage for resources.arsc, native .so libs,
    // AndroidManifest.xml, and small classes*.dex so PackageInstaller/ART can mmap directly.
    const isDex = /^classes\d*\.dex$/.test(entry.fileName) && entry.uncompressedSize <= 2 * 1024 * 1024;
    const isManifest = entry.fileName === 'AndroidManifest.xml' && entry.uncompressedSize <= 512 * 1024;
    let method = entry.compressionMethod;
    let payload = entry.compressedData;
    if (
      (entry.fileName === 'resources.arsc' ||
        entry.fileName.endsWith('.so') ||
        isDex ||
        isManifest) &&
      method !== 0
    ) {
      method = 0;
      payload = entry.uncompressedData;
    }

    let localExtra = Buffer.alloc(0);
    if (method === 0 && !entry.fileName.endsWith('/')) {
      const align = entry.fileName.endsWith('.so') ? 4096 : 4;
      const rawDataStart = offset + 30 + entry.fileNameBuf.length;
      const mod = rawDataStart % align;
      if (mod !== 0) {
        const pad = align - mod;
        localExtra = Buffer.alloc(pad, 0);
      }
    }

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(Math.max(entry.versionNeeded, 20), 4);
    lfh.writeUInt16LE(entry.flags | 0x0800, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(entry.modTime, 10);
    lfh.writeUInt16LE(entry.modDate, 12);
    lfh.writeUInt32LE(entry.crc32 >>> 0, 14);
    lfh.writeUInt32LE(payload.length >>> 0, 18);
    lfh.writeUInt32LE(entry.uncompressedSize >>> 0, 22);
    lfh.writeUInt16LE(entry.fileNameBuf.length, 26);
    lfh.writeUInt16LE(localExtra.length, 28);

    localParts.push(lfh, entry.fileNameBuf, localExtra, payload);

    const cdfh = Buffer.alloc(46);
    cdfh.writeUInt32LE(0x02014b50, 0);
    cdfh.writeUInt16LE(entry.versionMadeBy || 20, 4);
    cdfh.writeUInt16LE(Math.max(entry.versionNeeded, 20), 6);
    cdfh.writeUInt16LE(entry.flags | 0x0800, 8);
    cdfh.writeUInt16LE(method, 10);
    cdfh.writeUInt16LE(entry.modTime, 12);
    cdfh.writeUInt16LE(entry.modDate, 14);
    cdfh.writeUInt32LE(entry.crc32 >>> 0, 16);
    cdfh.writeUInt32LE(payload.length >>> 0, 20);
    cdfh.writeUInt32LE(entry.uncompressedSize >>> 0, 24);
    cdfh.writeUInt16LE(entry.fileNameBuf.length, 28);
    cdfh.writeUInt16LE(0, 30);
    cdfh.writeUInt16LE(entry.comment.length, 32);
    cdfh.writeUInt16LE(0, 34);
    cdfh.writeUInt16LE(entry.internalAttrs, 36);
    cdfh.writeUInt32LE(entry.externalAttrs >>> 0, 38);
    cdfh.writeUInt32LE(offset >>> 0, 42);

    cdParts.push(cdfh, entry.fileNameBuf, entry.comment);

    offset += 30 + entry.fileNameBuf.length + localExtra.length + payload.length;
  }

  const entriesSection = Buffer.concat(localParts);
  const cdSection = Buffer.concat(cdParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSection.length >>> 0, 12);
  eocd.writeUInt32LE(entriesSection.length >>> 0, 16);
  eocd.writeUInt16LE(0, 20);

  return { entriesSection, cdSection, eocd };
}

function computeApkV2Digest(entriesSection: Buffer, cdSection: Buffer, eocd: Buffer): Buffer {
  const chunkDigests: Buffer[] = [];

  for (const section of [entriesSection, cdSection, eocd]) {
    if (section.length === 0) {
      const header = Buffer.allocUnsafe(5);
      header[0] = 0xa5;
      header.writeUInt32LE(0, 1);
      chunkDigests.push(crypto.createHash('sha256').update(header).digest());
      continue;
    }
    for (let pos = 0; pos < section.length; pos += ONE_MB) {
      const end = Math.min(pos + ONE_MB, section.length);
      const slice = section.subarray(pos, end);
      const header = Buffer.allocUnsafe(5);
      header[0] = 0xa5;
      header.writeUInt32LE(slice.length, 1);
      const hash = crypto.createHash('sha256');
      hash.update(header);
      hash.update(slice);
      chunkDigests.push(hash.digest());
    }
  }

  const topHeader = Buffer.allocUnsafe(5);
  topHeader[0] = 0x5a;
  topHeader.writeUInt32LE(chunkDigests.length, 1);
  const topHash = crypto.createHash('sha256');
  topHash.update(topHeader);
  for (const d of chunkDigests) {
    topHash.update(d);
  }
  return topHash.digest();
}

function buildV2AndV3SigningBlock(
  entriesSection: Buffer,
  cdSection: Buffer,
  eocd: Buffer,
  keyPem: string,
  certDer: Buffer,
  spkiDer: Buffer
): Buffer {
  const contentDigest = computeApkV2Digest(entriesSection, cdSection, eocd);

  const digestItem = lenPrefixed32(
    Buffer.concat([uint32LE(SIG_RSA_PKCS1_V1_5_SHA256), lenPrefixed32(contentDigest)])
  );
  const digests = lenPrefixed32(digestItem);
  const certificates = lenPrefixed32(lenPrefixed32(certDer));
  const emptyAttrs = lenPrefixed32(Buffer.alloc(0));

  // Scheme v2
  const signedDataV2 = Buffer.concat([digests, certificates, emptyAttrs]);
  const sigV2 = crypto.sign('RSA-SHA256', signedDataV2, keyPem);
  const signaturesV2 = lenPrefixed32(
    lenPrefixed32(Buffer.concat([uint32LE(SIG_RSA_PKCS1_V1_5_SHA256), lenPrefixed32(sigV2)]))
  );
  const signerV2 = Buffer.concat([
    lenPrefixed32(signedDataV2),
    signaturesV2,
    lenPrefixed32(spkiDer),
  ]);
  const v2Value = lenPrefixed32(lenPrefixed32(signerV2));

  // Scheme v3 (minSdk 28, maxSdk INT_MAX)
  const minSdkV3 = 28;
  const maxSdkV3 = 0x7fffffff;
  const signedDataV3 = Buffer.concat([
    digests,
    certificates,
    uint32LE(minSdkV3),
    uint32LE(maxSdkV3),
    emptyAttrs,
  ]);
  const sigV3 = crypto.sign('RSA-SHA256', signedDataV3, keyPem);
  const signaturesV3 = lenPrefixed32(
    lenPrefixed32(Buffer.concat([uint32LE(SIG_RSA_PKCS1_V1_5_SHA256), lenPrefixed32(sigV3)]))
  );
  const signerV3 = Buffer.concat([
    lenPrefixed32(signedDataV3),
    uint32LE(minSdkV3),
    uint32LE(maxSdkV3),
    signaturesV3,
    lenPrefixed32(spkiDer),
  ]);
  const v3Value = lenPrefixed32(lenPrefixed32(signerV3));

  const pairs: Buffer[] = [
    uint64LE(4 + v2Value.length),
    uint32LE(APK_SIG_V2_BLOCK_ID),
    v2Value,
    uint64LE(4 + v3Value.length),
    uint32LE(APK_SIG_V3_BLOCK_ID),
    v3Value,
  ];

  const basePairsBuf = Buffer.concat(pairs);
  const baseBlockSize = 8 + basePairsBuf.length + 8 + 16;
  const remainder = (entriesSection.length + baseBlockSize) % 4096;
  if (remainder !== 0) {
    let padNeeded = 4096 - remainder;
    if (padNeeded < 12) {
      padNeeded += 4096;
    }
    const zeroPadLen = padNeeded - 12;
    pairs.push(
      uint64LE(4 + zeroPadLen),
      uint32LE(VERITY_PADDING_BLOCK_ID),
      Buffer.alloc(zeroPadLen, 0)
    );
  }

  const allPairsBuf = Buffer.concat(pairs);
  const sizeExcludingFirst8 = allPairsBuf.length + 8 + 16;

  return Buffer.concat([
    uint64LE(sizeExcludingFirst8),
    allPairsBuf,
    uint64LE(sizeExcludingFirst8),
    APK_SIG_BLOCK_MAGIC,
  ]);
}

function inspectBinaryManifest(axml: Buffer): {
  packageName: string | null;
  targetSdk: number | null;
  minSdk: number | null;
} {
  try {
    if (axml.length < 16 || axml.readUInt16LE(0) !== 0x0003) {
      return { packageName: null, targetSdk: null, minSdk: null };
    }

    let offset = 8;
    let strings: string[] = [];
    let packageName: string | null = null;
    let targetSdk: number | null = null;
    let minSdk: number | null = null;

    while (offset + 8 <= axml.length) {
      const chunkType = axml.readUInt16LE(offset);
      const headerSize = axml.readUInt16LE(offset + 2);
      const chunkSize = axml.readUInt32LE(offset + 4);
      if (chunkSize < 8 || offset + chunkSize > axml.length) break;

      if (chunkType === 0x0001 && offset + 28 <= axml.length) {
        // String pool
        const stringCount = axml.readUInt32LE(offset + 8);
        const flags = axml.readUInt32LE(offset + 16);
        const stringsStart = axml.readUInt32LE(offset + 20);
        const isUtf8 = (flags & (1 << 8)) !== 0;

        for (let i = 0; i < stringCount; i++) {
          const strOffsetPos = offset + headerSize + i * 4;
          if (strOffsetPos + 4 > offset + chunkSize) break;
          const strRel = axml.readUInt32LE(strOffsetPos);
          let p = offset + stringsStart + strRel;
          if (p >= offset + chunkSize) {
            strings.push('');
            continue;
          }
          if (isUtf8) {
            // Skip char length (1-2 bytes)
            const c1 = axml[p++];
            if ((c1 & 0x80) !== 0) p++;
            let byteLen = axml[p++];
            if ((byteLen & 0x80) !== 0) {
              byteLen = ((byteLen & 0x7f) << 8) | axml[p++];
            }
            const end = Math.min(p + byteLen, offset + chunkSize);
            strings.push(axml.subarray(p, end).toString('utf8'));
          } else {
            let charLen = axml.readUInt16LE(p);
            p += 2;
            if ((charLen & 0x8000) !== 0) {
              charLen = ((charLen & 0x7fff) << 16) | axml.readUInt16LE(p);
              p += 2;
            }
            const end = Math.min(p + charLen * 2, offset + chunkSize);
            strings.push(axml.subarray(p, end).toString('utf16le'));
          }
        }
      } else if (chunkType === 0x0102 && offset + 36 <= axml.length) {
        // START_ELEMENT
        const nameIdx = axml.readInt32LE(offset + 20);
        const attrSize = axml.readUInt16LE(offset + 26);
        const attrCount = axml.readUInt16LE(offset + 28);
        const tagName = strings[nameIdx] ?? '';
        const attrBase = offset + 36;

        for (let a = 0; a < attrCount; a++) {
          const pos = attrBase + a * attrSize;
          if (pos + 20 > offset + chunkSize) break;
          const attrNameIdx = axml.readInt32LE(pos + 4);
          const rawValIdx = axml.readInt32LE(pos + 8);
          const valType = axml[pos + 15];
          const valData = axml.readInt32LE(pos + 16);
          const attrName = strings[attrNameIdx] ?? '';

          if (tagName === 'manifest' && attrName === 'package' && rawValIdx >= 0) {
            packageName = strings[rawValIdx] ?? null;
          } else if (tagName === 'uses-sdk' && (valType === 0x10 || valType === 0x11)) {
            if (attrName === 'targetSdkVersion') targetSdk = valData;
            if (attrName === 'minSdkVersion') minSdk = valData;
          }
        }
      }

      offset += chunkSize;
    }

    return { packageName, targetSdk, minSdk };
  } catch {
    return { packageName: null, targetSdk: null, minSdk: null };
  }
}

export function signApkBuffer(apkBuffer: Buffer): SignedApkResult {
  const { keyPem, certDer, spkiDer, certInfo } = ensureKeyMaterial();
  const { entries: rawEntries, hadOldV2OrV3 } = parseZipEntries(apkBuffer);

  let hadOldV1 = false;
  const cleanEntries: ZipEntry[] = [];
  let manifestMeta: { packageName: string | null; targetSdk: number | null; minSdk: number | null } = {
    packageName: null,
    targetSdk: null,
    minSdk: null,
  };

  for (const entry of rawEntries) {
    if (isOldSignatureEntry(entry.fileName)) {
      hadOldV1 = true;
      continue;
    }
    if (entry.fileName === 'AndroidManifest.xml') {
      manifestMeta = inspectBinaryManifest(entry.uncompressedData);
    }
    cleanEntries.push(entry);
  }

  if (cleanEntries.length === 0) {
    throw new Error('APK contains no application entries.');
  }

  const { manifestMf, certSf, certRsa } = buildV1SignatureFiles(cleanEntries, KEY_PATH, CERT_PEM_PATH);
  const allEntries = [
    ...cleanEntries,
    makeStoredEntry('META-INF/MANIFEST.MF', manifestMf),
    makeStoredEntry('META-INF/CERT.SF', certSf),
    makeStoredEntry('META-INF/CERT.RSA', certRsa),
  ];

  const { entriesSection, cdSection, eocd } = buildAlignedZip(allEntries);
  const signingBlock = buildV2AndV3SigningBlock(
    entriesSection,
    cdSection,
    eocd,
    keyPem,
    certDer,
    spkiDer
  );

  const updatedEocd = Buffer.from(eocd);
  const newCdOffset = entriesSection.length + signingBlock.length;
  updatedEocd.writeUInt32LE(newCdOffset >>> 0, 16);

  const signedBuffer = Buffer.concat([entriesSection, signingBlock, cdSection, updatedEocd]);

  return {
    signedBuffer,
    originalSize: apkBuffer.length,
    signedSize: signedBuffer.length,
    entryCount: allEntries.length,
    hadOldSignature: hadOldV1 || hadOldV2OrV3,
    resourcesAligned: true,
    packageName: manifestMeta.packageName,
    targetSdk: manifestMeta.targetSdk,
    minSdk: manifestMeta.minSdk,
    schemesApplied: ['v1 (JAR)', 'v2 (APK Sig)', 'v3 (APK Sig)'],
    certInfo,
  };
}
