/* @flow */

import type VueRouter from '../index'
import { parsePath, resolvePath } from './path'
import { resolveQuery } from './query'
import { fillParams } from './params'
import { warn } from './warn'
import { extend } from './misc'

export function normalizeLocation (
  raw: RawLocation,
  current: ?Route,
  append: ?boolean,
  router: ?VueRouter
): Location {
  // 我们在编写 Vue Router 的导航时，传递的路由既可以是字符串也可以是包含路由信息的对象，
  // 这部分内容可以看编程式的导航：https://router.vuejs.org/zh/guide/essentials/navigation.html
  // 在这里统一处理为对象的形式
  let next: Location = typeof raw === 'string' ? { path: raw } : raw
  if (next._normalized) {
    // 如果 next，也就是传递进来的 raw 已经是标准化过的话，直接 return 这个 next
    return next
  } else if (next.name) {
    // 如果用户传递的是命名路由的话，重新计算 next 的值
    // extend 函数的作用是：将 b 对象中的属性值赋值到 a 中，如果传递的 a 对象是空对象的话，这个函数则有拷贝的效果
    next = extend({}, raw)
    // 获取原始路由对象中的 params 对象
    const params = next.params
    if (params && typeof params === 'object') {
      // 如果用户的确传递了 params 属性的话，则将这个 params 对象拷贝一份，将其赋值给 next 中的 params
      next.params = extend({}, params)
    }
    // 如果传递的是命名路由的话，处理到此为止，return next
    return next
  }

  // 针对相对参数的导航
  if (!next.path && next.params && current) {
    // 将 next 拷贝一份赋值并重新赋值给 next
    next = extend({}, next)
    // 将 _normalized 属性设为 true
    next._normalized = true
    // 将 current 路由的参数和 next 路由中的参数合并起来
    const params: any = extend(extend({}, current.params), next.params)
    if (current.name) {
      // 如果 current 路由有 name 属性的话，
      // 将 name 属性赋值给 next
      // 将 params 参数也赋值给 next
      next.name = current.name
      next.params = params
    } else if (current.matched.length) {
      // 如果 current 路由没有 name 属性但是有匹配的路由记录的话。
      // current.matched 属性是该路由匹配的路由记录（{ matched: Array<RouteRecord> }）
      // 获取最后一个路由记录的 path 属性，这个属性是未经处理的，就像：/foo/bar/:name
      const rawPath = current.matched[current.matched.length - 1].path
      // fillParams 函数的作用是将未处理的路径（例如：/foo/bar/:name）和参数（例如：{ name:"tom" }）拼接成完整的路径（例如：/foo/bar/tom）
      next.path = fillParams(rawPath, params, `path ${current.path}`)
    } else if (process.env.NODE_ENV !== 'production') {
      // 如果上面两个 if 条件都不满足，并且当前的环境是开发环境的话，再次发出警报
      warn(false, `relative params navigation requires a current route.`)
    }
    return next
  }

  // 如果上面条件都不满足的话，执行到这里
  // 下面的代码处理类似于 { path: /foo/bar?name='tom'&age=22 } 这样的导航
  const parsedPath = parsePath(next.path || '')
  // 获取 current 路由的 path
  const basePath = (current && current.path) || '/'
  // append 对应官网：https://router.vuejs.org/zh/api/?#append
  // 如果 parsedPath.path 存在的话，将其和 basePath 拼接起来，否则的话直接返回 basePath
  const path = parsedPath.path
    // 该函数的作用是将基础路径和相对路径拼接起来
    ? resolvePath(parsedPath.path, basePath, append || next.append)
    : basePath

  // resolveQuery 函数的作用是解析并合并 query
  // parsedPath.query 是字符串形式的 query，例如："name=tom&age=20"
  // next.query 是对象形式的 query，例如：{ name:'tom',age:20 }
  const query = resolveQuery(
    parsedPath.query,
    next.query,
    // 这个参数对应官网：https://router.vuejs.org/zh/api/#parsequery-stringifyquery，使用户可以自定义查询字符串解析函数
    router && router.options.parseQuery
  )

  // 处理 hash，优先获取 next 中的 hash，如果 next 中没有 hash 的话，就获取 parsedPath 中的 hash
  let hash = next.hash || parsedPath.hash
  // 如果 hash 的第一个字符不是 # 的话，将 # 符号拼接到 hash 的前面
  if (hash && hash.charAt(0) !== '#') {
    hash = `#${hash}`
  }

  // 返回标准化的 Location 对象，
  // 这个对象中的 _normalized: true 字段标志这个 Location 是经过标准化的，
  // 如果将这个对象再次作为参数传入执行 normalizeLocation 函数，这个函数会直接将其 return（第 22 行代码）
  return {
    _normalized: true,
    path,
    query,
    hash
  }
}
