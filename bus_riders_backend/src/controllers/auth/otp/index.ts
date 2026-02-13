import { checkReqDataError, BAD_REQUEST, OK, OTP_ALREADY_ENABLED, AUTH_DOESNOT_EXIST, OTP_AUTH_INVALID, toObjectId } from '@/utils'
import { validateOpt, generateRandomBase32 } from '@/services/Authentication'
import { _checkRoles, isValidObjectIdParam, validateRequestOPT } from '@/middleware/auth'
import { Request, Response, Router, NextFunction } from 'express'
import _User, { modelName } from '@/models/_User'
import _ModelRepo from '@/services/repository/_ModelRepo'
import { check, param } from 'express-validator'
import rateLimit from 'express-rate-limit'
import { sendEmail } from '@/libs/Mailer'
import { _auth } from '@/middleware/auth'

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 })

class OtpController {
  rt = Router()
  baseRoute = '/otp'

  routes() {
    this.rt.route(`${this.baseRoute}/generate`).post(this.generateOTP)
    this.rt.route(`${this.baseRoute}/verify`).post(this.verifyOTP)
    this.rt.route(`${this.baseRoute}/validate`).post(this.validateOTP)
    this.rt.route(`${this.baseRoute}/disable`).post(this.disableOTP)

    return this.rt
  }

  async validateOptVaerification(user: any) {
    if (!user.otp_enabled) {
      return false
    }
    const t2 = (user?.otp_last_verified || new Date()).getTime()
    const t1 = new Date().getTime()
    const verification = (t1 - t2) / (24 * 3600 * 1000) >= 0.25
    if (verification) {
      await _User.findOneAndUpdate({ _id: user._id }, { otp_verified: false })
    }
    return verification || !user.otp_verified
  }

  generateOTP = [
    _auth,
    async (req: Request, res: Response) => {
      try {
        const { regenerate } = req.body
        const reqUser: any = req.user
        const userFetch = new _ModelRepo(modelName, reqUser).systemAccess()
        const userget = await userFetch.findOne({ _id: reqUser._id })

        const output = { otpauth_url: '', base32_secret: '' }
        if (!userget) {
          throw AUTH_DOESNOT_EXIST
        } else if (!userget.otp_enabled) {
          output.base32_secret = userget.otp_base32 || generateRandomBase32()

          if (regenerate) {
            output.base32_secret = generateRandomBase32()
          }

          output.otpauth_url = validateOpt(output.base32_secret, '', new Date().getTime(), userget?.email).otpauth_url

          await userFetch.findOneAndUpdate(
            { _id: reqUser._id },
            {
              otp_auth_url: output.otpauth_url,
              otp_base32: output.base32_secret,
            },
          )
          return res.status(OK).json({
            base32: output.base32_secret,
            otpauth_url: output.otpauth_url,
          })
        } else {
          throw OTP_ALREADY_ENABLED
        }
      } catch (error) {
        res.status(BAD_REQUEST).json({
          status: 'error',
        })
      }
    },
  ]

  validateOTP = [
    _auth,
    check('token').notEmpty(),
    check('opt_time').notEmpty().isNumeric(),
    check('just_validation').optional().isBoolean(),
    check('get_code').optional().isBoolean(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { token, opt_time, just_validation = false, get_code = false } = req.body
        const reqUser: any = req.user
        const userFetch = new _ModelRepo(modelName, reqUser).systemAccess()
        const userget = await userFetch.findOne({ _id: reqUser._id })

        if (!userget) throw AUTH_DOESNOT_EXIST

        const delta = validateOpt(userget.otp_base32, token, opt_time, userget?.email).validation

        if (delta && !just_validation) {
          await userFetch.findOneAndUpdate(
            { _id: reqUser._id },
            {
              otp_last_verified: new Date(),
              otp_verified: true,
            },
          )
          return res.status(OK).json({
            otp_valid: true,
            otp_verified: true,
          })
        } else if (delta && just_validation) {
          const rs: any = {
            otp_valid: delta,
          }
          if (get_code && delta) {
            rs.otpauth_url = userget.otp_auth_url
            rs.base32 = userget.otp_base32
          }
          return res.status(OK).json(rs)
        } else {
          throw OTP_AUTH_INVALID
        }
      } catch (error) {
        res.status(BAD_REQUEST).json({
          error,
          otp_valid: false,
        })
      }
    },
  ]

  verifyOTP = [
    loginLimiter,
    check('opt_token').notEmpty(),
    check('opt_time').notEmpty().isNumeric(),
    checkReqDataError,
    (req: any, res: Response, next: NextFunction) => {
      req.over_write_opt = true
      next()
    },
    _auth,
    async (req: Request, res: Response) => {
      try {
        const { opt_token, opt_time } = req.body
        const reqUser: any = req.user
        const userFetch = new _ModelRepo(modelName, reqUser).systemAccess()
        const userget = await userFetch.findOne({ _id: reqUser._id })

        if (!userget) throw AUTH_DOESNOT_EXIST

        const delta = validateOpt(userget.otp_base32, opt_token, opt_time, userget?.email).validation

        if (delta) {
          await userFetch.findOneAndUpdate(
            { _id: reqUser._id },
            {
              otp_enabled: true,
              otp_verified: true,
              otp_last_verified: new Date(),
            },
          )
          return res.status(200).json({
            otp_verified: true,
          })
        } else {
          throw OTP_AUTH_INVALID
        }
      } catch (error) {
        res.status(BAD_REQUEST).json({
          status: 'error',
          error,
        })
      }
    },
  ]

  disableOTP = [
    _auth,
    validateRequestOPT,
    async (req: Request, res: Response) => {
      try {
        const reqUser: any = req.user
        const userFetch = new _ModelRepo(modelName, reqUser).systemAccess()
        await userFetch.findOneAndUpdate(
          { _id: reqUser._id },
          {
            otp_enabled: false,
            otp_verified: false,
            otp_auth_url: '',
            otp_base32: '',
          },
        )
        return res.status(200).json({
          otp_disabled: true,
        })
      } catch (error) {
        res.status(BAD_REQUEST).json({
          otp_disabled: false,
          error,
        })
      }
    },
  ]

  disableAdminOtp = [
    _auth,
    _checkRoles([0, 1]),
    isValidObjectIdParam('id'),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params
        const user = await _User.findOne({ _id: toObjectId(id) })
        if (user?.otp_enabled) {
          const idPasswordConfirmation = randomUUID()
          await _User.findOneAndUpdate({ _id: toObjectId(id) }, { idPasswordConfirmation, otp_enabled: false, requestPasswordLink: new Date() })
          await sendEmail(user.email || '', 'Cambio de Contraseña', { token: idPasswordConfirmation }, 'user/resetPassword')
          return res.status(OK).json({ saved: true })
        }

        return res.status(BAD_REQUEST).json({ saved: false })
      } catch (error) {
        return res.status(BAD_REQUEST).json({ saved: false })
      }
    },
  ]
}

export default new OtpController()
function randomUUID() {
  throw new Error('Function not implemented.')
}
