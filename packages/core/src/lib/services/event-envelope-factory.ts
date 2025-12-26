import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventEnvelope } from '../types/event-envelope';
import { EventMetadata } from '../types/event-metadata';
import { IDomainEvent } from '../types/domain-event.interface';

/**
 * Factory for creating EventEnvelope instances from domain events.
 */
@Injectable()
export class EventEnvelopeFactory {
  /**
   * Create an EventEnvelope from a domain event.
   *
   * @param event - The domain event to wrap
   * @param metadata - Metadata to attach (from EventContext)
   * @returns A fully formed EventEnvelope ready for persistence
   */
  create(event: IDomainEvent, metadata?: EventMetadata): EventEnvelope {
    const effectiveMetadata = metadata ?? this.createDefaultMetadata();

    return {
      id: randomUUID(),
      type: event.eventType,
      data: event,
      metadata: effectiveMetadata,
    };
  }

  /**
   * Create EventEnvelopes from multiple domain events.
   *
   * @param events - The domain events to wrap
   * @param metadata - Metadata to attach to all events
   * @returns Array of EventEnvelopes
   */
  createMany(
    events: IDomainEvent[],
    metadata?: EventMetadata
  ): EventEnvelope[] {
    return events.map((event) => this.create(event, metadata));
  }

  private createDefaultMetadata(): EventMetadata {
    return {
      correlationId: randomUUID(),
    };
  }
}
