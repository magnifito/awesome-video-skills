import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DeliverableArchiver } from './archiver.js';

export interface MerkleLeaf {
  path: string;
  /** SHA-256 of the file content (hex). */
  hash: string;
  bytes: number;
}

export interface MerkleTreeResult {
  rootHash: string;
  leafCount: number;
  leaves: MerkleLeaf[];
  treeLevels: number;
  timestamp: string;
}

const LEAF_PREFIX = Buffer.from([0x00]);
const NODE_PREFIX = Buffer.from([0x01]);

/** Streams a file through SHA-256 so large deliverables do not need to fit in memory. */
function sha256File(filePath: string): { hash: string; bytes: number } {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  let bytes = 0;
  try {
    const buf = Buffer.allocUnsafe(1024 * 1024);
    let n: number;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      h.update(buf.subarray(0, n));
      bytes += n;
    }
  } finally {
    fs.closeSync(fd);
  }
  return { hash: h.digest('hex'), bytes };
}

export class MerkleManifest {
  static hashBuffer(buf: Buffer): string {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  /**
   * Leaf node hash: H(0x00 || len(path) || path || contentHash).
   * Binding the path means renaming a file changes the root.
   */
  static hashLeaf(relPath: string, contentHashHex: string): string {
    const p = Buffer.from(relPath, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(p.length);
    return crypto
      .createHash('sha256')
      .update(LEAF_PREFIX)
      .update(len)
      .update(p)
      .update(Buffer.from(contentHashHex, 'hex'))
      .digest('hex');
  }

  /**
   * Interior node hash: H(0x01 || left || right) over raw 32-byte digests.
   * The distinct prefix stops an interior node from being passed off as a leaf (second-preimage).
   */
  static hashPair(a: string, b: string): string {
    return crypto
      .createHash('sha256')
      .update(NODE_PREFIX)
      .update(Buffer.from(a, 'hex'))
      .update(Buffer.from(b, 'hex'))
      .digest('hex');
  }

  /**
   * Computes the Merkle root hash of all deliverable files in a directory (non-recursive).
   * An odd node at any level is promoted unchanged instead of being paired with itself, which
   * avoids the CVE-2012-2459 duplicate-leaf ambiguity.
   */
  static computeTree(directoryPath: string): MerkleTreeResult {
    if (!fs.existsSync(directoryPath)) {
      throw new Error(`Directory not found: ${directoryPath}`);
    }

    const files = fs.readdirSync(directoryPath)
      .filter(f => fs.statSync(path.join(directoryPath, f)).isFile())
      .sort();

    if (files.length === 0) {
      throw new Error(`Directory is empty: ${directoryPath}`);
    }

    const leaves: MerkleLeaf[] = files.map(file => {
      const { hash, bytes } = sha256File(path.join(directoryPath, file));
      return { path: file, hash, bytes };
    });

    let currentLevel = leaves.map(l => this.hashLeaf(l.path, l.hash));
    let levelCount = 1;

    while (currentLevel.length > 1) {
      levelCount++;
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          nextLevel.push(this.hashPair(currentLevel[i], currentLevel[i + 1]));
        } else {
          nextLevel.push(currentLevel[i]);
        }
      }
      currentLevel = nextLevel;
    }

    return {
      rootHash: currentLevel[0],
      leafCount: leaves.length,
      leaves,
      treeLevels: levelCount,
      timestamp: new Date().toISOString()
    };
  }
}
