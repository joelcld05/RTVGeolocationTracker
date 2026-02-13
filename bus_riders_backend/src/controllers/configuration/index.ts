import AppConfigController from '@/controllers/configuration/AppConfigController'
import RolesController from '@/controllers/configuration/RolesController'
import { Router } from 'express'

class ConfigurationController {
  rt = Router()
  baseRoute = '/configuration'

  routes() {
    this.rt.use(`${this.baseRoute}/`, AppConfigController.routes())
    this.rt.use(`${this.baseRoute}/`, RolesController.routes())
    return this.rt
  }
}

export default new ConfigurationController()
