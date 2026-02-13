import type { Request, Response, NextFunction } from 'express'
import Logs, { AppLogsType } from '@/models/appConfig/Logs'
import { randomUUID } from 'crypto'
import { isProd } from '@/utils'
import morgan from 'morgan'

const redact = (val: any, keys: string[]) => {
  if (!val || typeof val !== 'object') return val
  const clone = Array.isArray(val) ? [...val] : { ...val }
  for (const k of Object.keys(clone)) {
    const lower = k.toLowerCase()
    if (keys.includes(lower)) clone[k] = '[REDACTED]'
    else if (typeof clone[k] === 'object') clone[k] = redact(clone[k], keys)
  }
  return clone
}

const safeBody = (body: any) => {
  try {
    return JSON.parse(JSON.stringify(body))
  } catch {
    return '[unserializable]'
  }
}

export function Logging() {
  if (isProd) {
    return async function (req: Request, res: Response, next: NextFunction) {
      const captureResponseBody = true
      const redactKeys = ['password', 'authorization', 'token', 'cookie', 'set-cookie']

      const reqId = String(randomUUID())
      ;(req as any).id = reqId
      ;(res.locals as any).requestId = reqId

      const startHr = BigInt(process.hrtime.bigint())
      const cpuStart = process.cpuUsage()
      const memStart = process.memoryUsage()

      // console.log('🚀 ~ req.metho:', req.ip, req.method, req.originalUrl || req.url, req.get('origin') || (req.headers.origin as string | undefined))

      const toStoreStart: any = {
        requestId: reqId,
        method: req.method,
        url: req.originalUrl || req.url,
        origin: req.get('origin') || (req.headers.origin as string | undefined),
        req_ip: req.ip,
        cpuUsageStartUser: cpuStart.user,
        cpuUsageStartSystem: cpuStart.system,
        memoryHeapTotalStart: memStart.heapTotal,
        memoryHeapUsedStart: memStart.heapUsed,
        memoryRssStart: memStart.rss,

        data: req.body ? redact(safeBody(req.body), redactKeys) : undefined,
        query: req.query ? redact(safeBody(req.query), redactKeys) : undefined,
        param: req.params ? redact(safeBody(req.params), redactKeys) : undefined,
        headers: redact(
          {
            ...req.headers,
          },
          redactKeys,
        ),
        startAt: new Date(),
      }

      // await Logs.create(toStoreStart as AppLogsType)

      let responseBody: any
      if (captureResponseBody && req.method != 'GET') {
        const origJson = res.json.bind(res)
        const origSend = res.send.bind(res)

        res.json = (body: any) => {
          responseBody = body
          return origJson(body)
        }

        res.send = (body: any) => {
          responseBody = body
          return origSend(body)
        }
      }

      const finalize = async () => {
        const endHr = BigInt(process.hrtime.bigint())
        const ms = Number(endHr - startHr) / 1e6

        const cpuEnd = process.cpuUsage(cpuStart) // diff since start
        const memEnd = process.memoryUsage()
        const payload: any = {
          ...toStoreStart,
          userId: (req as any).user?._id,
          requestId: reqId,
          timeTaken: ms,
          cpuUsageEndUser: cpuEnd.user, // microseconds used during the request
          cpuUsageEndSystem: cpuEnd.system,
          memoryHeapTotalEnd: memEnd.heapTotal,
          memoryHeapUsedEnd: memEnd.heapUsed,
          memoryRssEnd: memEnd.rss,
          responseCode: res.statusCode,
          responseData: captureResponseBody && responseBody ? safeBody(responseBody) : undefined,
          endAt: new Date(),
        }
        if (res.statusCode >= 400) {
          try {
            await Logs.create([payload as AppLogsType])
          } catch (error) {
            console.log('🚀 ~ finalize ~ error:', error)
          }
        }
      }

      res.on('finish', () => finalize())

      next()
    }
  } else {
    return morgan('dev')
  }
}
