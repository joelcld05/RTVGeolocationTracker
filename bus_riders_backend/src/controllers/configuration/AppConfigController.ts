import { queryFormatting, checkReqDataError, checkReqBodyInput, getReqOrigin, getMainDomain, OK, BAD_REQUEST, toObjectId } from '@/utils'
import _ModelRepo, { ModelRepoType } from '@/services/repository/_ModelRepo'
import { modelName } from '@/models/appConfig/appConfig'
import { check, param, query } from 'express-validator'
import { Request, Response, Router } from 'express'
import { Controller } from '@/utils/types'
import { _auth, isValidObjectIdParam } from '@/middleware/auth'

class CountryRetentionsController implements Controller {
  rt = Router()
  baseRoute = '/app'

  routes() {
    this.rt.route(`${this.baseRoute}/`).get(this.get).post(this.create)
    this.rt.route(`${this.baseRoute}/:id`).get(this.view).put(this.update)
    return this.rt
  }

  get = [
    _auth,
    query('page').optional().isNumeric(),
    query('rows').optional().isNumeric(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const host = getReqOrigin(req)
        const filterOptions = queryFormatting(req.query, [{ hostDomain: getMainDomain(host) }])
        const model = new _ModelRepo(modelName, req.user)
        const rs = await model.getMany(filterOptions)
        return res.status(OK).json(rs)
      } catch (error) {
        return res.status(BAD_REQUEST).json({ error })
      }
    },
  ]

  view = [
    _auth,
    query('id').optional(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params
        const filterOptions: ModelRepoType = queryFormatting(req.query, [{ _id: toObjectId(id) }])
        const trx = new _ModelRepo(modelName, req.user)
        const datatrx = await trx.getOne(filterOptions)
        return res.status(OK).json(datatrx)
      } catch (error) {
        return res.status(BAD_REQUEST).json({ error })
      }
    },
  ]

  create = [
    _auth,
    checkReqBodyInput(modelName),
    check('retention').notEmpty().isFloat({ lt: 101, gt: -1 }),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const newmodelI = new _ModelRepo(modelName, req.user)
        await newmodelI.create(req.body)
        return res.status(OK).json({ saved: true, data: req.body })
      } catch (error) {
        return res.status(BAD_REQUEST).json({ saved: false, error })
      }
    },
  ]

  update = [
    _auth,
    isValidObjectIdParam('id'),
    checkReqBodyInput(modelName),
    check('retention').optional().isFloat({ lt: 101, gt: -1 }),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params
        const modelI = new _ModelRepo(modelName, req.user)
        await modelI.updateOne({
          data: req.body,
          filter: { $and: [{ _id: toObjectId(id) }] },
          // config: { new: true, upsert: true },
        })
        return res.status(OK).json({ saved: true, data: req.body })
      } catch (error) {
        return res.status(BAD_REQUEST).json({ saved: false })
      }
    },
  ]

  delete = []
}

export default new CountryRetentionsController()
