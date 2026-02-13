import { MailerOptionsType } from '@/utils/types/MailTypes'

export const MailTransporterConfig: MailerOptionsType = {
  service: process.env.MAIL_HOST || '',

  auth: {
    user: process.env.MAIL_USER || '', // generated ethereal user
    pass: process.env.MAIL_PASSWORD || '', // generated ethereal password
  },
}
