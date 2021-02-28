/* @flow */

import { install } from './install'
import { START } from './util/route'
import { assert } from './util/warn'
import { inBrowser } from './util/dom'
import { cleanPath } from './util/path'
import { createMatcher } from './create-matcher'
import { normalizeLocation } from './util/location'
import { supportsPushState } from './util/push-state'
import { handleScroll } from './util/scroll'

import { HashHistory } from './history/hash'
import { HTML5History } from './history/html5'
import { AbstractHistory } from './history/abstract'

import type { Matcher } from './create-matcher'

import { isNavigationFailure, NavigationFailureType } from './util/errors'

// 导出 VueRouter 对象
export default class VueRouter {
  // 这四个字段是在类定义之外添加的字段，看该文件的最后几行，使用 VueRouter.xxxx = xxxx 对这四个字段进行了赋值。
  // Flow 的语法要求：在类定义之外添加的字段需要在类体内加注释。
  static install: () => void
  static version: string
  static isNavigationFailure: Function
  static NavigationFailureType: any

  // 下面这些属性是 VueRouter 类中的属性
  // Flow 的语法要求：类中的属性必须先给类型注释，具体介绍看：https://fei_fei27.gitee.io/flow/types/class-type.html#类中的属性
  app: any
  apps: Array<any>
  ready: boolean
  readyCbs: Array<Function>
  options: RouterOptions
  mode: string
  history: HashHistory | HTML5History | AbstractHistory
  matcher: Matcher
  fallback: boolean
  beforeHooks: Array<?NavigationGuard>
  resolveHooks: Array<?NavigationGuard>
  afterHooks: Array<?AfterNavigationHook>

