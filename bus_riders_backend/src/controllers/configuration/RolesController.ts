import { queryFormatting, checkReqDataError, checkReqBodyInput, OK, BAD_REQUEST, toObjectId } from '@/utils'
import _ModelRepo from '@/services/repository/_ModelRepo'
import { query, param, check } from 'express-validator'
import { _auth, _checkRoles, isValidObjectIdParam } from '@/middleware/auth'
import { Request, Response, Router } from 'express'
import { modelName } from '@/models/_Role'
import { Controller } from '@/utils/types'
import { connection } from 'mongoose'

class RolesController implements Controller {
  rt = Router()
  baseRoute = '/roles'

  routes() {
    this.rt.route(`${this.baseRoute}/models`).get(this.getModels)
    this.rt.route(`${this.baseRoute}`).get(this.get)
    // .post(this.create)
    this.rt.route(`${this.baseRoute}/name/:name`).get(this.viewByName)
    this.rt.route(`${this.baseRoute}/:id`).get(this.view)
    // .put(this.update).delete(this.delete)
    return this.rt
  }

  getModels = [
    _auth,
    _checkRoles([0, 1]),
    async (_req: Request, res: Response) => {
      try {
        const models = Object.keys(connection.models)
        return res.status(OK).json({ data: models })
      } catch (error) {
        return res.status(BAD_REQUEST).json({ error })
      }
    },
  ]

  get = [
    _auth,
    _checkRoles([0, 1]),
    query('page').optional().isNumeric(),
    query('rows').optional().isNumeric(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const model = new _ModelRepo(modelName, req.user)
        const filterOptions = queryFormatting(req.query)
        const data = await model.getMany(filterOptions)
        return res.status(OK).json(data)
      } catch (error) {
        return res.status(BAD_REQUEST).json({ error })
      }
    },
  ]

  viewByName = [
    _auth,
    _checkRoles([0, 1]),
    param('name').notEmpty().isString(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { name } = req.params
        const repo = new _ModelRepo(modelName, req.user)

        const filterOptions = queryFormatting(req.query, [{ name }])
        const role = await repo.getOne(filterOptions)
        return res.status(OK).json(role)
      } catch (error) {
        return res.status(BAD_REQUEST).json({ error })
      }
    },
  ]

  view = [
    _auth,
    _checkRoles([0, 1]),
    isValidObjectIdParam('id'),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params
        const repo = new _ModelRepo(modelName, req.user)
        const filterOptions = queryFormatting(req.query, [{ _id: toObjectId(id) }])
        const role = await repo.getOne(filterOptions)
        return res.status(OK).json(role)
      } catch (error) {
        return res.status(BAD_REQUEST).json({ error })
      }
    },
  ]

  create = [
    _auth,
    _checkRoles([0, 1]),
    checkReqBodyInput(modelName),
    check('name').notEmpty().isString(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const repo = new _ModelRepo(modelName, req.user)
        const role = await repo.create(req.body)
        return res.status(OK).json({ saved: true, data: role })
      } catch (error) {
        return res.status(BAD_REQUEST).json({ saved: false, error })
      }
    },
  ]

  update = [
    _auth,
    _checkRoles([0, 1]),
    isValidObjectIdParam('id'),
    checkReqBodyInput(modelName),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params
        const repo = new _ModelRepo(modelName, req.user)
        const { filter } = queryFormatting(req.query, [{ _id: toObjectId(id) }])
        await repo.updateOne({ data: req.body, filter })
        return res.status(OK).json({ saved: true, data: req.body })
      } catch (error) {
        return res.status(BAD_REQUEST).json({ saved: false, error })
      }
    },
  ]

  delete = [
    _auth,
    _checkRoles([0, 1]),
    isValidObjectIdParam('id'),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params
        const repo = new _ModelRepo(modelName, req.user)
        const filterOptions = queryFormatting(req.query, [{ _id: toObjectId(id) }])
        const rs = await repo.deleteOne(filterOptions)
        return res.status(OK).json({ deleted: Boolean(rs?._id) })
      } catch (error) {
        return res.status(BAD_REQUEST).json({ deleted: false, error })
      }
    },
  ]
}

export default new RolesController()
