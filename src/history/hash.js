/* @flow */

import type Router from '../index'
import { History } from './base'
import { cleanPath } from '../util/path'
import { getLocation } from './html5'
import { setupScroll, handleScroll } from '../util/scroll'
import { pushState, replaceState, supportsPushState } from '../util/push-state'

export class HashHistory extends History {
  constructor (router: Router, base: ?string, fallback: boolean) {
    super(router, base)
    // check history fallback deeplinking
    if (fallback && checkFallback(this.base)) {
      return
    }
    ensureSlash()
  }

  // 该函数用于设置 popstate 或者 hashchange window事件监听器
  // 设置这个事件监听器的作用是：当用户直接在浏览器地址栏改变 url 时，设置的事件监听器将会触发，在触发执行的函数中执行 transitionTo() 函数进行路由的转换
  setupListeners () {
    // 如果 this.listeners 数组的长度大于 0 的话，说明事件监听器已经设置了，在这里直接 return，防止多次设置
    if (this.listeners.length > 0) {
      return
    }

    const router = this.router
    const expectScroll = router.options.scrollBehavior
    const supportsScroll = supportsPushState && expectScroll

    if (supportsScroll) {
      this.listeners.push(setupScroll())
    }

    // popstate 或者 hashchange 事件触发时，会执行的回调函数。
    const handleRoutingEvent = () => {
      const current = this.current
      if (!ensureSlash()) {
        return
      }
      // 每当路由改变的时候，执行 this.transitionTo() 函数进行路由的切换
      this.transitionTo(getHash(), route => {
        if (supportsScroll) {
          handleScroll(this.router, route, current, true)
        }
        if (!supportsPushState) {
          replaceHash(route.fullPath)
        }
      })
    }
    // 即使设置的 VueRouter 的导航模式是 hash，但如果浏览器支持 pushState API 的话，还是使用 popstate 事件进行监听
    const eventType = supportsPushState ? 'popstate' : 'hashchange'
    // 给 window 添加事件监听器
    window.addEventListener(
      eventType,
      handleRoutingEvent
    )
    // 向 this.listeners 数组中添加函数，这个函数的所用是移除上面设置的监听器
    this.listeners.push(() => {
      window.removeEventListener(eventType, handleRoutingEvent)
    })
  }

  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(
      location,
      route => {
        pushHash(route.fullPath)
        handleScroll(this.router, route, fromRoute, false)
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(
      location,
      route => {
        replaceHash(route.fullPath)
        handleScroll(this.router, route, fromRoute, false)
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  go (n: number) {
    window.history.go(n)
  }

  // 该函数用于确保当前 Route 的路径和当前浏览器位置栏中的路径是相同的，
  // 如果不相同的话，更新浏览器位置栏中路路径
  ensureURL (push?: boolean) {

    const current = this.current.fullPath
    if (getHash() !== current) {
      push ? pushHash(current) : replaceHash(current)
    }
  }

  // 获取 url 中的路径部分
  getCurrentLocation () {
    return getHash()
  }
}

function checkFallback (base) {
  const location = getLocation(base)
  if (!/^\/#/.test(location)) {
    window.location.replace(cleanPath(base + '/#' + location))
    return true
  }
}

function ensureSlash (): boolean {
  const path = getHash()
  if (path.charAt(0) === '/') {
    return true
  }
  replaceHash('/' + path)
  return false
}

// 获取 url 中的 hash 部分
export function getHash (): string {
  // 获取整个 url
  let href = window.location.href
  // 计算 '#' 符号的下标
  const index = href.indexOf('#')
  // 如果整个 url 没有 '#' 符号的话，说明这个 url 没有 hash 字符串
  if (index < 0) return ''

  // 获取 href 中 # 符号后面的字符串，也就是 hash 的内容
  href = href.slice(index + 1)

  // 返回 hash 字符串
  return href
}

function getUrl (path) {
  const href = window.location.href
  const i = href.indexOf('#')
  const base = i >= 0 ? href.slice(0, i) : href
  return `${base}#${path}`
}

function pushHash (path) {
  if (supportsPushState) {
    pushState(getUrl(path))
  } else {
    window.location.hash = path
  }
}

function replaceHash (path) {
  if (supportsPushState) {
    replaceState(getUrl(path))
  } else {
    window.location.replace(getUrl(path))
  }
}
