/* @flow */

import { _Vue } from '../install'
import type Router from '../index'
import { inBrowser } from '../util/dom'
import { runQueue } from '../util/async'
import { warn } from '../util/warn'
import { START, isSameRoute, handleRouteEntered } from '../util/route'
import {
  flatten,
  flatMapComponents,
  resolveAsyncComponents
} from '../util/resolve-components'
import {
  createNavigationDuplicatedError,
  createNavigationCancelledError,
  createNavigationRedirectedError,
  createNavigationAbortedError,
  isError,
  isNavigationFailure,
  NavigationFailureType
} from '../util/errors'

export class History {
  router: Router
  base: string
  current: Route
  pending: ?Route
  cb: (r: Route) => void
  ready: boolean
  readyCbs: Array<Function>
  readyErrorCbs: Array<Function>
  errorCbs: Array<Function>
  listeners: Array<Function>
  cleanupListeners: Function

  // 在属性名前面加上 '+' 符号表示这个属性是只读属性
  // implemented by sub-classes
  +go: (n: number) => void
  +push: (loc: RawLocation, onComplete?: Function, onAbort?: Function) => void
  +replace: (
    loc: RawLocation,
    onComplete?: Function,
    onAbort?: Function
  ) => void
  +ensureURL: (push?: boolean) => void
  +getCurrentLocation: () => string
  +setupListeners: Function

  constructor (router: Router, base: ?string) {
    this.router = router
    this.base = normalizeBase(base)
    // start with a route object that stands for "nowhere"
    this.current = START
    this.pending = null
    this.ready = false
    this.readyCbs = []
    this.readyErrorCbs = []
    this.errorCbs = []
    this.listeners = []
  }

  listen (cb: Function) {
    this.cb = cb
  }

  onReady (cb: Function, errorCb: ?Function) {
    if (this.ready) {
      cb()
    } else {
      this.readyCbs.push(cb)
      if (errorCb) {
        this.readyErrorCbs.push(errorCb)
      }
    }
  }

  onError (errorCb: Function) {
    this.errorCbs.push(errorCb)
  }

  // 与路由切换有关的函数，history 中的 push() 和 replace() 函数内部都会调用这个方法
  transitionTo (
    // 目标路径
    location: RawLocation,
    // 路经切换成功的回调
    onComplete?: Function,
    // 路径切换失败的回调
    onAbort?: Functionx3
  ) {
    let route
    // catch redirect option https://github.com/vuejs/vue-router/issues/3201
    try {
      // 根据目标路径 location 和当前的路由对象通过 this.router.match 方法去匹配到目标 route 对象
      route = this.router.match(location, this.current)
    } catch (e) {
      this.errorCbs.forEach(cb => {
        cb(e)
      })
      // Exception should still be thrown
      throw e
    }
    // 获取当前的路由 route
    const prev = this.current
    // 执行 confirmTransition 方法，该方法进行真正的路由切换
    this.confirmTransition(
      // 目标 Route 作为第一个参数
      route,
      // 成功的回调
      () => {
        // 该函数用于更新 current 属性和 _current
        this.updateRoute(route)
        // 执行传递进来的 onComplete 函数
        onComplete && onComplete(route)
        // 该函数用于确保当前 Route 的路径和当前浏览器位置栏中的路径是相同的，
        // 如果不相同的话，更新浏览器位置栏中路路径
        this.ensureURL()
        // 执行路由切换成功后的钩子函数，this.router.afterHooks 是一个钩子函数数组，在这里遍历执行每个钩子函数
        this.router.afterHooks.forEach(hook => {
          hook && hook(route, prev)
        })

        // fire ready cbs once
        if (!this.ready) {
          this.ready = true
          this.readyCbs.forEach(cb => {
            cb(route)
          })
        }
      },
      // 失败的回调
      err => {
        if (onAbort) {
          // 执行传递进来的 onAbort 函数
          onAbort(err)
        }
        if (err && !this.ready) {
          // Initial redirection should not mark the history as ready yet
          // because it's triggered by the redirection instead
          // https://github.com/vuejs/vue-router/issues/3225
          // https://github.com/vuejs/vue-router/issues/3331
          if (!isNavigationFailure(err, NavigationFailureType.redirected) || prev !== START) {
            this.ready = true
            this.readyErrorCbs.forEach(cb => {
              cb(err)
            })
          }
        }
      }
    )
  }

