import { QueryOptions, SortValues, PipelineStage, Model, Query, ClientSession, isValidObjectId } from 'mongoose'
import { _UserType, modelName as _UserModelName } from '@/models/_User'
import { isEmpty, uniq, remove, intersection } from 'lodash'
import { PublicRole } from '@/models/_Role'
import { DATA_NOT_ACCESS } from '@/utils'

import Repo from './Repo'

export type ModelRepoType = {
  filter?: { $and: Array<Record<string, any>> }
  select?: Array<string>
  config?: QueryOptions
  sort?: string | Record<string, SortValues> | PipelineStage.Sort['$sort']
  data?: any
  rows?: number
  page?: number
  populate?: Array<string>
  overwriteFilter?: object
  matchPopulate?: Array<string>
}

export default class ModelRepo extends Repo {
  constructor(modelName: string, _usr?: _UserType | undefined) {
    super(_usr, modelName)
  }

  private parsePopulateItem(item: string) {
    const parts = item.split(';')
    return {
      modelName: parts[0],
      localField: parts[1],
      foreignField: parts[2],
      alias: parts[3] || parts[1],
    }
  }

  private getPopulateAliases(populate: Array<string>) {
    return populate.map((item) => this.parsePopulateItem(item).alias)
  }

  private getSelectForAlias(select: Array<string>, alias: string) {
    return select
      .filter((sel: string) => {
        return sel.includes(alias + '.')
      })
      .map((sel: string) => {
        return sel.split('.')[1]
      })
  }

  getAllKeys(obj: any, included: Array<any>) {
    const firstLevelfilter: any = {}
    const secondLevelfilter: any = {}
    if (isValidObjectId(obj)) return { firstLevelfilter, secondLevelfilter }
    for (const key in obj) {
      if (!obj.hasOwnProperty(key)) continue
      if (obj[key] === null) continue

      if (Array.isArray(obj[key])) {
        const isArrayFirst: any = []
        const isArraySecond: any = []
        obj[key].forEach((item: any) => {
          const newKeys = this.getAllKeys(item, included)
          if (!isEmpty(newKeys.firstLevelfilter)) isArrayFirst.push(newKeys.firstLevelfilter)
          if (!isEmpty(newKeys.secondLevelfilter)) isArraySecond.push(newKeys.secondLevelfilter)
          newKeys.firstLevelfilter
        })
        if (isArrayFirst.length > 0) firstLevelfilter[key] = isArrayFirst
        if (isArraySecond.length > 0) secondLevelfilter[key] = isArraySecond
      } else {
        if (key.includes('.')) {
          const keyarray = key.split('.')
          const finded = intersection(keyarray, included)
          if (finded.length > 0) {
            secondLevelfilter[key] = obj[key]
          } else {
            firstLevelfilter[key] = obj[key]
          }
        } else {
          firstLevelfilter[key] = obj[key]
        }
      }
    }
    return { firstLevelfilter, secondLevelfilter }
  }

  async getOne(options: ModelRepoType = {}): Promise<Query<any, any, any, any, 'findOne'>> {
    const { filter = {}, select = [], populate = [] } = options
    const { access, selectFields, filterFields, global } = await this.access({
      can: 'view',
      filter,
      select,
      isSelecting: select.length > 0,
    })

    if (!access && !global) throw DATA_NOT_ACCESS

    const model = this.model.findOne(filterFields)
    if (!isEmpty(selectFields)) {
      model.select(selectFields)
    }

    for (const item of populate) {
      const pathInfo = this.parsePopulateItem(item)
      const { selectFields } = await this.access({
        modelNameOverWrite: pathInfo.modelName,
        // concatSelect: pathInfo.localField,
        can: 'view',
      })
      const populateOption: any = { path: pathInfo.localField }
      if (!isEmpty(selectFields)) {
        populateOption.select = selectFields
      }
      model.populate(populateOption)
    }
    return await model
  }

  async saveParseObject(object: any) {
    const { selectFields, restrictWay } = await this.access({
      can: 'view',
    })
    let parsed: any = {}
    if (!restrictWay) parsed = { ...object }
    for (const key in selectFields) {
      if (restrictWay) {
        if (object[key]) parsed[key] = object[key]
      } else {
        delete parsed[key]
      }
    }
    return parsed
  }

