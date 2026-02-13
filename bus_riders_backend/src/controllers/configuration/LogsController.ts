import { BAD_REQUEST, OK, fileTypes, checkReqDataError } from '@/utils'
import { _auth, _checkRoles } from '@/middleware/auth'
import { Request, Response, Router } from 'express'
import Logs from '@/models/appConfig/Logs'
import { check } from 'express-validator'
import path from 'path'

class LogController {
  rt = Router()
  baseRoute = '/log'

  routes() {
    this.rt.route(`${this.baseRoute}`).post(this.create)
    this.rt.route(`${this.baseRoute}/:file`).get(this.get)
    return this.rt
  }

  create = [
    _auth,
    check('log').notEmpty(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const user: any = req.user
        const { log, origin } = req.body
        await Logs.create([{ userId: user._id, log, origin }])
        res.status(OK).json({ saved: true, data: req.body })
      } catch (error: any) {
        res.status(BAD_REQUEST).json({
          saved: false,
        })
      }
    },
  ]

  get = [
    _auth,
    _checkRoles([0, 1]),
    check('file').notEmpty().isString(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { file } = req.params
        const filePath = path.join(__dirname, '../../log', `${file.replaceAll('/', '')}.log`)
        res.setHeader('Content-Disposition', `attachment; filename='${file.replaceAll('/', '')}.log'`)
        res.contentType(fileTypes.txt)
        res.status(OK).download(filePath)
      } catch (error: any) {
        res.status(BAD_REQUEST).json({ saved: false })
      }
    },
  ]
}

export default new LogController()
