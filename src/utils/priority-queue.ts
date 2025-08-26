/**
 * Priority Queue with Deduplication System
 * 
 * Implements a priority queue for batch search requests with SHA256-based
 * deduplication to prevent duplicate searches.
 */

import crypto from 'crypto';

/**
 * Priority levels for queue items
 */
export enum Priority {
  HIGH = 0,
  MEDIUM = 1,
  LOW = 2
}

/**
 * Queue item interface
 */
export interface QueueItem<T> {
  id: string;
  priority: Priority;
  data: T;
  hash: string;
  timestamp: number;
  retryCount?: number;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  size: number;
  high: number;
  medium: number;
  low: number;
  duplicatesPreventedCount: number;
  averageWaitTime: number;
}

/**
 * Priority Queue configuration
 */
export interface PriorityQueueConfig {
  maxSize?: number;
  deduplicationWindowMs?: number;
}

/**
 * Priority Queue implementation with deduplication
 */
export class PriorityQueue<T> {
  private queues: Map<Priority, QueueItem<T>[]>;
  private deduplicationMap: Map<string, QueueItem<T>>;
  private config: Required<PriorityQueueConfig>;
  private stats = {
    duplicatesPrevented: 0,
    totalProcessed: 0,
    totalWaitTime: 0,
  };

  constructor(config: PriorityQueueConfig = {}) {
    this.config = {
      maxSize: config.maxSize ?? 100,
      deduplicationWindowMs: config.deduplicationWindowMs ?? 60000, // 1 minute
    };
    
    this.queues = new Map([
      [Priority.HIGH, []],
      [Priority.MEDIUM, []],
      [Priority.LOW, []],
    ]);
    
    this.deduplicationMap = new Map();
    this.startCleanupTimer();
  }

  /**
   * Add item to queue with deduplication
   */
  enqueue(data: T, priority: Priority = Priority.MEDIUM): string | null {
    const hash = this.generateHash(data);
    
    // Check for duplicates
    if (this.deduplicationMap.has(hash)) {
      this.stats.duplicatesPrevented++;
      const existing = this.deduplicationMap.get(hash)!;
      
      // Update priority if new request has higher priority
      if (priority < existing.priority) {
        this.updatePriority(existing.id, priority);
      }
      
      return existing.id; // Return existing ID
    }

    // Check queue size limit
    if (this.size() >= this.config.maxSize) {
      return null; // Queue full
    }

    const item: QueueItem<T> = {
      id: crypto.randomBytes(16).toString('hex'),
      priority,
      data,
      hash,
      timestamp: Date.now(),
      retryCount: 0,
    };

    const queue = this.queues.get(priority)!;
    queue.push(item);
    this.deduplicationMap.set(hash, item);
    
    return item.id;
  }

  /**
   * Remove and return highest priority item
   */
  dequeue(): QueueItem<T> | null {
    for (const priority of [Priority.HIGH, Priority.MEDIUM, Priority.LOW]) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        const item = queue.shift()!;
        
        // Update stats
        const waitTime = Date.now() - item.timestamp;
        this.stats.totalProcessed++;
        this.stats.totalWaitTime += waitTime;
        
        // Remove from deduplication map after processing
        setTimeout(() => {
          if (this.deduplicationMap.get(item.hash) === item) {
            this.deduplicationMap.delete(item.hash);
          }
        }, this.config.deduplicationWindowMs);
        
        return item;
      }
    }
    return null;
  }

  /**
   * Peek at highest priority item without removing
   */
  peek(): QueueItem<T> | null {
    for (const priority of [Priority.HIGH, Priority.MEDIUM, Priority.LOW]) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        return queue[0] || null;
      }
    }
    return null;
  }

  /**
   * Get total queue size
   */
  size(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.size() === 0;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
    this.deduplicationMap.clear();
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return {
      size: this.size(),
      high: this.queues.get(Priority.HIGH)!.length,
      medium: this.queues.get(Priority.MEDIUM)!.length,
      low: this.queues.get(Priority.LOW)!.length,
      duplicatesPreventedCount: this.stats.duplicatesPrevented,
      averageWaitTime: this.stats.totalProcessed > 0 
        ? this.stats.totalWaitTime / this.stats.totalProcessed 
        : 0,
    };
  }

  /**
   * Update priority of an existing item
   */
  updatePriority(id: string, newPriority: Priority): boolean {
    // Find and remove from current queue
    for (const queue of this.queues.values()) {
      const index = queue.findIndex(item => item.id === id);
      if (index !== -1 && queue[index]) {
        const item = queue[index];
        queue.splice(index, 1);
        item.priority = newPriority;
        
        // Add to new priority queue
        const newQueue = this.queues.get(newPriority)!;
        newQueue.push(item);
        
        return true;
      }
    }
    return false;
  }

  /**
   * Remove item by ID
   */
  remove(id: string): boolean {
    for (const queue of this.queues.values()) {
      const index = queue.findIndex(item => item.id === id);
      if (index !== -1 && queue[index]) {
        const item = queue[index];
        queue.splice(index, 1);
        this.deduplicationMap.delete(item.hash);
        return true;
      }
    }
    return false;
  }

  /**
   * Retry failed item with lower priority
   */
  retry(item: QueueItem<T>): string | null {
    const newPriority = Math.min(item.priority + 1, Priority.LOW) as Priority;
    const retryItem = {
      ...item.data,
    };
    
    // Clear old hash from deduplication
    this.deduplicationMap.delete(item.hash);
    
    // Re-enqueue with lower priority
    const newId = this.enqueue(retryItem, newPriority);
    if (newId && this.deduplicationMap.has(this.generateHash(retryItem))) {
      const newItem = this.deduplicationMap.get(this.generateHash(retryItem))!;
      newItem.retryCount = (item.retryCount || 0) + 1;
    }
    
    return newId;
  }

  /**
   * Generate SHA256 hash of data for deduplication
   */
  private generateHash(data: T): string {
    const normalized = this.normalizeData(data);
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
  }

  /**
   * Normalize data for consistent hashing
   */
  private normalizeData(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.normalizeData(item)).sort();
    }
    
    if (typeof data === 'object') {
      const sorted: any = {};
      const keys = Object.keys(data).sort();
      for (const key of keys) {
        sorted[key] = this.normalizeData(data[key]);
      }
      return sorted;
    }
    
    return data;
  }

  /**
   * Cleanup expired deduplication entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredHashes: string[] = [];
    
    for (const [hash, item] of this.deduplicationMap.entries()) {
      // Check if item is not in any queue (already processed)
      let inQueue = false;
      for (const queue of this.queues.values()) {
        if (queue.some(q => q.hash === hash)) {
          inQueue = true;
          break;
        }
      }
      
      // Remove if not in queue and expired
      if (!inQueue && now - item.timestamp > this.config.deduplicationWindowMs) {
        expiredHashes.push(hash);
      }
    }
    
    for (const hash of expiredHashes) {
      this.deduplicationMap.delete(hash);
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanup();
    }, this.config.deduplicationWindowMs);
  }
}