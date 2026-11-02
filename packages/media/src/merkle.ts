import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface MerkleLeaf {
  path: string;
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

export class MerkleManifest {
  static hashBuffer(buf: Buffer): string {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  static hashPair(a: string, b: string): string {
    return crypto.createHash('sha256').update(a + b).digest('hex');
  }

  /**
   * Computes the Merkle Root hash of all deliverable files in a directory.
   */
  static computeTree(directoryPath: string): MerkleTreeResult {
    if (!fs.existsSync(directoryPath)) {
      throw new Error(`Directory not found: ${directoryPath}`);
    }

    const files = fs.readdirSync(directoryPath)
      .filter(f => !fs.statSync(path.join(directoryPath, f)).isDirectory())
      .sort();

    if (files.length === 0) {
      throw new Error(`Directory is empty: ${directoryPath}`);
    }

    const leaves: MerkleLeaf[] = files.map(file => {
      const full = path.join(directoryPath, file);
      const data = fs.readFileSync(full);
      return {
        path: file,
        hash: this.hashBuffer(data),
        bytes: data.length
      };
    });

    let currentLevel = leaves.map(l => l.hash);
    let levelCount = 1;

    while (currentLevel.length > 1) {
      levelCount++;
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          nextLevel.push(this.hashPair(currentLevel[i], currentLevel[i + 1]));
        } else {
          // Odd leaf duplication for standard binary Merkle trees
          nextLevel.push(this.hashPair(currentLevel[i], currentLevel[i]));
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

