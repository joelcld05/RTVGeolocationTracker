type MailerOptionsType = {
  service: string
  auth: {
    user: string
    pass: string
  }
}

type AttachmentsType = {
  filename?: string
  path?: string
  content?: string
  contentType?: string
  raw?: string
}

type EmailOptionsType = {
  from: string
  replyTo?: string
  to: string
  subject: string
  html?: string
  attachments?: Array<AttachmentsType>
}

export type { MailerOptionsType, EmailOptionsType }
