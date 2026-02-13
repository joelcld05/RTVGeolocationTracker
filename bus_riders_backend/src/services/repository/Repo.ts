import { union, concat, hasIn, indexOf, isEmpty } from 'lodash'
import _Role, { PublicRole, AdminRole } from '@/models/_Role'
import { getCache, setCache } from '@/utils'
import { connection, Model } from 'mongoose'
import { _UserType } from '@/models/_User'

const WRITE_ACTIONS = ['create', 'edit', 'delete']

type AccessType = {
  restrictWay?: boolean
  canAccessAtributes?: any
  userIdIncluded?: any
  selectFields?: any
  isSelecting?: boolean
  filterFields?: any
  filterData?: any
  userRoles?: any
  isAdmin: any
  logedIn: any
  access: any
  global: any
}

export default class Repo {
  user: _UserType | undefined
  modelName: string
  model: Model<any>
  model_schema: Array<any>
  model_schema_names: Array<any>
  model_schema_files: Array<any>

  constructor(_usr: _UserType | undefined, _model: string) {
    this.user = _usr
    this.modelName = _model
    this.model = connection.models[_model]
    this.loadSchemaCache(_model)
  }

  public setUser(user: _UserType) {
    return (this.user = user)
  }

  isFile(attributeName: string) {
    return this.model_schema_files.includes(attributeName)
  }

  getType(attributeName: string) {
    try {
      const rs = this.model_schema.filter((item: any) => {
        return attributeName === item[0]
      })[0]
      return rs[1].instance
    } catch (e) {
      return false
    }
  }

  getTypeObj(attributeName: string) {
    try {
      const rs = this.model_schema.filter((item: any) => {
        return attributeName === item[0]
      })[0]
      return rs[1]
    } catch (e) {
      return {}
    }
  }

  private loadSchemaCache(modelName: string) {
    const schema = getCache(`${modelName}_schema`)
    if (schema) {
      this.model_schema = schema
      this.model_schema_names = getCache(`${modelName}_schema_names`)
      this.model_schema_files = getCache(`${modelName}_schema_files`)
      return
    }

    this.cacheAllSchemas()
    this.model_schema_names = getCache(`${modelName}_schema_names`)
    this.model_schema_files = getCache(`${modelName}_schema_files`)
  }

  private cacheAllSchemas() {
    for (const mod in connection.models) {
      const path = Object.entries(connection.models[mod].schema.paths)
      const model_schema_inner = path
      const model_schema_names_inner = path.map((item) => item[0])
      const model_schema_files_inner = path.filter((item: any) => item[1].options?.isFile).map((item) => item[0])
      setCache(`${mod}_schema`, model_schema_inner)
      setCache(`${mod}_schema_files`, model_schema_files_inner)
      setCache(`${mod}_schema_names`, model_schema_names_inner)
    }
  }

  private buildAccessOrConditions(args: {
    can: string
    logedIn: boolean
    isAdmin: boolean
    global: boolean
    filter: any
    userIdIncluded: boolean
    accessIdIncluded: boolean
  }) {
    const { can, logedIn, isAdmin, global, filter, userIdIncluded, accessIdIncluded } = args
    const accessRow = []
    const or: any = []

    if (logedIn && !isAdmin) {
      switch (can) {
        case 'create':
          break
        case 'edit':
        case 'get':
        case 'retrieve':
        case 'view':
        case 'delete':
          if (!global || (isEmpty(filter) && !global)) {
            if (userIdIncluded && this.user) {
              or.push({ userId: this.user._id })
              or.push({ 'userId._id': this.user._id })
            }
            if (accessIdIncluded && this.user) {
              accessRow.push(this.user._id?.toString())
              or.push({ access: { $in: accessRow } })
            }
          }
          break
      }
    } else if (!logedIn) {
      accessRow.push(PublicRole)
      or.push({ access: { $in: accessRow } })
    }

    return or
  }

  private filterWritableData(data: any, canAccessAtributes: any, restrictWay: boolean) {
    const prefilter = Object.entries(data)
      .filter(([key]) => {
        let rs = !canAccessAtributes.includes(key)
        if (restrictWay) rs = !rs
        return rs
      })
      .filter(([key]) => this.model_schema_names.includes(key))
    return Object.fromEntries(prefilter)
  }