  // 执行真正的路由切换工作
  confirmTransition (
    route: Route,
    onComplete: Function,
    onAbort?: Function) {
    // 获取当前的 Route
    const current = this.current
    // 设置有可能即将会被导航到的 Route
    this.pending = route
    const abort = err => {
      // changed after adding errors with
      // https://github.com/vuejs/vue-router/pull/3047 before that change,
      // redirect and aborted navigation would produce an err == null
      if (!isNavigationFailure(err) && isError(err)) {
        if (this.errorCbs.length) {
          this.errorCbs.forEach(cb => {
            cb(err)
          })
        } else {
          warn(false, 'uncaught error during route navigation:')
          console.error(err)
        }
      }
      onAbort && onAbort(err)
    }

    // matched 的类型是 Array<RouteRecord>
    // 在这里获取 route.matched 和 current.matched 数组中最后一个元素的下标
    const lastRouteIndex = route.matched.length - 1
    const lastCurrentIndex = current.matched.length - 1
    // 如果当前路由和之前路由相同，直接 return
    if (
      isSameRoute(route, current) &&
      // in the case the route map has been dynamically appended to
      lastRouteIndex === lastCurrentIndex &&
      route.matched[lastRouteIndex] === current.matched[lastCurrentIndex]
    ) {
      this.ensureURL()
      return abort(createNavigationDuplicatedError(current, route))
    }

    // resolveQueue函数的作用：对比当前 Route 和目标 Route 所匹配的路由记录
    // 以此来判断那些组件需要更新，那些组件变成激活状态，那些组件变成非激活状态
    const { updated, deactivated, activated } = resolveQueue(
      this.current.matched,
      route.matched
    )

    // queue 数组用于保存各个守卫的钩子函数
    const queue: Array<?NavigationGuard> = [].concat(
      // leave 的钩子函数
      extractLeaveGuards(deactivated),
      // 全局的 before 的勾子
      this.router.beforeHooks,
      // 组件内的 beforeRouteUpdate
      extractUpdateHooks(updated),
      // 将要更新路由的 beforeEnter勾子
      activated.map(m => m.beforeEnter),
      // async components
      resolveAsyncComponents(activated)
    )

    // 队列执行的iterator函数
    const iterator = (hook: NavigationGuard, next) => {
      if (this.pending !== route) {
        return abort(createNavigationCancelledError(current, route))
      }
      try {
        hook(route, current, (to: any) => {
          if (to === false) {
            // next(false) -> abort navigation, ensure current URL
            this.ensureURL(true)
            abort(createNavigationAbortedError(current, route))
          } else if (isError(to)) {
            this.ensureURL(true)
            abort(to)
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' &&
              (typeof to.path === 'string' || typeof to.name === 'string'))
          ) {
            // next('/') or next({ path: '/' }) -> redirect
            abort(createNavigationRedirectedError(current, route))
            if (typeof to === 'object' && to.replace) {
              this.replace(to)
            } else {
              this.push(to)
            }
          } else {
            // confirm transition and pass on the value
            // 如果有导航钩子，就需要调用next()，否则回调不执行，导航将无法继续
            next(to)
          }
        })
      } catch (e) {
        abort(e)
      }
    }

