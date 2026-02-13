import { NO_CONFIGURATION, getMainDomain, getReqOrigin } from '@/utils'
import AppConfig from '@/models/appConfig/appConfig'
import { Request } from 'express'
import config from '@/config'

async function businessConfiguration(req: Request, obj: 'pool' | 'referral', getCache = true) {
  const host = getMainDomain(getReqOrigin(req))
  // host = 'crowmie.com'
  let data: any
  if (getCache) {
    data = await AppConfig.findOne({ hostDomain: host }).lean().cache(config.cache.time)
  } else {
    data = await AppConfig.findOne({ hostDomain: host }).lean()
  }
  if (data[obj]) return data[obj]
  throw NO_CONFIGURATION
}

export { businessConfiguration }
