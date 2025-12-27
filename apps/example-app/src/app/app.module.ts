import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  EventStoreModule,
  IEventStoreAdapter,
} from '@pbuda/nestjs-event-store';
import { InMemoryEventStoreAdapter } from '@pbuda/nestjs-event-store-in-memory';
import { KurrentDbEventStoreAdapter } from '@pbuda/nestjs-event-store-kurrentdb';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TodoModule } from './todo/todo.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventStoreModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): IEventStoreAdapter => {
        const adapterType = config.get<string>('EVENT_STORE_ADAPTER', 'memory');

        if (adapterType === 'kurrentdb') {
          const connectionString = config.get<string>(
            'KURRENTDB_CONNECTION_STRING',
            'kurrentdb://localhost:2113?tls=false',
          );
          return new KurrentDbEventStoreAdapter(connectionString);
        }

        return new InMemoryEventStoreAdapter();
      },
    }),
    TodoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
