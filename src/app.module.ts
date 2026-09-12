import { Module } from '@nestjs/common';
// import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from '../config';

// export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // ObserveModule.forRoot({
    //   appKey: 'YOUR_APP_KEY',
    //   appSecret: 'YOUR_APP_SECRET',
    //   serviceId: 'aspheric-api',
    // }),
    ConfigModule.forRoot({
      envFilePath: ['.env'],
      load: [appConfig],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
