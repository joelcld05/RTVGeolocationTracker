import type { _UserType } from '@/models/_User'

declare global {
  namespace Express {
    // Ensure Passport/Express `User` resolves to our _UserType
    interface User extends _UserType {}
    interface Request {
      user?: _UserType
    }
  }
}

export {}
