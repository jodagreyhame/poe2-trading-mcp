/**
 * Compression Utilities
 * Handle data compression for L2 cache storage
 */

import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export class CompressionUtil {
  private compressionThreshold: number;

  constructor(compressionThreshold: number = 1024) { // 1KB default threshold
    this.compressionThreshold = compressionThreshold;
  }

  /**
   * Compress data if it exceeds the threshold
   */
  async compress(data: any): Promise<{ data: Buffer | string; compressed: boolean }> {
    const jsonString = JSON.stringify(data);
    const dataSize = Buffer.byteLength(jsonString, 'utf8');

    if (dataSize < this.compressionThreshold) {
      return {
        data: jsonString,
        compressed: false
      };
    }

    try {
      const compressed = await gzipAsync(jsonString);
      const compressionRatio = compressed.length / dataSize;
      
      // Only use compression if it actually reduces size by at least 10%
      if (compressionRatio < 0.9) {
        return {
          data: compressed,
          compressed: true
        };
      } else {
        return {
          data: jsonString,
          compressed: false
        };
      }
    } catch (error) {
      console.error('Compression error:', error);
      // Fallback to uncompressed data
      return {
        data: jsonString,
        compressed: false
      };
    }
  }

  /**
   * Decompress data if it's compressed
   */
  async decompress<T>(data: Buffer | string, isCompressed: boolean): Promise<T> {
    try {
      if (!isCompressed) {
        return JSON.parse(data as string);
      }

      const decompressed = await gunzipAsync(data as Buffer);
      return JSON.parse(decompressed.toString());
    } catch (error) {
      console.error('Decompression error:', error);
      throw new Error('Failed to decompress cache data');
    }
  }

  /**
   * Estimate compression ratio for data
   */
  async estimateCompressionRatio(data: any): Promise<number> {
    const jsonString = JSON.stringify(data);
    const originalSize = Buffer.byteLength(jsonString, 'utf8');

    if (originalSize < this.compressionThreshold) {
      return 1; // No compression benefit for small data
    }

    try {
      const compressed = await gzipAsync(jsonString);
      return compressed.length / originalSize;
    } catch (error) {
      return 1; // Assume no compression benefit if error
    }
  }

  /**
   * Update compression threshold
   */
  updateThreshold(threshold: number): void {
    this.compressionThreshold = threshold;
  }

  /**
   * Get current compression threshold
   */
  getThreshold(): number {
    return this.compressionThreshold;
  }
}