  // 第一部分的初始化代码，在我们 new VueRouter({}) 时调用
  // 还有一部分的初始化代码在 init() 函数中，这个函数在根组件的 beforeCreate() 阶段调用，
  // 具体看 install.js --> Vue.mixin() --> beforeCreate() --> if (isDef(this.$options.router)){}
  constructor (options: RouterOptions = {}) {
    // 先对一些属性进行初始化
    this.app = null
    this.apps = []
    this.options = options
    this.beforeHooks = []
    this.resolveHooks = []
    this.afterHooks = []
    // 创建匹配器，我们到 create-matcher.js 文件中看看具体的代码
    // matcher 的类型是：
    // type Matcher = {
    //   match: (raw: RawLocation, current?: Route, redirectedFrom?: Location) => Route;
    //   addRoutes: (routes: Array<RouteConfig>) => void;
    // }
    this.matcher = createMatcher(options.routes || [], this)

    // 设置 VueRouter 的模式。一共支持 'hash','history' 和 'abstract' 三种模式
    // 使用 || 逻辑运算符可以达到一种默认值的效果，如果用户没有在配置对象中传递 mode 配置的话，整个库就默认使用 'hash' 模式
    let mode = options.mode || 'hash'
    // 官网中有关 fallback 配置的介绍：https://router.vuejs.org/zh/api/#fallback
    // 作用是当浏览器不支持 history.pushState 的话，路由模式是否回退到 hash 模式，下面几行就是这一功能的具体实现
    this.fallback =
      // 只有当用户设置的路由模式是 history，浏览器不支持 history.pushState API 以及用户配置的 fallback == true 的时候，this.fallback 的值才为 true。
      // 因为我们知道 fallback 是用于在浏览器不支持 history.pushState 的时候，判断路由模式是否回退到 hash 模式时使用的变量，
      // 所以只有在 mode === 'history'、!supportsPushState 以及 options.fallback !== false 都为 true 的情况下，this.fallback 的值为 true 才有意义。
      mode === 'history' && !supportsPushState && options.fallback !== false
    if (this.fallback) {
      // 如果 this.fallback 的值为 true 的话，将路由模式回退到 hash 模式
      mode = 'hash'
    }
    // 如果 js 环境不是浏览器的话，直接将路由模式设为 abstract
    if (!inBrowser) {
      mode = 'abstract'
    }
    // 将计算出的最终路由模式设置到 this.mode
    this.mode = mode
    // 上面一大段的具体作用是：
    // (1) 如果运行环境不是浏览器的话，路由模式强制为 abstract
    // (2) 在浏览器环境下，路由模式默认为 hash
    // (3) 在用户设置的 mode 是 history 的情况下，如果浏览器不支持 history.pushState API 的话，依旧将路由模式设置为 hash

    // 依据计算出的路由模式，实例化具体的 history 对象，并将其设置到 this.history 上。
    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base)
        break
      case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback)
        break
      case 'abstract':
        this.history = new AbstractHistory(this, options.base)
        break
      default:
        // 如果 mode 不是上面三种模式之一的话，在开发模式下，发出警报。
        if (process.env.NODE_ENV !== 'production') {
          assert(false, `invalid mode: ${mode}`)
        }
    }
    // 第一部分的初始化代码到这里就读完了，接下来看第二部分的初始化代码，看 init() 函数
  }

  // 第二部分的初始化代码，在根组件的 beforeCreate() 阶段调用
  // 具体调用的表达式是 this._router.init(this); 这个 this 是根 Vue 组件的实例。
  init (app: any /* Vue component instance */) {
    // && 逻辑运算符的作用是：只有该逻辑运算符前面的表达式为 true，才会执行 && 逻辑运算符后面的表达式，能够达到 if(){} 的效果。
    // 如果当前是开发模式的话，判断用户有没有调用 Vue.use(VueRouter)，没有调用的话，发出警告
    process.env.NODE_ENV !== 'production' &&
    assert(
      install.installed,
      `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
      `before creating root instance.`
    )

    // 这一段代码会将该 VueRouter 对象所挂载的所有 Vue 实例 push 到 this.apps 数组中。
    // 不过一般我们只会将 VueRouter 对象挂载到 Vue 根组件实例上
    this.apps.push(app)

    // set up app destroyed handler
    // https://github.com/vuejs/vue-router/issues/2639
    // Vue 的 $once 方法用于监听一个自定义事件，但是只会触发一次，一旦触发之后，监听器就会被移除
    app.$once('hook:destroyed', () => {
      // 当这个 app 实例销毁的时候，将其从 this.apps 中移除掉
      const index = this.apps.indexOf(app)
      if (index > -1) this.apps.splice(index, 1)
      // 如果这个移除的 app 是当前 VueRouter 中的 this.app 的话，则为 this.app 设置新的 app，新设置的值可以是新的 app 或者 null。
      if (this.app === app) this.app = this.apps[0] || null
      // 如果 this.app == null 的话，执行 history 的 teardown 函数，这个函数的作用是清理监听器以及重置 history 中的一些变量。
      if (!this.app) this.history.teardown()
    })

    // 如果 this.app 不为空的话，说明我们已经给 history 设置了监听器，就没有必要在设置一次了，在这里直接 return
    if (this.app) {
      return
    }

    // 下面的代码只有 VueRouter 对象第一个挂载的 Vue 实例对象的 beforeCreate 阶段才会执行到这，一般是我们项目中的根 Vue 组件。
    // 将第一个挂载 VueRouter 对象的 Vue 组件设置到 this.app
    this.app = app

    // 取出 VueRouter 实例的 history 变量，这个 history 很重要。
    const history = this.history

    // 如果 history 是通过实例化 HTML5History 以及 HashHistory 而来的话，则执行 history 中的 transitionTo 方法
    if (history instanceof HTML5History || history instanceof HashHistory) {
      const handleInitialScroll = routeOrError => {
        const from = history.current
        const expectScroll = this.options.scrollBehavior
        const supportsScroll = supportsPushState && expectScroll

        if (supportsScroll && 'fullPath' in routeOrError) {
          handleScroll(this, routeOrError, from, false)
        }
      }

      const setupListeners = routeOrError => {
        history.setupListeners()
        handleInitialScroll(routeOrError)
      }

      // transitionTo 函数是与路由切换有关的函数，history 中的 push() 和 replace() 函数内部都会调用这个方法
      // 在这里调用的目的，是因为 VueRouter 刚刚启动，需要渲染初始路径对应的组件到 RouterLink 组件中
      history.transitionTo(
        // 获取当前 url 中的路径部分，该字段的类型是 RawLocation
        history.getCurrentLocation(),
        // 路由切换成功的函数
        setupListeners,
        // 路由切换失败的函数
        setupListeners
        // 上面成功和失败的函数都是 setupListeners 函数，也就是说无论如何 setupListeners 函数都会执行
      )
    }

    // history.listen 函数的作用是将传递进来的回调函数赋值到 history 对象的 cb 属性上，这个函数的作用很简单，
    // 关键的是这个回调函数的作用是什么，我们可以看到这个函数的参数是 route，函数体的作用是将这个 router 赋值到 apps 中所有 app 的 _route 属性上，
    // 而通过 install.js 中的代码可知，这个 _route 属性是响应式的，而 RouterView 组件的渲染是依赖于 _route 属性的，
    // 由此，我们得知了这个回调函数的作用：当我们调用 history 中的 push() 和 replace() 进行路由的导航时，Vue Router 的内部会调用这个回调函数，
    // 这个回调函数会更新所有 app 中的 _route 属性，进而导致视图的更新。
    // push()、replace() --> cb(route) --> app._route = new_route --> 视图的更新渲染
    history.listen(route => {
      this.apps.forEach(app => {
        app._route = route
      })
    })
  }

  match (raw: RawLocation, current?: Route, redirectedFrom?: Location): Route {
    return this.matcher.match(raw, current, redirectedFrom)
  }

  // 获取当前的路由
  get currentRoute (): ?Route {
    return this.history && this.history.current
  }

  beforeEach (fn: Function): Function {
    return registerHook(this.beforeHooks, fn)
  }

  beforeResolve (fn: Function): Function {
    return registerHook(this.resolveHooks, fn)
  }

  afterEach (fn: Function): Function {
    return registerHook(this.afterHooks, fn)
  }

  onReady (cb: Function, errorCb?: Function) {
    this.history.onReady(cb, errorCb)
  }

  onError (errorCb: Function) {
    this.history.onError(errorCb)
  }

  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.push(location, resolve, reject)
      })
    } else {
      this.history.push(location, onComplete, onAbort)
    }
  }

  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.replace(location, resolve, reject)
      })
    } else {
      this.history.replace(location, onComplete, onAbort)
    }
  }

  go (n: number) {
    this.history.go(n)
  }

  back () {
    this.go(-1)
  }

  forward () {
    this.go(1)
  }

  getMatchedComponents (to?: RawLocation | Route): Array<any> {
    const route: any = to
      ? to.matched
        ? to
        : this.resolve(to).route
      : this.currentRoute
    if (!route) {
      return []
    }
    return [].concat.apply(
      [],
      route.matched.map(m => {
        return Object.keys(m.components).map(key => {
          return m.components[key]
        })
      })
    )
  }

  resolve (
    to: RawLocation,
    current?: Route,
    append?: boolean
  ): {
    location: Location,
    route: Route,
    href: string,
    // for backwards compat
    normalizedTo: Location,
    resolved: Route
  } {
    // 获取当前的路由
    current = current || this.history.current
    // normalizeLocation 函数的作用是获取标准化的 Location，该函数的具体解析到 location.js 文件中进行查看
    const location = normalizeLocation(to, current, append, this)
    // 获取匹配的 Route
    const route = this.match(location, current)
    // 获取 Route 的完整路径
    const fullPath = route.redirectedFrom || route.fullPath
    // 获取用户设置的基路径，例如：/app/。这一部分对应的官网：https://router.vuejs.org/zh/api/#base
    const base = this.history.base
    // 生成完整的链接
    const href = createHref(base, fullPath, this.mode)
    // 返回解析的对象
    return {
      location,
      route,
      href,
      // for backwards compat
      normalizedTo: location,
      resolved: route
    }
  }

  addRoutes (routes: Array<RouteConfig>) {
    this.matcher.addRoutes(routes)
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation())
    }
  }
}

function registerHook (list: Array<any>, fn: Function): Function {
  list.push(fn)
  return () => {
    const i = list.indexOf(fn)
    if (i > -1) list.splice(i, 1)
  }
}

// 该函数的作用是生成完整的链接
function createHref (base: string, fullPath: string, mode) {
  // 如果路由模式是 hash 的话，将 fullPath 拼接在 '#' 的后面，例如：#/foo/bar
  var path = mode === 'hash' ? '#' + fullPath : fullPath
  // 如果用户设置了 base 的话，将其设置在 path 的前面，例如：/app/#/foo/bar
  return base ? cleanPath(base + '/' + path) : path
}

// 由于 Vue Router 是 Vue 的框架，所以需要给 VueRouter 对象添加 install 方法，这个方法会执行 Vue Router 的安装操作。
VueRouter.install = install
// Rollup 构建工具会将 '__VERSION__' 字符串替换成版本号
VueRouter.version = '__VERSION__'
// 为 VueRouter 全局对象添加 isNavigationFailure 和 NavigationFailureType
// 这两个属性是用于检测路由故障的。对应官网的：https://router.vuejs.org/zh/guide/advanced/navigation-failures.html
VueRouter.isNavigationFailure = isNavigationFailure
VueRouter.NavigationFailureType = NavigationFailureType

// 判断是不是在浏览器环境下以及 window 全局对象中有没有 Vue 属性，如果有的话，就使用 Vue.use() 安装 VueRouter。
// 这样在全局引用的情况下，用户就不需要 Vue.use(VueRouter) 了。
// 对应官网中的：https://router.vuejs.org/zh/installation.html --> 直接下载 / CDN
if (inBrowser && window.Vue) {
  window.Vue.use(VueRouter)
}
