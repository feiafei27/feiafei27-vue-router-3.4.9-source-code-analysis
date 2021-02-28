/* @flow */

import { createRoute, isSameRoute, isIncludedRoute } from '../util/route'
import { extend } from '../util/misc'
import { normalizeLocation } from '../util/location'
import { warn } from '../util/warn'

// work around weird flow bug
const toTypes: Array<Function> = [String, Object]
const eventTypes: Array<Function> = [String, Array]

const noop = () => {}

// 对应的官网内容：https://router.vuejs.org/zh/api/#router-link
export default {
  name: 'RouterLink',
  props: {
    to: {
      type: toTypes,
      required: true
    },
    tag: {
      type: String,
      default: 'a'
    },
    exact: Boolean,
    append: Boolean,
    replace: Boolean,
    // 链接激活时使用的 CSS 类名
    activeClass: String,
    // 链接被精确匹配的时候应该激活的 class
    exactActiveClass: String,
    ariaCurrentValue: {
      type: String,
      default: 'page'
    },
    // 可以用来触发导航的事件
    // 可以是一个字符串或是一个包含字符串的数组
    event: {
      type: eventTypes,
      default: 'click'
    }
  },
  render (h: Function) {
    // 获取路由器，这个变量是 VueRouter 的实例
    const router = this.$router
    // 获取当前的路由
    const current = this.$route
    const { location, route, href } = router.resolve(
      this.to,
      current,
      this.append
    )

    // 构建 class 对象，这个对象会被放置 data 中，
    // 有关 data 的介绍看这里：https://cn.vuejs.org/v2/guide/render-function.html#深入数据对象
    const classes = {}
    // 获取用户在 new VueRouter({}) 时传递的 linkActiveClass 配置
    // 有关 linkActiveClass 配置的官网介绍：https://router.vuejs.org/zh/api/#linkactiveclass
    const globalActiveClass = router.options.linkActiveClass
    // 获取用户在 new VueRouter({}) 时传递的 linkExactActiveClass 配置
    // 有关 linkExactActiveClass 配置的官网介绍：https://router.vuejs.org/zh/api/#linkexactactiveclass
    const globalExactActiveClass = router.options.linkExactActiveClass

    // Support global empty active class
    const activeClassFallback =
      // 如果全局配置的 ActiveClass 为 null 的话，返回默认的 ActiveClass（router-link-active）
      globalActiveClass == null ? 'router-link-active' : globalActiveClass
    const exactActiveClassFallback =
      // 如果全局配置的 ExactActiveClass 为 null 的话，返回默认的 ExactActiveClass（router-link-exact-active）
      globalExactActiveClass == null ? 'router-link-exact-active' : globalExactActiveClass

    // 上面处理的是全局的 ActiveClass 和 ExactActiveClass，下面处理局部的 ActiveClass 和 ExactActiveClass
    // 局部配置的更加优先
    const activeClass =
      // 如果没有配置局部的 activeClass 的话，就使用全局配置的或者默认的，否则的话，使用局部配置的 activeClass
      this.activeClass == null ? activeClassFallback : this.activeClass
    const exactActiveClass =
      // 如果没有配置局部的 exactActiveClass 的话，就使用全局配置的或者默认的，否则的话，使用局部配置的 exactActiveClass
      this.exactActiveClass == null ? exactActiveClassFallback : this.exactActiveClass

    const compareTarget = route.redirectedFrom
      ? createRoute(null, normalizeLocation(route.redirectedFrom), null, router)
      : route

    // Vue官网中有关：渲染函数 --> 深入数据对象 --> class 部分的介绍如下：
    // {
    //   // 与 `v-bind:class` 的 API 相同，
    //   // 接受一个字符串、对象或字符串和对象组成的数组
    //   'class': {
    //     foo: true,
    //     bar: false
    //   }
    // }
    // 也就是说这里的 classes 应该是一个对象，key 是类名，value 是一个布尔值，该布尔值指示渲染出来的元素是否应用这个类
    // isSameRoute() 函数用于判断当前的路由和该 RouterLink 要跳转的路由是不是同一路由，
    // 如果是的话，exactActiveClass 就要被设置为 true，因为此时该 RouterLink 是被精确匹配的。
    classes[exactActiveClass] = isSameRoute(current, compareTarget)
    // 对应官网：https://router.vuejs.org/zh/api/#exact
    // 配置 activeClass 类名是否精确匹配，如果 exact 设置为 true 的话，activeClass 只有在当前路由和该 RouterLink 要跳转的路由相同的时候才会被激活
    // 如果 exact 设置为 false 的话，activeClass 将会遵循包含匹配的规则。
    // 例如：当前的路由是 /foo/bar，该 RouterLink 的路由是 /foo，虽然两个路由并不相同，但该 RouterLink 的 activeClass 类依然会被激活
    classes[activeClass] = this.exact
      ? classes[exactActiveClass]
      // 该函数用于检测 current 路由是不是 target 路由的子路由。例如：/foo/bar 就是 /foo 的子路由
      : isIncludedRoute(current, compareTarget)

    const ariaCurrentValue = classes[exactActiveClass] ? this.ariaCurrentValue : null

    // 接下来是渲染元素事件的处理
    // https://router.vuejs.org/zh/api/#event
    // https://cn.vuejs.org/v2/guide/render-function.html#深入数据对象
    const handler = e => {
      if (guardEvent(e)) {
        if (this.replace) {
          router.replace(location, noop)
        } else {
          router.push(location, noop)
        }
      }
    }

    const on = { click: guardEvent }
    // 判断 this.event 是不是数组
    if (Array.isArray(this.event)) {
      // 如果是数组的话，遍历该数组，将数组中的所有事件字符串都添加到 on 对象中
      this.event.forEach(e => {
        // 事件执行的函数都是 handler
        on[e] = handler
      })
    } else {
      // 如果不是数组的话，说明只是一个字符串，将其添加到 on 对象中即可
      on[this.event] = handler
    }

    // 这个 data 是渲染函数 h 的第二个参数，将 class 设置进去
    const data: any = { class: classes }

    // 这一段对应：https://router.vuejs.org/zh/api/#v-slot-api-3-1-0-%E6%96%B0%E5%A2%9E
    // https://cn.vuejs.org/v2/api/#v-slot
    // 也可以通过 this.$scopedSlots 访问作用域插槽，每个作用域插槽都是一个返回若干 VNode 的函数：
    const scopedSlot =
      !this.$scopedSlots.$hasNormal &&
      this.$scopedSlots.default &&
      // default 是一个函数，它的返回值是 Array<VNode>，由于返回值是 Array<VNode>，
      // 所以可以直接 return 其中的 VNode，表示该 RouterLink 组件应该渲染这个 VNode，其实 h() 函数的返回值就是一个 VNode。
      // default 函数的参数是该组件暴露向子组件的内部属性，具体使用看上面的第一个链接
      this.$scopedSlots.default({
        href,
        route,
        navigate: handler,
        isActive: classes[activeClass],
        isExactActive: classes[exactActiveClass]
      })

    // 如果 scopedSlot 属性为 true 的话，
    // 说明的确有渲染了的子组件，此时就意味着不用渲染后面的什么 a 标签了，渲染 RouterLink 的这个子组件即可
    if (scopedSlot) {
      // 如果 RouterLink 的子组件只有一个的话，例如：
      // <router-link>
      //   <single-children>xxxx</single-children>
      // </router-link>
      // 直接 return scopedSlot[0] 即可
      if (scopedSlot.length === 1) {
        return scopedSlot[0]
      } else if (scopedSlot.length > 1 || !scopedSlot.length) {
        // 如果 RouterLink 有多个子组件的话，例如：
        // <router-link>
        //   <single-children1>xxxx</single-children>
        //   <single-children2>xxxx</single-children>
        //   <single-children3>xxxx</single-children>
        // </router-link>
        // 此时 VueRouter 会将他们包装在一个单独的 span 元素中

        // 如果 scopedSlot 数组的长度为 0 的话，该 RouterLink 组件就什么都不渲染
        if (process.env.NODE_ENV !== 'production') {
          warn(
            false,
            `RouterLink with to="${
              this.to
            }" is trying to use a scoped slot but it didn't provide exactly one child. Wrapping the content with a span element.`
          )
        }
        // 如果 scopedSlot 的长度为 0 的话，不用渲染任何东西，否则的话，渲染一个 span 元素，
        // 并将多个子组件都放在这个 span 元素中
        return scopedSlot.length === 0 ? h() : h('span', {}, scopedSlot)
      }
    }

    // 代码执行到这，说明 RouterLink 组件内并没有子组件，RouterLink 组件需要渲染成 a 元素或者用户自定义的元素
    // 渲染默认的 a 元素
    if (this.tag === 'a') {
      // 将 on 和 attrs 添加到 data 中
      data.on = on
      data.attrs = { href, 'aria-current': ariaCurrentValue }
    } else {
      // 下面对应用户自定义的标签不是 a 元素的情况
      // this.$slots 是一个对象，对应官网内容：https://cn.vuejs.org/v2/api/#vm-slots。
      // 该对象的类型是：{ [name: string]: ?Array<VNode> }；this.$slots.default 的类型是 Array<VNode>
      // findAnchor 函数的作用是：找到默认插槽中的第一个 a 子元素，将事件和属性添加到上面
      const a = findAnchor(this.$slots.default)
      if (a) {
        // in case the <a> is a static node
        a.isStatic = false
        const aData = (a.data = extend({}, a.data))
        aData.on = aData.on || {}
        // transform existing events in both objects into arrays so we can push later
        for (const event in aData.on) {
          const handler = aData.on[event]
          if (event in on) {
            aData.on[event] = Array.isArray(handler) ? handler : [handler]
          }
        }
        // append new listeners for router-link
        for (const event in on) {
          if (event in aData.on) {
            // on[event] is always a function
            aData.on[event].push(on[event])
          } else {
            aData.on[event] = handler
          }
        }

        const aAttrs = (a.data.attrs = extend({}, a.data.attrs))
        aAttrs.href = href
        aAttrs['aria-current'] = ariaCurrentValue
      } else {
        // doesn't have <a> child, apply listener to self
        // 如果没有找到 a 元素的话，将事件直接添加到生成的 this.tag 元素上面
        data.on = on
      }
    }

    // 渲染 this.tag 元素
    return h(this.tag, data, this.$slots.default)
  }
}

function guardEvent (e) {
  // don't redirect with control keys
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return
  // don't redirect when preventDefault called
  if (e.defaultPrevented) return
  // don't redirect on right click
  if (e.button !== undefined && e.button !== 0) return
  // don't redirect if `target="_blank"`
  if (e.currentTarget && e.currentTarget.getAttribute) {
    const target = e.currentTarget.getAttribute('target')
    if (/\b_blank\b/i.test(target)) return
  }
  // this may be a Weex event which doesn't have this method
  if (e.preventDefault) {
    e.preventDefault()
  }
  return true
}

// children 的类型是 Array<VNode>，
// findAnchor 函数的作用是找到这些元素中的第一个 a 元素
function findAnchor (children) {
  if (children) {
    let child
    // 遍历 children
    for (let i = 0; i < children.length; i++) {
      // 获取 children 中的每一个元素，其类型是 VNode
      child = children[i]
      // 如果该 VNode 的类型是 a 的话，直接返回该 VNode
      if (child.tag === 'a') {
        return child
      }
      // 获取该 VNode 的子元素（child.children），其类型也是 Array<VNode>，利用递归一层一层的找 a 元素
      if (child.children && (child = findAnchor(child.children))) {
        return child
      }
    }
  }
}