  private buildSelectProjection(args: {
    select: Array<string>
    canAccessAtributes: Array<string>
    isSelecting: boolean
    restrictWay: boolean
    concatSelect: string
  }) {
    const { select, canAccessAtributes, isSelecting, restrictWay, concatSelect } = args
    const tempselectFields: any = {}
    const selectFields: any = isSelecting ? select : canAccessAtributes
    const concatSelectTmp = concatSelect ? `${concatSelect}.` : ''

    for (let index = 0; index < selectFields.length; index++) {
      const realname = selectFields[index]
      const nameAtt = concatSelectTmp + realname

      if (isSelecting) {
        let hasKey = indexOf(canAccessAtributes, realname) >= 0
        if (restrictWay) hasKey = !hasKey
        if (!hasKey) {
          tempselectFields[nameAtt] = hasKey ? 0 : 1
        }
      } else if (!isSelecting) {
        tempselectFields[nameAtt] = restrictWay ? 1 : 0
      }
    }

    return tempselectFields
  }

  async access(obj: any): Promise<AccessType> {
    const { can = '', data = {}, filter = {}, select = [], isSelecting = false, concatSelect = '', modelNameOverWrite = '' } = obj
    const model = modelNameOverWrite !== '' ? modelNameOverWrite : this.modelName
    const { access, global, isAdmin, logedIn, userRoles, restrictWay, canAccessAtributes } = await this.checkAccess(this.user, model, can)
    if (!access && !global) return { access, global, logedIn, isAdmin }

    const userIdIncluded = this.model_schema_names.includes('userId')
    const accessIdIncluded = this.model_schema_names.includes('access')
    const writeActions = WRITE_ACTIONS.includes(can)
    let filterFields = filter
    const or = this.buildAccessOrConditions({
      can,
      logedIn,
      isAdmin,
      global,
      filter,
      userIdIncluded,
      accessIdIncluded,
    })

    const filterData = writeActions ? this.filterWritableData(data, canAccessAtributes, restrictWay) : {}
    const selectFields = this.buildSelectProjection({
      select,
      canAccessAtributes,
      isSelecting,
      restrictWay,
      concatSelect,
    })

    if (!isEmpty(filter?.$and)) {
      filterFields = {
        $and: concat(or.length > 0 ? [{ $or: or }] : [], filter.$and),
      }
    } else if (or.length > 0) {
      filterFields = { $or: or }
    }

    return {
      restrictWay,
      canAccessAtributes,
      userIdIncluded,
      selectFields,
      filterFields,
      filterData,
      userRoles,
      isAdmin,
      logedIn,
      access,
      global,
    }
  }

  async checkAccess(user: _UserType | undefined, modelAccess: string, can: string) {
    const accessRole = typeof user?._id === 'undefined' ? PublicRole : String(user?._id)
    const logedIn = accessRole !== PublicRole
    let restrictWay = false
    let isAdmin = false
    let access = false
    let global = false
    let action: any = []
    let roles: any = []
    const userRoles = []
    const filterObject: any = {
      permissions: { $elemMatch: { model: modelAccess } },
    }

    if (!logedIn) {
      filterObject.code = PublicRole
    } else {
      filterObject._id = { $in: user ? user._roles : [PublicRole] }
    }

    roles = await _Role.find(filterObject, {
      'permissions.$': 1,
      name: 1,
      code: 1,
      superAccess: 1,
    })

    for (const item in roles) {
      userRoles.push(roles[item])

      const permissions = roles[item].permissions

      if (permissions.length > 0) {
        const tempAction = permissions[0].access?.filter((acc: any) => can === acc.action)

        if (hasIn(permissions[0], 'global.' + can)) {
          global = permissions[0].global[can]
        }

        if (tempAction.length > 0) {
          action = union(tempAction[0]?.restrict, action)
          access = true
          restrictWay = tempAction[0]?.restrictWay
        }
      }

      if (roles[item].code === AdminRole) {
        access = true
        isAdmin = true
        action = []
        global = true
        break
      }
    }

    return {
      canAccessAtributes: action,
      restrictWay,
      userRoles,
      isAdmin,
      logedIn,
      access,
      global,
    }
  }
}
