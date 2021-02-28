/* @flow */

import Regexp from 'path-to-regexp'
import { cleanPath } from './util/path'
import { assert, warn } from './util/warn'

// 这个函数有两种用法：
// (1) 只传递 routes，此时会根据传递进来的 routes 生成 { pathList,pathMap,nameMap }
// (2) 当四个参数都传递了的话，会在传递进来的 pathList,pathMap,nameMap 上添加根据 routes 生成的新的 pathList,pathMap,nameMap

// 该函数的返回值是 { pathList,pathMap,nameMap }，具体作用是：
// (1) pathList: 我们知道 Vue Router 中的路由匹配机制是有优先级的，即当一个路径有多个路由都匹配的话，哪个路由定义在前面，就用哪个路由，这个 pathList 就是用来处理这件事的
// (2) pathMap: 路由路径与路由记录的映射表，表示一个 path 到 RouteRecord 的映射关系
// (3) nameMap: 路由名称与路由记录的映射表，表示 name 到 RouteRecord 的映射关系
export function createRouteMap (
  // 用户自定义的路由配置数组
  routes: Array<RouteConfig>,
  oldPathList?: Array<string>,
  oldPathMap?: Dictionary<RouteRecord>,
  oldNameMap?: Dictionary<RouteRecord>
): {
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>
} {
  const pathList: Array<string> = oldPathList || []
  // $flow-disable-line
  const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)
  // $flow-disable-line
  const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)

  // 对路由配置数组进行遍历
  routes.forEach(route => {
    // 对路由配置数组中的每个路由执行 addRouteRecord 函数，
    // 该函数的作用是将这个 route 转换成符合要求的形式，然后添加到 pathList,pathMap,nameMap 中
    addRouteRecord(pathList, pathMap, nameMap, route)
  })

  // 确保 * 路由在 pathList 的结尾
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
    }
  }

  if (process.env.NODE_ENV === 'development') {
    // 如果非通配符路由（*）的路由路径（path）的第一个字符不是 / 的话，则发出警报
    const found = pathList
      .filter(path => path && path.charAt(0) !== '*' && path.charAt(0) !== '/')

    if (found.length > 0) {
      const pathNames = found.map(path => `- ${path}`).join('\n')
      warn(false, `Non-nested routes must include a leading slash character. Fix the following routes: \n${pathNames}`)
    }
  }

  // 返回
  return {
    pathList,
    pathMap,
    nameMap
  }
}

