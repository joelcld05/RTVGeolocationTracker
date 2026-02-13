import { MessageResponse } from '@/utils/types'

export const EMAIL_NOT_SENT: MessageResponse = { message: 'EMAIL_NOT_SENT', code: 200000 }
export const EMAIL_SENT: MessageResponse = { message: 'EMAIL_SENT', code: 200010 }
export const EMAIL_NOT_VERIFY: MessageResponse = { message: 'EMAIL_NOT_VERIFY', code: 200020 }
export const EMAIL_VERIFY: MessageResponse = { message: 'EMAIL_VERIFY', code: 200040 }
export const NOTIFICATION_NOT_SENT: MessageResponse = { message: 'NOTIFICATION_NOT_SENT', code: 200050 }
export const EMAIL_15_WAIT: MessageResponse = { message: 'NOTIFICATION_NOT_SENT', code: 200060 }
