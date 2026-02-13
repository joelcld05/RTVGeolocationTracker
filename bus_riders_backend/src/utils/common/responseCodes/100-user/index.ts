import { MessageResponse } from '@/utils/types'

export const PASSWORD_NOT_CHANGED: MessageResponse = { message: 'PASSWORD_NOT_CHANGED', code: 100000 }
export const PASSWORD_CHANGED: MessageResponse = { message: 'PASSWORDCHANGED', code: 100010 }
export const AUTH_ERROR: MessageResponse = { message: 'AUTH_ERROR', code: 100020 }
export const EXPIRED_SESSION: MessageResponse = { message: 'EXPIRED_SESSION', code: 100025 }
export const EXPIRED_SESSION_REFRESH: MessageResponse = { message: 'EXPIRED_SESSION_REFRESH', code: 100026 }
export const AUTH_EXIST: MessageResponse = { message: 'AUTH_EXIST', code: 100030 }
export const AUTH_DOESNOT_EXIST: MessageResponse = { message: 'AUTH_DOESNOT_EXIST', code: 100040 }
export const NO_SESSION: MessageResponse = { message: 'NO_SESSION', code: 100060 }
export const USER_CREATED: MessageResponse = { message: 'USER_CREATED', code: 100070 }
export const USER_BLOCKED: MessageResponse = { message: 'BLOCKED_USER', code: 100071 }
export const NO_INVESTMENT_CONFIG: MessageResponse = { message: 'NO_INVESTMENT_CONFIG', code: 100080 }
export const KYC_INVALID_STATUS: MessageResponse = { message: 'KYC_INVALID_STATUS', code: 100090 }
export const NO_VALID_USER: MessageResponse = { message: 'NO_VALID_USER', code: 100100 }

export const OTP_AUTH_ERROR: MessageResponse = { message: 'OTP_AUTH_ERROR', code: 100110 }
export const OTP_AUTH_INVALID: MessageResponse = { message: 'OTP_AUTH_INVALID', code: 100120 }
export const OTP_ALREADY_ENABLED: MessageResponse = { message: 'OTP_ALREADY_ENABLED', code: 100130 }
export const USER_EXTERNAL_LINK: MessageResponse = { message: 'USER_EXTERNAL_LINK', code: 100140 }
