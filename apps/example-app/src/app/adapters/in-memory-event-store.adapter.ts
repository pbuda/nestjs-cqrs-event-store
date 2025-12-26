import { Injectable } from '@nestjs/common';
import {
  IEventStoreAdapter,
  EventEnvelope,
  RecordedEventEnvelope,
  AppendResult,
  ReadStreamOptions,
} from '@pbuda/event-store-core';

@Injectable()
export class InMemoryEventStoreAdapter implements IEventStoreAdapter {
  private readonly streams = new Map<string, RecordedEventEnvelope[]>();

  async appendToStream(
    streamId: string,
    events: EventEnvelope[],
    expectedRevision?: bigint
  ): Promise<AppendResult> {
    const stream = this.streams.get(streamId) ?? [];
    const currentRevision = BigInt(stream.length) - 1n;

    // Optimistic concurrency check
    if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
      throw new Error(
        `Concurrency conflict on stream "${streamId}": ` +
          `expected revision ${expectedRevision}, but stream is at ${currentRevision}`
      );
    }

    const recordedEvents: RecordedEventEnvelope[] = events.map(
      (event, index) => ({
        streamId,
        id: event.id,
        revision: BigInt(stream.length + index),
        type: event.type,
        created: new Date(),
        data: event.data,
        metadata: event.metadata,
      })
    );

    stream.push(...recordedEvents);
    this.streams.set(streamId, stream);

    return {
      nextExpectedRevision: BigInt(stream.length),
    };
  }

  async *readStream(
    streamId: string,
    options?: ReadStreamOptions
  ): AsyncIterable<RecordedEventEnvelope> {
    const stream = this.streams.get(streamId) ?? [];

    if (stream.length === 0) {
      return;
    }

    const direction = options?.direction ?? 'forwards';
    const fromRevision = options?.fromRevision ?? 'start';
    const maxCount = options?.maxCount ?? stream.length;

    let startIndex: number;
    if (fromRevision === 'start') {
      startIndex = 0;
    } else if (fromRevision === 'end') {
      startIndex = stream.length - 1;
    } else {
      startIndex = Number(fromRevision);
    }

    if (direction === 'forwards') {
      const endIndex = Math.min(startIndex + maxCount, stream.length);
      for (let i = startIndex; i < endIndex; i++) {
        yield stream[i];
      }
    } else {
      const endIndex = Math.max(startIndex - maxCount + 1, 0);
      for (let i = startIndex; i >= endIndex; i--) {
        yield stream[i];
      }
    }
  }

  // Helper methods for testing/debugging
  getStream(streamId: string): RecordedEventEnvelope[] {
    return this.streams.get(streamId) ?? [];
  }

  getAllStreams(): Map<string, RecordedEventEnvelope[]> {
    return new Map(this.streams);
  }

  clear(): void {
    this.streams.clear();
  }
}
