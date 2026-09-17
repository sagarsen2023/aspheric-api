import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from '../../config';
import { MailModule } from './mail.module';
import { MailService } from './mail.service';

describe('MailModule', () => {
  it('provides MailService with its config and transport', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [appConfig],
        }),
        MailModule,
      ],
    }).compile();

    expect(moduleRef.get(MailService)).toBeInstanceOf(MailService);
  });
});
