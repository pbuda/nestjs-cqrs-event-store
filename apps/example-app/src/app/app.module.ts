import { Module } from '@nestjs/common';
import { EventStoreModule } from '@pbuda/nestjs-event-store';
import { InMemoryEventStoreAdapter } from '@pbuda/nestjs-event-store-in-memory';
import { AppController } from './app.controller';
import { AppService } from './app.service';
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