  async getMany(options: ModelRepoType = {}): Promise<{ data: any; page: number; rows: number; count: number }> {
    const { filter = {}, select = [], sort = { created_at: -1 }, rows = 10, page = 0, populate = [], overwriteFilter } = options

    const preselect = select.filter((item: string) => {
      return !item.includes('.')
    })

    const { access, selectFields, filterFields, global } = await this.access({
      can: 'view',
      filter,
      select: preselect,
      isSelecting: select.length > 0,
    })

    const tempselectFields = selectFields
    let globalFilter = filterFields

    if (!access && !global) throw DATA_NOT_ACCESS
    const model = this.model.aggregate()
    let count = 0
    if (overwriteFilter) globalFilter = overwriteFilter
    const aliases = this.getPopulateAliases(populate)

    const filterKeysFilter = this.getAllKeys(globalFilter, aliases)
    const haveFirst = isEmpty(filterKeysFilter?.firstLevelfilter)
    const haveSecond = isEmpty(filterKeysFilter?.secondLevelfilter)

    if (haveFirst && haveSecond) {
      count = await this.model.countDocuments({}, { hint: '_id_' })
      model.sort(sort)
      model.skip(rows * page)
      model.limit(rows)
    } else if (!haveFirst && haveSecond) {
      model.sort(sort)
      model.match(filterKeysFilter.firstLevelfilter)
      count = await this.model.countDocuments(filterKeysFilter.firstLevelfilter, { hint: '_id_' })
      model.skip(rows * page)
      model.limit(rows)
    } else if (!haveFirst) {
      model.match(filterKeysFilter.firstLevelfilter)
    }

    for (const item of populate) {
      const pathInfo = this.parsePopulateItem(item)
      const alias = pathInfo.alias
      const innetOptions: any = {
        modelNameOverWrite: pathInfo.modelName,
        // concatSelect: alias,
        can: 'view',
        isSelecting: false,
      }

      try {
        const filteredSelect = this.getSelectForAlias(select, alias)
        if (filteredSelect.length > 0) {
          innetOptions.select = filteredSelect
          innetOptions.isSelecting = true
          tempselectFields[alias] = 1
        }
      } catch (error) {
        console.log(`error:`, error)
      }

      const { access, global, selectFields } = await this.access(innetOptions)

      if (access || global) {
        const pipeline: any = []
        if (!isEmpty(selectFields)) pipeline.push({ $project: selectFields })
        model.lookup({
          from: pathInfo.modelName,
          localField: pathInfo.localField,
          foreignField: pathInfo.foreignField,
          as: alias,
          pipeline,
        })
        if ('Array' !== this.getType(pathInfo.localField)) {
          model.unwind({
            path: '$' + alias,
            preserveNullAndEmptyArrays: true,
          })
        }
      }
    }

    if (!haveSecond) {
      if (!isEmpty(tempselectFields)) model.project(tempselectFields)
      model.match(filterKeysFilter.secondLevelfilter)
      model.sort(sort)
      model.facet({
        metadata: [{ $count: 'count' }, { $addFields: { page, rows } }],
        data: [{ $skip: rows * page }, { $limit: rows }],
      })
      const rs = await model.exec()
      if (!rs[0].metadata[0]) {
        rs[0].metadata = [{ page, rows, count: 0 }]
      }
      return { data: rs[0].data, ...rs[0].metadata[0] }
    } else {
      if (!isEmpty(tempselectFields)) model.project(tempselectFields)
      const rs = await model.exec()
      return { data: rs, count, page, rows }
    }
  }

  async create(data: any, session: ClientSession | null = null) {
    const { access, filterData, logedIn, global, userIdIncluded } = await this.access({
      can: 'create',
      data,
    })

    if (!access && !global) throw DATA_NOT_ACCESS
    const creation = new this.model(filterData)
    let arrayaccess = this.getAccessAttribute(creation?._id, logedIn)

    if (global && data?.access) {
      arrayaccess.concat(data?.access.split(','))
    }

    if (data?.userId && data?.userId !== this.user?._id) {
      arrayaccess = remove(arrayaccess, (item) => item === String(this.user?._id))
      arrayaccess.push(String(data?.userId))
    }

    if (arrayaccess.length > 0) {
      creation.access = uniq(arrayaccess)
    }

    if (userIdIncluded && this.modelName !== _UserModelName && !creation?.userId && logedIn && this.user) {
      creation.userId = this.user._id?.toString()
    }

    return await creation.save({ session })
  }

  async updateOne(options: ModelRepoType = {}) {
    const { filter = {}, data = {}, config = {} } = options
    const { access, filterFields, filterData, logedIn, global, userIdIncluded } = await this.access({
      can: 'edit',
      filter,
      data,
    })

    if (!access && !global) throw DATA_NOT_ACCESS
    let dataOut: any = this.model.findOne(filterFields)
    dataOut = await dataOut
    if (!dataOut) {
      if (config?.upsert) {
        dataOut = new this.model()
      } else {
        return undefined
      }
    }

    if (this.modelName !== _UserModelName && !dataOut?.userId && logedIn && this.user) {
      dataOut.userId = this.user._id?.toString()
    }

    if ((dataOut?.access || []).length === 0) {
      const arrayaccess: Array<string> = this.getAccessAttribute(dataOut?._id, logedIn)
      if (userIdIncluded && arrayaccess.length === 0) {
        arrayaccess.push(dataOut.userId)
      }
      dataOut.access = arrayaccess
    }

    dataOut.set(filterData)
    return await dataOut.save({ session: config?.session || null })
  }

  async deleteOne({ filter = {} }) {
    const { access, filterFields, global } = await this.access({
      can: 'delete',
      filter,
    })
    if (!access && !global) throw DATA_NOT_ACCESS
    return await this.model.findOneAndDelete(filterFields)
  }

  getAccessAttribute(_id: any, logedIn: boolean): Array<string> {
    const dataAccess = []
    const accessRole = typeof this.user?._id === 'undefined' ? PublicRole : String(this.user?._id)
    if (accessRole === PublicRole && this.modelName === _UserModelName) {
      dataAccess.push(_id.toString())
    } else {
      if (logedIn && this.user?._id) {
        dataAccess.push(this.user._id?.toString())
      } else {
        dataAccess.push(PublicRole)
      }
    }

    return dataAccess
  }

  systemAccess(): Model<any, any, any, any, any> {
    return this.model
  }
}