    // runQueue 执行队列 以一种递归回调的方式来启动异步函数队列的执行
    runQueue(queue, iterator, () => {
      // 组件内的钩子
      const enterGuards = extractEnterGuards(activated)
      const queue = enterGuards.concat(this.router.resolveHooks)
      // 在上次的队列执行完成后再执行组件内的钩子
      runQueue(queue, iterator, () => {
        // 确保代码执行期间还是当前路由
        if (this.pending !== route) {
          return abort(createNavigationCancelledError(current, route))
        }
        this.pending = null
        // before 钩子函数都执行完了，在这里执行 onComplete() 函数，这个函数内部执行了 this.updateRoute(route) 更新 Route
        onComplete(route)
        if (this.router.app) {
          this.router.app.$nextTick(() => {
            handleRouteEntered(route)
          })
        }
      })
    })
  }

  // (1) 更新 history 中的 current 属性
  // (2) 执行 cb() 函数，cb() 函数会更新 install.js 53 行定义的 _route 属性，这个属性是响应式的
  updateRoute (route: Route) {
    this.current = route
    this.cb && this.cb(route)
  }

  setupListeners () {
    // Default implementation is empty
  }

  teardown () {
    // clean up event listeners
    // https://github.com/vuejs/vue-router/issues/2341
    this.listeners.forEach(cleanupListener => {
      cleanupListener()
    })
    this.listeners = []

    // reset current history route
    // https://github.com/vuejs/vue-router/issues/3294
    this.current = START
    this.pending = null
  }
}

function normalizeBase (base: ?string): string {
  if (!base) {
    if (inBrowser) {
      // respect <base> tag
      const baseEl = document.querySelector('base')
      base = (baseEl && baseEl.getAttribute('href')) || '/'
      // strip full URL origin
      base = base.replace(/^https?:\/\/[^\/]+/, '')
    } else {
      base = '/'
    }
  }
  // make sure there's the starting slash
  if (base.charAt(0) !== '/') {
    base = '/' + base
  }
  // remove trailing slash
  return base.replace(/\/$/, '')
}

// resolveQueue函数的作用：对比当前 Route 和目标 Route 所匹配的路由记录
// 以此来判断那些组件需要更新，那些组件不需要更新
function resolveQueue (
  current: Array<RouteRecord>,
  next: Array<RouteRecord>
): {
  updated: Array<RouteRecord>,
  activated: Array<RouteRecord>,
  deactivated: Array<RouteRecord>
} {
  let i
  const max = Math.max(current.length, next.length)
  for (i = 0; i < max; i++) {
    // 两组路由记录，同时向后一项一项进行比较，如果遇到不相同的话，就停止向后，获取此时的下标值
    if (current[i] !== next[i]) {
      break
    }
  }
  // 例如：
  // current:[recored1,recored2,recored3, recored7,recored8]
  // next:   [recored1,recored2,recored3, recored4,recored5,recored6]
  return {
    // 两组路由记录，第 0 到 i 个路由记录是相同的，
    // 所以 next 中第 0 到 i 个需要更新
    updated: next.slice(0, i),    // [recored1,recored2,recored3]
    // next 中 i 之后的所有路由记录被激活
    activated: next.slice(i),     // [recored4,recored5,recored6]
    // current 第 i 之后的所有路由记录变成非激活状态
    deactivated: current.slice(i) // [recored7,recored8]
  }
}

function extractGuards (
  records: Array<RouteRecord>,
  name: string,
  bind: Function,
  reverse?: boolean
): Array<?Function> {
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    const guard = extractGuard(def, name)
    if (guard) {
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  })
  return flatten(reverse ? guards.reverse() : guards)
}

function extractGuard (
  def: Object | Function,
  key: string
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') {
    // extend now so that global mixins are applied.
    def = _Vue.extend(def)
  }
  return def.options[key]
}

function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}

function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}

function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    return function boundRouteGuard () {
      return guard.apply(instance, arguments)
    }
  }
}

function extractEnterGuards (
  activated: Array<RouteRecord>
): Array<?Function> {
  return extractGuards(
    activated,
    'beforeRouteEnter',
    (guard, _, match, key) => {
      return bindEnterGuard(guard, match, key)
    }
  )
}

function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string
): NavigationGuard {
  return function routeEnterGuard (to, from, next) {
    return guard(to, from, cb => {
      if (typeof cb === 'function') {
        if (!match.enteredCbs[key]) {
          match.enteredCbs[key] = []
        }
        match.enteredCbs[key].push(cb)
      }
      next(cb)
    })
  }
}