// 向 pathList 中添加 path，向 pathMap 和 nameMap 中添加路由记录的函数
function addRouteRecord (
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>,
  route: RouteConfig,
  parent?: RouteRecord,
  // matchAs 属性是为别名路由所服务的
  matchAs?: string
) {
  // 获取该路由配置的 path 和 name
  const { path, name } = route
  // 在开发环境下，如果用户自定义的路由配置不规范的话，抛出错误。
  if (process.env.NODE_ENV !== 'production') {
    // 路由配置中的 path 是必填项，如果用户没有配置的话，抛出错误
    assert(path != null, `"path" is required in a route configuration.`)
    // 路由配置中的 component 不能是一个字符串，其必须是实际的组件对象
    assert(
      typeof route.component !== 'string',
      `route config "component" for path: ${String(
        path || name
      )} cannot be a ` + `string id. Use an actual component instead.`
    )

    warn(
      // eslint-disable-next-line no-control-regex
      !/[^\u0000-\u007F]+/.test(path),
      `Route with path "${path}" contains unencoded characters, make sure ` +
        `your path is correctly encoded before passing it to the router. Use ` +
        `encodeURI to encode static segments of your path.`
    )
  }

  // 官网中与 pathToRegexpOptions 有关的部分在：https://router.vuejs.org/zh/api/#routes
  // 这个配置是 Path-to-RegExp 库中的 options，
  // 这个库的具体用法可以看我的另一篇博客：https://fei_fei27.gitee.io/third-party-library/path-to-regexp.html#安装
  // type PathToRegexpOptions = {
  //   sensitive?: boolean,
  //   strict?: boolean,
  //   end?: boolean
  // }
  const pathToRegexpOptions: PathToRegexpOptions =
    route.pathToRegexpOptions || {}

  // normalizePath 函数的作用是：将该路由的 path 与父路由的 path 拼接起来，得到完整的 path
  const normalizedPath = normalizePath(path, parent, pathToRegexpOptions.strict)

  // caseSensitive 配置的作用是：设置匹配规则是否大小写敏感
  if (typeof route.caseSensitive === 'boolean') {
    // 如果用户设置了 caseSensitive 配置的话，将这个值设置到 pathToRegexpOptions 对象中，
    // pathToRegexpOptions 对象保存所有与正则有关的选项
    pathToRegexpOptions.sensitive = route.caseSensitive
  }

  // 构造路由记录对象
  const record: RouteRecord = {
    path: normalizedPath,
    // compileRouteRegex 函数的作用是：借助 Path-to-RegExp 库中的 Regexp 生成路由路径的正则表达式
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions),
    // 这一行对命名视图的情况进行统一化的处理。
    // 无论是一个 route 对应一个组件，还是一个 route 对应多个组件，在这里统一处理成 { default:xxx, foo:xxx, bar:xxx }
    components: route.components || { default: route.component },
    instances: {},
    enteredCbs: {},
    // 当前路由的别名
    name,
    // 当前路由的父路由记录
    parent,
    matchAs,
    // 当前路由的重定向
    redirect: route.redirect,
    // 当前路由的守卫
    beforeEnter: route.beforeEnter,
    // 路由元信息
    meta: route.meta || {},
    // 路由到组件的传参：https://router.vuejs.org/zh/guide/essentials/passing-props.html
    props:
      route.props == null
        ? {}
        : route.components
          ? route.props
          : { default: route.props }
  }

  // 如果当前的路由有子路由的话
  if (route.children) {
    // Warn if route is named, does not redirect and has a default child route.
    // If users navigate to this route by name, the default child will
    // not be rendered (GH Issue #629)
    if (process.env.NODE_ENV !== 'production') {
      if (
        route.name &&
        !route.redirect &&
        route.children.some(child => /^\/?$/.test(child.path))
      ) {
        warn(
          false,
          `Named Route '${route.name}' has a default child route. ` +
            `When navigating to this named route (:to="{name: '${
              route.name
            }'"), ` +
            `the default child route will not be rendered. Remove the name from ` +
            `this route and use the name of the default child route for named ` +
            `links instead.`
        )
      }
    }
    // 对子路由进行遍历
    route.children.forEach(child => {
      // 这个 childMatchAs 属性是为别名路由的子路由服务的
      const childMatchAs = matchAs
        ? cleanPath(`${matchAs}/${child.path}`)
        : undefined
      // 递归调用 addRouteRecord 方法，添加该子路由的路由记录
      addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
    })
  }

  // 如果当前路由记录的 path 属性在 pathMap 中不存在的话，则将其添加到 pathList 中，将路由记录添加到 pathMap 中。
  if (!pathMap[record.path]) {
    pathList.push(record.path)
    pathMap[record.path] = record
  }

  // 下面是对路由别名的处理。
  if (route.alias !== undefined) {
    // 一个路由可以有多个别名，也就是一个字符串数组。在这里，即使别名只有一个（单个的字符串），也将其转换为数组，进行统一化的处理
    const aliases = Array.isArray(route.alias) ? route.alias : [route.alias]
    // 遍历数组
    for (let i = 0; i < aliases.length; ++i) {
      // 获取当前循环的别名
      const alias = aliases[i]
      // 在开发环境下，如果这个别名和路由的路径（path），是一样的值的话，发出警告，并跳过这个别名
      if (process.env.NODE_ENV !== 'production' && alias === path) {
        warn(
          false,
          `Found an alias with the same value as the path: "${path}".
          You have to remove that alias. It will be ignored in development.`
        )
        // skip in dev to make it work
        continue
      }

      // 构建别名路由，我们可以看到路由的别名在库的内部其实还是作为 path 进行处理的。
      const aliasRoute = {
        path: alias,
        children: route.children
      }
      // 将别名路由通过 addRouteRecord 添加到 pathList、pathMap 和 nameMap 中。
      // 别名路由是没有 component 属性的，也就是无法通过 component 属性获取到要渲染的组件
      // 那么怎么获取要渲染的组件的呢？
      // 答案就在 addRouteRecord 函数的 matchAs 参数上，这个参数指定了另一个路径，通过这个路径可以找到要渲染的组件
      addRouteRecord(
        pathList,
        pathMap,
        nameMap,
        aliasRoute,
        parent,
        record.path || '/' // matchAs
      )
    }
  }

  // 如果当前的路由有其他命名（name）的话，将 record 添加到 nameMap 中
  // 命名路由是没有嵌套的概念的，这个命名直接指定一个路由，不管这个路由嵌套的深浅
  // 当跳转的目标是一个命名（name）时，库的内部就是利用 nameMap 找到目标路由记录的，然后再借助路由记录找到要渲染的组件。
  if (name) {
    if (!nameMap[name]) {
      nameMap[name] = record
    } else if (process.env.NODE_ENV !== 'production' && !matchAs) {
      warn(
        false,
        `Duplicate named routes definition: ` +
          `{ name: "${name}", path: "${record.path}" }`
      )
    }
  }
}

