import { Module } from '@nestjs/common';
import { EventStoreModule } from '@pbuda/event-store-core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InMemoryEventStoreAdapter } from './adapters/in-memory-event-store.adapter';
import { TodoModule } from './todo/todo.module';

@Module({
  imports: [
    EventStoreModule.forRoot({
      adapter: InMemoryEventStoreAdapter,
    }),
    TodoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
