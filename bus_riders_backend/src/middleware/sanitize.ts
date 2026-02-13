'use strict'
import { Response, NextFunction } from 'express'
import { has } from 'lodash'

const TEST_REGEX_WITHOUT_DOT = /^\$/
const REPLACE_REGEX = /^\$|\./g
const TEST_REGEX = /^\$|\./

interface Options {
  replaceWith?: string
  dryRun?: boolean
  allowDots?: boolean
  maxDepth?: number
}

function isPlainObject(obj: object) {
  return typeof obj === 'object' && obj !== null
}

function getTestRegex(allowDots: any) {
  return allowDots ? TEST_REGEX_WITHOUT_DOT : TEST_REGEX
}

function withEach(target: any, maxDepth = Infinity, cb: any) {
  ;(function act(obj: any, depth = 0) {
    if (depth > maxDepth) return

    if (Array.isArray(obj)) {
      obj.forEach((item) => act(item, depth + 1))
    } else if (isPlainObject(obj)) {
      Object.keys(obj).forEach(function (key) {
        const val = obj[key]
        const resp = cb(obj, val, key)
        if (resp.shouldRecurse) {
          act(obj[resp.key || key], depth + 1)
        }
      })
    }
  })(target)
}

function _sanitize(target: any, options: Options) {
  const regex = getTestRegex(options?.allowDots)
  let isSanitized = false
  let replaceWith: any = null
  if (!regex.test(options?.replaceWith || '') && options.replaceWith !== '.') {
    replaceWith = options.replaceWith || ' '
  }

  withEach(target, options?.maxDepth || 10, function (obj: any, val: any, key: string) {
    let shouldRecurse = true
    if (regex.test(key)) {
      isSanitized = true
      delete obj[key]
      if (replaceWith) {
        key = key.replace(REPLACE_REGEX, replaceWith)
        if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
          obj[key] = val
        }
      } else {
        shouldRecurse = false
      }
    }

    return {
      shouldRecurse,
      key,
    }
  })

  return {
    isSanitized,
    target,
  }
}

/**
 * @param {{replaceWith?: string, onSanitize?: function, dryRun?: boolean}} options
 * @returns {function}
 */
function sanitizeMiddleware(options: Options) {
  return function (req: any, res: Response, next: NextFunction) {
    ;['body', 'params', 'query'].forEach(function (key: string) {
      if (has(req, key)) {
        const { target, isSanitized } = _sanitize(req[key], options)
        req[key] = target
      }
    })
    next()
  }
}

export { sanitizeMiddleware }
