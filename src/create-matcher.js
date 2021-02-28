/* @flow */

import type VueRouter from './index'
import { resolvePath } from './util/path'
import { assert, warn } from './util/warn'
import { createRoute } from './util/route'
import { fillParams } from './util/params'
import { createRouteMap } from './create-route-map'
import { normalizeLocation } from './util/location'
import { decode } from './util/query'

// 匹配器类型
export type Matcher = {
  match: (raw: RawLocation, current?: Route, redirectedFrom?: Location) => Route;
  addRoutes: (routes: Array<RouteConfig>) => void;
};

export function createMatcher (
  // routes 是用户定义的路由配置数组
  routes: Array<RouteConfig>,
  // router 是 new VueRouter 返回的实例
  router: VueRouter
): Matcher {
  // 创建路由（routes）的 pathList、pathMap 和 nameMap，传递的参数是用户定义的路由配置数组，我们到 create-router-map.js 文件中查看具体的代码
  // 这里的 pathList、pathMap 和 nameMap 借助了 JavaScript 中的闭包知识
  const { pathList, pathMap, nameMap } = createRouteMap(routes)

  // 创建 addRoutes 函数，这个函数是 createMatcher 函数返回对象的一部分
  // 外部通过调用这个函数，能够向 createMatcher 函数作用域中的 pathList、pathMap 和 nameMap 添加新的路由记录
  function addRoutes (routes) {
    createRouteMap(routes, pathList, pathMap, nameMap)
  }

  // 创建 match 函数，这个函数是 createMatcher 函数返回对象的一部分
  // 外部能够通过调用这个函数匹配用户传递的路由，函数内部利用 pathList、pathMap 和 nameMap 生成了 Route 对象
  function match (
    // type RawLocation = string | Location
    raw: RawLocation,
    // 当前的路由
    currentRoute?: Route,
    redirectedFrom?: Location
  ): Route {
    // 标准化 Location
    // type Location = {
    //   _normalized?: boolean;
    //   name?: string;
    //   path?: string;
    //   hash?: string;
    //   query?: Dictionary<string>;
    //   params?: Dictionary<string>;
    //   append?: boolean;
    //   replace?: boolean;
    // }
    const location = normalizeLocation(raw, currentRoute, false, router)
    // 获取导航的命名
    const { name } = location

    // 如果命名存在的话
    if (name) {
      // 借助命名从 nameMap 中获取到路由记录
      const record = nameMap[name]
      // 如果不存在这个命名的路有记录的话，发出警告 —— 没有这个命名的路由
      if (process.env.NODE_ENV !== 'production') {
        warn(record, `Route with name '${name}' does not exist`)
      }
      // 如果不存在这个路由记录的话，在这里直接 return _createRoute(null, location)
      // _createRoute 函数的作用是：生成 Route 对象
      if (!record) return _createRoute(null, location)
      // 获取路由记录中的 keys --> name
      // 例如路由记录中的 path 是 /:name/:age，那么 paramNames == ['name'，'age']
      const paramNames = record.regex.keys
        .filter(key => !key.optional)
        .map(key => key.name)

      if (typeof location.params !== 'object') {
        location.params = {}
      }

      if (currentRoute && typeof currentRoute.params === 'object') {
        for (const key in currentRoute.params) {
          if (!(key in location.params) && paramNames.indexOf(key) > -1) {
            location.params[key] = currentRoute.params[key]
          }
        }
      }

      location.path = fillParams(record.path, location.params, `named route "${name}"`)
      return _createRoute(record, location, redirectedFrom)
    } else if (location.path) {
      location.params = {}
      for (let i = 0; i < pathList.length; i++) {
        const path = pathList[i]
        const record = pathMap[path]
        if (matchRoute(record.regex, location.path, location.params)) {
          return _createRoute(record, location, redirectedFrom)
        }
      }
    }
    // no match
    return _createRoute(null, location)
  }

  // https://router.vuejs.org/zh/guide/essentials/redirect-and-alias.html
  // 用于处理重定向
  function redirect (
    record: RouteRecord,
    location: Location
  ): Route {
    const originalRedirect = record.redirect
    let redirect = typeof originalRedirect === 'function'
      ? originalRedirect(createRoute(record, location, null, router))
      : originalRedirect

    if (typeof redirect === 'string') {
      redirect = { path: redirect }
    }

    if (!redirect || typeof redirect !== 'object') {
      if (process.env.NODE_ENV !== 'production') {
        warn(
          false, `invalid redirect option: ${JSON.stringify(redirect)}`
        )
      }
      return _createRoute(null, location)
    }

    const re: Object = redirect
    const { name, path } = re
    let { query, hash, params } = location
    query = re.hasOwnProperty('query') ? re.query : query
    hash = re.hasOwnProperty('hash') ? re.hash : hash
    params = re.hasOwnProperty('params') ? re.params : params

    if (name) {
      // resolved named direct
      const targetRecord = nameMap[name]
      if (process.env.NODE_ENV !== 'production') {
        assert(targetRecord, `redirect failed: named route "${name}" not found.`)
      }
      return match({
        _normalized: true,
        name,
        query,
        hash,
        params
      }, undefined, location)
    } else if (path) {
      // 1. resolve relative redirect
      const rawPath = resolveRecordPath(path, record)
      // 2. resolve params
      const resolvedPath = fillParams(rawPath, params, `redirect route with path "${rawPath}"`)
      // 3. rematch with existing query and hash
      return match({
        _normalized: true,
        path: resolvedPath,
        query,
        hash
      }, undefined, location)
    } else {
      if (process.env.NODE_ENV !== 'production') {
        warn(false, `invalid redirect option: ${JSON.stringify(redirect)}`)
      }
      return _createRoute(null, location)
    }
  }

  // https://router.vuejs.org/zh/guide/essentials/redirect-and-alias.html
  // 用于处理别名
  function alias (
    record: RouteRecord,
    location: Location,
    matchAs: string
  ): Route {
    const aliasedPath = fillParams(matchAs, location.params, `aliased route with path "${matchAs}"`)
    const aliasedMatch = match({
      _normalized: true,
      path: aliasedPath
    })
    if (aliasedMatch) {
      const matched = aliasedMatch.matched
      const aliasedRecord = matched[matched.length - 1]
      location.params = aliasedMatch.params
      return _createRoute(aliasedRecord, location)
    }
    return _createRoute(null, location)
  }

  // 生成 Route 对象，这个函数起到一个分发的作用。
  // 如果路由记录是重定向或者别名的话，会先转交给 redirect 和 alias 函数处理，这两个函数处理完后，还是转回 _createRoute 处理。
  // 最终生成 Route 对象在 createRoute 函数中。
  function _createRoute (
    // 路由记录，可以为 null
    record: ?RouteRecord,
    // 类似于 {"_normalized":true,"path":"/","query":{},"hash":""} 的对象
    location: Location,
    redirectedFrom?: Location
  ): Route {
    if (record && record.redirect) {
      return redirect(record, redirectedFrom || location)
    }
    if (record && record.matchAs) {
      return alias(record, location, record.matchAs)
    }
    return createRoute(record, location, redirectedFrom, router)
  }

  // createMatcher() 函数最终返回的对象，包括 addRoutes 和 match 函数
  // addRoutes：解析用户传递的路由配置数组（Array<RouteConfig>），将解析的结果添加到 pathList, pathMap, nameMap 中
  // match：根据传递进来的 raw、currentRoute、redirectedFrom，获得路由应该跳转到的 Route
  return {
    match,
    addRoutes
  }
}

function matchRoute (
  regex: RouteRegExp,
  path: string,
  params: Object
): boolean {
  const m = path.match(regex)

  if (!m) {
    return false
  } else if (!params) {
    return true
  }

  for (let i = 1, len = m.length; i < len; ++i) {
    const key = regex.keys[i - 1]
    if (key) {
      // Fix #1994: using * with props: true generates a param named 0
      params[key.name || 'pathMatch'] = typeof m[i] === 'string' ? decode(m[i]) : m[i]
    }
  }

  return true
}

function resolveRecordPath (path: string, record: RouteRecord): string {
  return resolvePath(path, record.parent ? record.parent.path : '/', true)
}
