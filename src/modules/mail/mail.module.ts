import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** Global để các module (Auth...) dùng MailService. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
