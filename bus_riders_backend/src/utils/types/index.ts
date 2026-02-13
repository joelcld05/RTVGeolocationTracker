import { Router } from 'express'

interface Controller {
  rt: Router
  baseRoute: string
  get: Array<any>
  view: Array<any>
  create: Array<any>
  update?: Array<any>
  delete?: Array<any>

  routes: () => Router
}

export type MessageResponse = {
  message: string
  code: number
}

export type { Controller }