// compileRouteRegex 函数的作用是：借助 Path-to-RegExp 库中的 Regexp 生成路由路径的正则表达式
function compileRouteRegex (
  path: string,
  pathToRegexpOptions: PathToRegexpOptions
): RouteRegExp {
  // Regexp 是 path-to-regexp 库中的，这个库的作用是：生成一个路径字符串，例如："/user/:name" 的正则表达式
  const regex = Regexp(path, [], pathToRegexpOptions)
  // 如果当前是开发环境的话，执行下面的检测，防止一个路径中出现重复的参数
  if (process.env.NODE_ENV !== 'production') {
    // 生成空的对象
    const keys: any = Object.create(null)
    // 对路径中的参数 (例如：/:name/:age/:sex 中的参数就是 name、age、sex) 进行遍历
    regex.keys.forEach(key => {
      // 如果 keys 对象中已经有了这个参数的话，此时说明一个路由路径中有多个相同的参数，这是不被允许的，在此发出警告
      warn(
        !keys[key.name],
        `Duplicate param keys in route with path: "${path}"`
      )
      // 将当前的参数设置到 keys 中
      keys[key.name] = true
    })
  }
  return regex
}


// normalizePath 函数的作用是：将该路由的 path 与父路由的 path 拼接起来，得到完整的 path
function normalizePath (
  path: string,
  parent?: RouteRecord,
  strict?: boolean
): string {
  // 如果 pathToRegexpOptions 中的 strict 配置为 false，且 path 以 '/' 结尾的话，将其删除。
  if (!strict) path = path.replace(/\/$/, '')
  // 如果 path 的第一个字符是 '/' 的话，说明这一个 path 所对应的路由是最顶级的路由，此时直接 return path 就可以了。
  if (path[0] === '/') return path
  // 如果这一个 path 所对应的路由没有父路由的话，说明该路由是最顶级的路由，此时直接 return path 就可以了。
  if (parent == null) return path
  // 代码运行到这，说明此 path 对应的路由是嵌套的子路由，此时就需要将其与父路由的 path 拼接起来 `${parent.path}/${path}`
  // cleanPath 函数的作用是将连续重复的 '/' 替换成单独的 '/'，例如："/foo//bar" --> "/foo/bar"
  return cleanPath(`${parent.path}/${path}`)
}
